// The Beer Depot — live stock from KORONA Studio
// ------------------------------------------------
// The website calls /api/stock. This function logs into the KORONA Cloud API v3
// with a READ-ONLY API login (kept in Netlify's private environment variables),
// reads products + stock, and returns only what the public site needs:
//   { updated, items: [ { name, section, inStock } ] }
// No quantities, costs or logins ever reach the browser.
//
// Results are cached at the edge for 60 seconds, so KORONA is asked at most
// about once a minute no matter how many people are on the site.

// ---------- Which KORONA commodity groups go in which website section ----------
// Each product's commodity group (and its parent groups) is checked against these
// patterns, most specific group first. First match wins. Groups that match nothing
// (tobacco, vapes, snacks, etc.) are left off the website.
const SECTION_RULES = [
  ["seltzer", /seltzer/i],
  ["cocktails", /ready[\s-]*to[\s-]*drink|\brtd\b|cocktail/i],
  ["vodka",   /vodka/i],
  ["gin",     /\bgin\b/i],
  ["rum",     /\brum\b/i],
  ["whiskey", /whisk|bourbon|scotc|\brye\b/i],
  ["tequila", /tequi|mezcal/i],
  ["brandy",  /brandy|cognac/i],
  ["liqueur", /liqueur|liqour|liquo|cordial|schna|vermo/i],
  ["wine",    /wine|champagne|prosecco|\bsake\b/i],
  ["beer",    /beer|\bales?\b|lager|\bipa\b|craft|domestic|import|malt/i],
  ["local",   /bacon|beef|jerky|summer|sausage|\bsticks?\b/i],
  ["food",    /food|deli|kitchen|smoked|smokehouse|meat|made here|prepared|hot case/i],
  ["outdoor", /charcoal|pellet|firewood|lighter fluid|propane|grill|outside|outdoor|\bice\b(?!\s*cream)/i],
];
// Groups that never appear on the site, even if a pattern above matches:
// tobacco/vapes (kept off on purpose), plus root beer and ginger beer (sodas).
const BLOCK_RULES = /tobacco|cigar|cigarette|smokes\b|vape|vapor|e-?cig|nicotine|pouch|hemp|cbd|thc|kratom|root beer|ginger beer/i;
// If a KORONA group name isn't caught by the patterns, add it here exactly as it
// appears in KORONA Studio, e.g. { "Spirits - Clear": "vodka" }.
const SECTION_BY_GROUP = {};

// ---------- KORONA API ----------
const HOST = process.env.KORONA_HOST || "185.koronacloud.com";
const ACCOUNT = process.env.KORONA_ACCOUNT_ID;
const AUTH = "Basic " + Buffer.from(`${process.env.KORONA_USER}:${process.env.KORONA_PASSWORD}`).toString("base64");
const BASE = `https://${HOST}/web/api/v3/accounts/${ACCOUNT}`;
const PAGE_SIZE = 500;

