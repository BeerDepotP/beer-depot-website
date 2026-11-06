// Drinks from KORONA: hide one from the website or move it to another section (Store Tools → Drinks).
// Blob "product-rules" = { hide: { "<KORONA product name>": true }, move: { "<name>": "<section id>" } }. stock.mjs applies them;
// they win over KORONA tags and groups. Saving rebuilds the stock list right away.
// POST /api/products { pin, action:"list" | "hide" | "unhide" | "move" | "unmove", name, section }
import { getStore } from "@netlify/blobs";
import { checkPin, json } from "../lib/pin.mjs";
import { DRINKS } from "../lib/layout.mjs";
import { refreshSaved } from "./stock.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const bad = await checkPin(store, b.pin, "drinks", b);
  if (bad) return json({ error: bad.error }, bad.status);
  const r = (await store.get("product-rules", { type: "json" })) || { hide: {}, move: {} };
  r.hide = r.hide || {}; r.move = r.move || {};
  const layout = (await store.get("layout", { type: "json" })) || { items: [] };
  const sections = { ...DRINKS };
  for (const it of layout.items || []) { if (it.custom) sections[it.id] = it.name; else if (it.name && sections[it.id]) sections[it.id] = it.name; }
  const name = String(b.name || "").trim().slice(0, 200);
  if (b.action !== "list") {
    if (!name) return json({ error: "Bad request." }, 400);
    if (b.action === "hide") { r.hide[name] = true; delete r.move[name]; }
    else if (b.action === "unhide") delete r.hide[name];
    else if (b.action === "move") { if (!sections[b.section]) return json({ error: "Pick a section." }, 400); r.move[name] = b.section; }
    else if (b.action === "unmove") delete r.move[name];
    else return json({ error: "Bad request." }, 400);
    r.updated = new Date().toISOString();
    await store.setJSON("product-rules", r);
    const job = refreshSaved(store).catch(e => console.error("rules refresh", e));
    if (context && typeof context.waitUntil === "function") context.waitUntil(job);
  }
  return json({ ok: true, hide: Object.keys(r.hide).sort(), move: r.move, sections });
};

export const config = { path: "/api/products" };
