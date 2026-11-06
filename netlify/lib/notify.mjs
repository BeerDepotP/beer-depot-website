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

// The words and extra boxes in the "Email Me When Back" pop-up (edited in Store Tools → Back in Stock), and the note in the email.
export const DEFAULT_FORM = {
  title: "Email Me When Back",
  intro: "We'll send you one email when it's back in stock.",
  button: "Email Me",
  thanks: "Got it! We'll email you when it's back.",
  emailNote: "Stop in or give us a call to grab it.",
  fields: [],        // extra boxes: [{ id, label, type: "text" | "tel", required }]
};
const one = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
export function cleanForm(f = {}) {
  const pick = (k, n, keepEmpty) => { const v = typeof f[k] === "string" ? one(f[k], n) : DEFAULT_FORM[k]; return v || (keepEmpty ? "" : DEFAULT_FORM[k]); };
  const fields = (Array.isArray(f.fields) ? f.fields : []).slice(0, 5).map((x, i) => ({
    id: "f" + (i + 1), label: one(x && x.label, 40), type: x && x.type === "tel" ? "tel" : "text", required: !!(x && x.required),
  })).filter(x => x.label);
  return { title: pick("title", 60), intro: pick("intro", 300, true), button: pick("button", 30), thanks: pick("thanks", 160), emailNote: pick("emailNote", 300, true), fields };
}