async function getJson(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: AUTH, Accept: "application/json" } });
  if (!res.ok) {
    const err = new Error(`KORONA ${res.status} on ${path}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Reads every page of a KORONA list, a few pages at a time.
async function getAll(path, params = {}) {
  const first = await getJson(path, { ...params, page: 1, size: PAGE_SIZE });
  const results = [...(first.results || [])];
  const pages = first.pagesTotal || 1;
  const rest = [];
  for (let p = 2; p <= pages; p++) rest.push(p);
  while (rest.length) {
    const batch = rest.splice(0, 5);
    const lists = await Promise.all(batch.map(p => getJson(path, { ...params, page: p, size: PAGE_SIZE })));
    for (const l of lists) results.push(...(l.results || []));
  }
  return results;
}

function sectionFor(groupId, groups) {
  const chain = [];
  for (let id = groupId, guard = 0; id && groups[id] && guard < 10; guard++) {
    chain.push(groups[id].name || "");
    id = groups[id].parent;
  }
  if (chain.some(n => BLOCK_RULES.test(n))) return null;
  for (const name of chain) {            // most specific group first
    if (SECTION_BY_GROUP[name]) return SECTION_BY_GROUP[name];
    for (const [section, re] of SECTION_RULES) if (re.test(name)) return section;
  }
  return null;
}

export async function buildStock() {
  // 1. Commodity groups (for sections)
  const groupList = await getAll("/commodityGroups");
  const groups = {};
  for (const g of groupList) groups[g.id] = { name: g.name, parent: g.parentCommodityGroup?.id };

  // 2. Stock levels from every location that has a warehouse (or just one, if set)
  let units = await getAll("/organizationalUnits");
  if (process.env.KORONA_ORG_UNIT) {
    const want = process.env.KORONA_ORG_UNIT.toLowerCase();
    units = units.filter(u => u.id === process.env.KORONA_ORG_UNIT || (u.name || "").toLowerCase() === want || String(u.number) === process.env.KORONA_ORG_UNIT);
  }
  const stockByProduct = new Map(); // productId -> total on hand
  for (const u of units) {
    let rows;
    try { rows = await getAll(`/organizationalUnits/${u.id}/productStocks`); }
    catch (e) { if (e.status >= 400 && e.status < 500) continue; throw e; } // location without a warehouse
    for (const r of rows) {
      const id = r.product?.id;
      if (!id) continue;
      stockByProduct.set(id, (stockByProduct.get(id) || 0) + (Number(r.amount?.actual) || 0));
    }
  }

  // 3. Products
  const products = await getAll("/products");
  const items = [];
  const report = { products: products.length, withStockRecord: stockByProduct.size, shown: 0, skippedNeverStocked: 0, skippedNoSection: 0, unmatchedGroups: {}, sections: {}, groups: {} };
  const tally = (gname, section, key) => {
    const g = (report.groups[gname] ||= { section: section || "(hidden)", products: 0, shown: 0 });
    g[key]++;
  };
  for (const p of products) {
    if (p.active === false || p.deactivated) continue;
    const section = sectionFor(p.commodityGroup?.id, groups);
    if (!section) {
      const gname = groups[p.commodityGroup?.id]?.name || "(no group)";
      report.unmatchedGroups[gname] = (report.unmatchedGroups[gname] || 0) + 1;
      tally(gname, null, "products");
      report.skippedNoSection++;
      continue;
    }
    const gname = groups[p.commodityGroup?.id]?.name || "(no group)";
    tally(gname, section, "products");
    const onHand = stockByProduct.get(p.id);
    // "Has ever had stock": it has a stock record AND it was received at some point
    // (has a purchase price) or has moved (on-hand isn't exactly zero).
    const everStocked = onHand !== undefined && (onHand !== 0 || Number(p.lastPurchasePrice) > 0);
    if (!everStocked) { report.skippedNeverStocked++; continue; }
    items.push({ name: (p.name || "").trim(), section, inStock: onHand > 0 });
    tally(gname, section, "shown");
    report.sections[section] = (report.sections[section] || 0) + 1;
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  report.shown = items.length;
  return { items, report };
}

export default async (req) => {
  const missing = ["KORONA_ACCOUNT_ID", "KORONA_USER", "KORONA_PASSWORD"].filter(k => !process.env[k]);
  if (missing.length) {
    return Response.json({ error: "KORONA login is not set up yet.", missing }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const url = new URL(req.url);
  const wantReport = url.searchParams.get("report") && url.searchParams.get("report") === process.env.REPORT_KEY;
  try {
    const { items, report } = await buildStock();
    const body = wantReport ? { updated: new Date().toISOString(), report }
                            : { updated: new Date().toISOString(), items };
    return Response.json(body, {
      headers: wantReport ? { "Cache-Control": "no-store" } : {
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Netlify-CDN-Cache-Control": "public, durable, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not read stock from KORONA." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
};

export const config = { path: "/api/stock" };
