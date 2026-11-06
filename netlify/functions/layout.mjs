// Website buttons: order, names, on/off and the KORONA groups each one shows (Store Tools → Layout).
// GET  /api/layout                      -> { items: [ { id, name?, off?, custom?, open? } ] }   (no group names; the website only needs this)
// POST /api/layout { pin, action:"list" }  -> { items (with groups), groupNames, groupError? }
// POST /api/layout { pin, action:"save", items } -> saves, then rebuilds the stock list so the group links apply
// POST /api/layout { pin, action:"reset" }  -> back to the standard buttons
import { getStore } from "@netlify/blobs";
import { checkPin, json } from "../lib/pin.mjs";
import { cleanLayout, STATIC, DRINKS } from "../lib/layout.mjs";
import { listGroupNames, refreshSaved } from "./stock.mjs";

export default async (req, context) => {
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  const cur = (await store.get("layout", { type: "json" })) || { items: [] };
  if (req.method === "GET") return json({ items: cur.items.map(({ groups, ...rest }) => rest) });
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const bad = await checkPin(store, b.pin, "layout");
  if (bad) return json({ error: bad.error }, bad.status);

  let next = cur;
  if (b.action === "save" || b.action === "reset") {
    if (b.action === "reset") next = { items: [], updated: new Date().toISOString() };
    else {
      const c = cleanLayout(b.items);
      if (c.error) return json({ error: c.error }, 400);
      next = { items: c.items, updated: new Date().toISOString() };
    }
    await store.setJSON("layout", next);
    const job = refreshSaved(store).catch(e => console.error("layout refresh", e));
    if (context && typeof context.waitUntil === "function") context.waitUntil(job);
  }
  let groupNames = [], groupError = "";
  try { groupNames = await listGroupNames(); } catch (e) { groupError = "Couldn't read the KORONA groups right now."; }
  return json({ ok: true, items: next.items, groupNames, groupError, builtin: { ...STATIC, ...DRINKS } });
};

export const config = { path: "/api/layout" };
