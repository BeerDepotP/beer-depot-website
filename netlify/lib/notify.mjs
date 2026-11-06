// Back in Stock emails: shared helpers.
// Blobs "notify"       = { wants: { key: { name, people: { email: { at } } } }, tokens: { email: token } }
// Blobs "notify-state" = { on, delayMin, inSince: { key: ms }, sent: [ { at, name, count } ] }
// Keys: "k:<product name>" = KORONA product, "f:<name>" = Made Here / Local Favorites switch (In Stock only when switched on),
//       "o:<name>" = Grilling & Outdoor switch (In Stock unless switched off).
export const DEFAULT_STATE = { on: true, delayMin: 60, inSince: {}, sent: [] };
export const loadState = async store => ({ ...DEFAULT_STATE, ...((await store.get("notify-state", { type: "json" })) || {}) });
export const loadWants = async store => (await store.get("notify", { type: "json" })) || { wants: {}, tokens: {} };

// true / false, or null when we can't tell right now
export async function isIn(store, key, stock) {
  const kind = key.slice(0, 2), name = key.slice(2);
  if (kind === "k:") {
    if (!stock) return null;
    const hits = stock.items.filter(i => i.name === name);
    return hits.length ? hits.some(i => i.inStock) : null;
  }
  const sw = ((await store.get("food-stock", { type: "json" })) || { items: {} }).items || {};
  return kind === "f:" ? sw[name] === true : sw[name] !== false;
}
