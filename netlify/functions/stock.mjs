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
  ["nonalc",  /non[\s\-_]*al|\bn\s*\/\s*a\b|\bna\s+(beer|wine|spirit)|zero[\s-]*proof|alcohol[\s-]*free|no[\s-]*alc/i],   // checked first
  ["thc",     /\bthc\b|hemp|delta[\s-]*[89]|cbd/i],
  ["mixers",  /vermo|vurmu|vermu|energy|\bsodas?\b|\bpop\b|juice|\bmix\b|mixers?|\bwaters?\b|tonic|club soda|ginger beer|root beer|ginger ale|bitters|grenadine|bloody|margarita|paloma|other mix|old[\s-]*fashion|sour mix|cocktail mix|sparkling water|seltzer water/i],
  ["seltzer", /seltz/i],
  ["cocktails", /ready[\s-]*to[\s-]*drink|\brtd\b|cockt/i],
  ["vodka",   /vodk/i],
  ["gin",     /\bgin\b/i],
  ["rum",     /\brum\b/i],
  ["whiskey", /whisk|bourb|scotc|\brye\b/i],
  ["tequila", /tequi|mezca/i],
  ["brandy",  /brand|cogna/i],
  ["liqueur", /liqueur|liqour|liquo|cordi|schna/i],
  ["wine",    /wine|champ|prose|\bsake\b/i],
  ["local",   /bacon|brat|jerky|beef st|sausa|chees|kreamer|kraemer|pernat|northern|patt|burger/i],
  ["food",    /food|deli|kitchen|smoked|smokehouse|meat|made here|prepared|hot case/i],
  ["outdoor", /charcoal|pellet|firewood|lighter fluid|propane|grill|outside|outdoor|\bice\b(?!\s*cream)/i],
  ["beer",    /beer|\bales?\b|lager|\bipa\b|craft|domes|impor|malt/i],
];
// Groups that never appear on the site, even if a pattern above matches:
// tobacco and vapes, kept off on purpose.
// Groups (or products) the owner has retired: anything named "DO NOT USE" is always skipped.
const RETIRED = /do\s*not\s*use|don'?t\s*use|\bdnu\b/i;
const BLOCK_RULES = /do\s*not\s*use|don'?t\s*use|\bdnu\b|tobacco|cigar|cigarette|smokes\b|vape|vapor|e-?cig|nicotine|pouch|kratom/i;
// If a KORONA group name isn't caught by the patterns, add it here exactly as it
// appears in KORONA Studio, e.g. { "Spirits - Clear": "vodka" }.
const SECTION_BY_GROUP = {};
// KORONA tags win over everything below. Tag a product in KORONA Studio with one of
// these names (capitals and spaces don't matter) to put it in that section, or with
// "Hide From Website" to keep it off the site.
const TAG_SECTIONS = {
  "ready to drink cocktails": "cocktails", "ready to drink": "cocktails", "cocktails": "cocktails", "rtd": "cocktails",
  "beer": "beer", "seltzer": "seltzer", "seltzers": "seltzer", "hard seltzer": "seltzer", "hard seltzers": "seltzer",
  "whiskey": "whiskey", "whisky": "whiskey", "bourbon": "whiskey", "whiskey and bourbon": "whiskey",
  "wine": "wine", "tequila": "tequila", "vodka": "vodka", "brandy": "brandy", "gin": "gin", "rum": "rum",
  "liqueur": "liqueur", "thc": "thc", "thc drinks": "thc", "mixers": "mixers", "mixer": "mixers", "soda": "mixers", "energy drinks": "mixers", "energy": "mixers", "vermouth": "mixers", "non alcoholic": "nonalc", "non-alcoholic": "nonalc", "na": "nonalc", "n a": "nonalc", "zero proof": "nonalc", "local favorites": "local", "local favorite": "local", "local": "local",
  "grilling and outdoor": "outdoor", "grilling": "outdoor", "outdoor": "outdoor",
};
// Non-Alcoholic is split into Beer / Wine / Spirits by these tags.
const NA_SUB_TAGS = { "n a beer": "beer", "na beer": "beer", "n a wine": "wine", "na wine": "wine",
  "n a spirits": "spirits", "na spirits": "spirits", "n a spirit": "spirits", "na spirit": "spirits" };
const HIDE_TAGS = new Set(["hide from website", "hide", "not on website", "no website"]);
// "Allocated Bourbon" puts a product in its own box beside Whiskey & Bourbon.
const ALLOCATED_TAGS = new Set(["allocated bourbon", "allocated", "allocated whiskey"]);
const tagKey = s => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

// Individual products that sit in the wrong KORONA group: product-name pattern -> section.
// These win over the group rules.
const SECTION_BY_PRODUCT = [
  [/bardstown/i, "whiskey"],
];

