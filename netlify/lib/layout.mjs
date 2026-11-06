// Website buttons (top bar and Browse side menu): the order, names, on/off and KORONA group links set in Store Tools → Layout.
// Blob "layout" = { items: [ { id, name?, off?, custom?, open?, groups?: [KORONA group names] } ], updated }
// Built-in ids (the website's own sections) and what they are called until renamed. Keep in step with tools/index.template.html.
export const STATIC = { "made-here": "Made Here", "on-sale": "On Sale", "seasonal": "Seasonal", "local-favorites": "Local Favorites", "grilling-outdoor": "Grilling & Outdoor", "new-arrivals": "New Arrivals" };
export const DRINKS = { cocktails: "Ready to Drink Cocktails", beer: "Beer", nonalc: "Non-Alcoholic", seltzer: "Hard Seltzers", thc: "THC", whiskey: "Whiskey & Bourbon", wine: "Wine", tequila: "Tequila", vodka: "Vodka", brandy: "Brandy", gin: "Gin", rum: "Rum", liqueur: "Liqueur", mixers: "Soda & Mixers" };
export const DEFAULT_ORDER = [...Object.keys(STATIC), ...Object.keys(DRINKS)];
const one = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const title = s => s.replace(/(^|[\s(\-/])([a-z])/g, (m, a, b) => a + b.toUpperCase());

// Cleans what Store Tools sends. Returns { items } or { error }.
export function cleanLayout(input) {
  if (!Array.isArray(input)) return { error: "Bad request." };
  const seen = new Set(), items = [];
  for (const x of input.slice(0, 60)) {
    const id = one(x && x.id, 24);
    const builtin = id in STATIC || id in DRINKS, custom = /^c-[a-z0-9]{3,20}$/.test(id);
    if (!(builtin || custom) || seen.has(id)) continue;
    seen.add(id);
    const it = { id };
    const name = title(one(x.name, 40));
    if (custom) { if (!name) return { error: "Each new button needs a name." }; it.custom = true; it.open = !!x.open; }
    if (name) it.name = name;
    if (id === "seasonal") delete it.name;                      // named in the Seasonal tab
    if (x.off) it.off = true;
    if (!(id in STATIC)) it.groups = [...new Set((Array.isArray(x.groups) ? x.groups : []).map(g => one(g, 80)).filter(Boolean))].slice(0, 25);
    items.push(it);
  }
  return { items };
}