// ---------- New Arrivals ----------
// The first time a product shows up with stock, we note the date in Netlify Blobs.
// On the very first run every product that already has stock history is recorded
// as "old", so only products that arrive after launch count as new.
import { getStore } from "@netlify/blobs";
const NEW_DAYS = 14;     // default; Store Tools → Banners & Text → Settings can change it (Blob "site".settings.newDays)

async function markNewArrivals(items) {
  let store;
  try { store = getStore({ name: "beer-depot", consistency: "strong" }); } catch { return; } // Blobs not available
  const seen = (await store.get("first-stocked", { type: "json" })) || null;
  const now = Date.now();
  let newDays = NEW_DAYS;
  try { const n = Number((((await store.get("site", { type: "json" })) || {}).settings || {}).newDays); if (n >= 1 && n <= 90) newDays = n; } catch {}
  if (!seen) {
    const ids = {};
    for (const it of items) ids[it.id] = 0;
    await store.setJSON("first-stocked", { seeded: now, ids });
    return;
  }
  let changed = false;
  for (const it of items) {
    if (!(it.id in seen.ids)) {
      if (!it.inStock) continue;                 // only count it once it actually has stock
      seen.ids[it.id] = now; changed = true;
    }
    const t = seen.ids[it.id];
    if (t && now - t < newDays * 86400000 && it.inStock) it.isNew = true;
  }
  if (changed) await store.setJSON("first-stocked", seen);
}

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

function groupChain(groupId, groups) {
  const chain = [];
  for (let id = groupId, guard = 0; id && groups[id] && guard < 10; guard++) { chain.push(groups[id].name || ""); id = groups[id].parent; }
  return chain;
}

// Store Tools → Layout can link KORONA commodity groups to website buttons (Blobs "layout"): group name -> section id.
const normG = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
async function groupLinks() {
  try {
    const store = getStore({ name: "beer-depot", consistency: "strong" });
    const lay = await store.get("layout", { type: "json" });
    const links = {};
    for (const it of (lay && lay.items) || []) for (const g of it.groups || []) links[normG(g)] = it.id;
    return links;
  } catch { return {}; }
}

// Names of every KORONA commodity group (for the Store Tools → Layout picker).
export async function listGroupNames() {
  const list = await getAll("/commodityGroups");
  return [...new Set(list.map(g => (g.name || "").trim()).filter(n => n && !RETIRED.test(n)))].sort((a, b) => a.localeCompare(b));
}

function sectionFor(groupId, groups, links = {}) {
  const chain = [];
  for (let id = groupId, guard = 0; id && groups[id] && guard < 10; guard++) {
    chain.push(groups[id].name || "");
    id = groups[id].parent;
  }
  if (chain.some(n => BLOCK_RULES.test(n))) return null;
  for (const name of chain) {            // most specific group first
    if (links[normG(name)]) return links[normG(name)];     // linked in Store Tools
    if (SECTION_BY_GROUP[name]) return SECTION_BY_GROUP[name];
    for (const [section, re] of SECTION_RULES) if (re.test(name)) return section;
  }
  return null;
}

export async function buildStock() {
  const links = await groupLinks();
  let rules = { hide: {}, move: {} };     // Store Tools → Drinks: hide a product or move it to another section
  try { rules = { hide: {}, move: {}, ...((await getStore({ name: "beer-depot", consistency: "strong" }).get("product-rules", { type: "json" })) || {}) }; } catch {}
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

  // 3. Tags (names), then products
  let tagNames = {};
  try { for (const t of await getAll("/tags")) tagNames[t.id] = t.name; } catch (e) { console.error("tags", e.status || e); }
  const products = await getAll("/products");
  const items = [];
  const report = { products: products.length, withStockRecord: stockByProduct.size, shown: 0, skippedNeverStocked: 0, skippedNoSection: 0, unmatchedGroups: {}, sections: {}, groups: {} };
  const tally = (gname, section, key) => {
    const g = (report.groups[gname] ||= { section: section || "(hidden)", products: 0, shown: 0 });
    g[key]++;
  };
  for (const p of products) {
    if (p.active === false || p.deactivated) continue;
    if (RETIRED.test(p.name || "") || groupChain(p.commodityGroup?.id, groups).some(n => RETIRED.test(n))) {
      report.skippedDoNotUse = (report.skippedDoNotUse || 0) + 1; continue;
    }
    const pname = (p.name || "").trim();
    if (rules.hide[pname]) { report.hiddenInStoreTools = (report.hiddenInStoreTools || 0) + 1; continue; }
    const tags = (p.tags || []).map(t => tagKey(t.name || tagNames[t.id]));
    if (tags.some(t => HIDE_TAGS.has(t))) { report.hiddenByTag = (report.hiddenByTag || 0) + 1; continue; }
    const allocated = tags.some(t => ALLOCATED_TAGS.has(t));
    const naSub = tags.map(t => NA_SUB_TAGS[t]).find(Boolean);
    const tagSection = allocated ? "whiskey" : naSub ? "nonalc" : tags.map(t => TAG_SECTIONS[t]).find(Boolean);
    const override = SECTION_BY_PRODUCT.find(([re]) => re.test(p.name || ""));
    const section = rules.move[pname] || tagSection || (override ? override[1] : sectionFor(p.commodityGroup?.id, groups, links));
    if (tagSection) report.placedByTag = (report.placedByTag || 0) + 1;
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
    let sub;
    if (section === "mixers") {
      const g = groupChain(p.commodityGroup?.id, groups).join(" ").toLowerCase() + " " + tags.join(" ");
      sub = /vermo|vurmu|vermu/.test(g) ? "vermouth" : /bloody/.test(g) ? "bloody" : /margarita/.test(g) ? "margarita" : /old[\s-]*fashion/.test(g) ? "oldfashioned" : /energy/.test(g) ? "energy"
          : /tonic|club|ginger\s*ale|ginger\s*beer|seltz|sparkling/.test(g) ? "tonic" : /juice/.test(g) ? "juice" : /soda|\bpop\b|cola/.test(g) ? "soda" : "other";   // everything else, incl. the "Other Mixers" group
    }
    if (section === "nonalc") {
      sub = naSub;
      if (!sub) {   // no N/A tag: guess from the group name
        const g = groupChain(p.commodityGroup?.id, groups).join(" ").toLowerCase();
        sub = /wine|champ|prose/.test(g) ? "wine" : /spirit|liquo|whisk|vodk|gin|tequi|rum|zero proof/.test(g) ? "spirits" : /beer|brew|ipa|lager/.test(g) ? "beer" : undefined;
      }
    }
    // Soda always shows In Stock (and shows even without stock history in KORONA)
    const alwaysIn = section === "mixers" && sub === "soda";
    if (!everStocked && !alwaysIn) { report.skippedNeverStocked++; continue; }
    items.push({ id: p.id, name: (p.name || "").trim(), section, inStock: alwaysIn || onHand > 0, ...(allocated ? { allocated: true } : {}), ...(sub ? { sub } : {}) });
    tally(gname, section, "shown");
    report.sections[section] = (report.sections[section] || 0) + 1;
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  try { await markNewArrivals(items); } catch (e) { console.error("new arrivals", e); }
  report.shown = items.length;
  report.newArrivals = items.filter(i => i.isNew).length;
  for (const it of items) delete it.id;            // the website doesn't need KORONA ids
  return { items, report };
}

// ---------- Saved copy, so visitors never wait on KORONA ----------
// The latest stock list is kept in Netlify Blobs ("stock-latest"). Visitors get that
// copy instantly; if it's more than a minute old, a fresh one is built in the
// background (and stock-refresh.mjs also rebuilds it on a schedule).
const FRESH_MS = 60 * 1000;
const LOCK_MS = 90 * 1000;

function savedStore() {
  try { return getStore({ name: "beer-depot", consistency: "strong" }); } catch { return null; }
}

export async function refreshSaved(store = savedStore()) {
  if (!store) return null;
  const lock = await store.get("stock-refreshing", { type: "json" });
  if (lock && Date.now() - lock.at < LOCK_MS) return null;          // someone else is already refreshing
  await store.setJSON("stock-refreshing", { at: Date.now() });
  try {
    const { items } = await buildStock();
    const data = { updated: new Date().toISOString(), items };
    await store.setJSON("stock-latest", data);
    return data;
  } finally {
    await store.setJSON("stock-refreshing", { at: 0 });
  }
}

const headers = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=30, stale-while-revalidate=600",
};

export default async (req, context) => {
  const missing = ["KORONA_ACCOUNT_ID", "KORONA_USER", "KORONA_PASSWORD"].filter(k => !process.env[k]);
  if (missing.length) {
    return Response.json({ error: "KORONA login is not set up yet.", missing }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const url = new URL(req.url);
  const wantReport = url.searchParams.get("report") && url.searchParams.get("report") === process.env.REPORT_KEY;
  try {
    if (wantReport) {
      const { report } = await buildStock();
      return Response.json({ updated: new Date().toISOString(), report }, { headers: { "Cache-Control": "no-store" } });
    }
    const store = savedStore();
    const saved = store ? await store.get("stock-latest", { type: "json" }) : null;
    if (saved) {
      if (Date.now() - Date.parse(saved.updated) > FRESH_MS) {
        const job = refreshSaved(store).catch(e => console.error("refresh", e));
        if (context && typeof context.waitUntil === "function") context.waitUntil(job);
      }
      return Response.json(saved, { headers });
    }
    // first time ever: build it now and save it
    const data = (await refreshSaved(store)) || { updated: new Date().toISOString(), items: (await buildStock()).items };
    return Response.json(data, { headers });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not read stock from KORONA." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
};

export const config = { path: "/api/stock" };
