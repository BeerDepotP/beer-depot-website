// The Beer Depot — On Sale section (edited in Store Tools → Sales)
// GET  /api/sales                       -> { on, items:[{id,name,price,was,note,photo}], updated }  (items only when on)
// GET  /api/sales?photo=<id>            -> the item's photo (JPEG)
// POST /api/sales { pin, action:"list" }                     -> everything, even when off (Store Tools)
// POST /api/sales { pin, action:"save", on, items }           -> saves the list and the on/off switch
// POST /api/sales { pin, action:"photo", id, data }           -> saves a photo (data = base64 JPEG, made small in the browser)
// Saved in Netlify Blobs, so changes need no deploy.

import { getStore } from "@netlify/blobs";
import { checkPin, json } from "../lib/pin.mjs";

const KEY = "sales";
const MAX_ITEMS = 24;
const MAX_PHOTO = 600 * 1024;            // bytes, after decoding
const money = v => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return isFinite(n) && n > 0 ? n.toFixed(2) : ""; };
const clean = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

export default async (req) => {
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const pid = url.searchParams.get("photo");
    if (pid) {
      const buf = await store.get("sale-photo-" + pid.replace(/[^a-z0-9]/gi, ""), { type: "arrayBuffer" });
      if (!buf) return new Response("Not found", { status: 404 });
      return new Response(buf, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
    }
    const d = (await store.get(KEY, { type: "json" })) || { on: false, items: [] };
    return json(d.on ? { on: true, items: d.items || [], updated: d.updated } : { on: false, items: [] });
  }
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const bad = await checkPin(store, body.pin);
  if (bad) return json({ error: bad.error }, bad.status);
  const cur = (await store.get(KEY, { type: "json" })) || { on: false, items: [] };

  if (body.action === "photo") {
    const id = String(body.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 24);
    const b64 = String(body.data || "").replace(/^data:image\/\w+;base64,/, "");
    if (!id || !b64) return json({ error: "Bad photo." }, 400);
    const buf = Buffer.from(b64, "base64");
    if (buf.length > MAX_PHOTO) return json({ error: "That photo is too big. Try a smaller one." }, 400);
    const ver = Date.now().toString(36);
    await store.set("sale-photo-" + id + ver, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    return json({ ok: true, photo: id + ver });
  }

  if (body.action === "save") {
    if (!Array.isArray(body.items)) return json({ error: "Bad request." }, 400);
    const items = body.items.slice(0, MAX_ITEMS).map(it => ({
      id: String(it.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 24) || Math.random().toString(36).slice(2, 10),
      name: clean(it.name, 80),
      price: money(it.price),
      was: money(it.was),
      note: clean(it.note, 80),
      photo: String(it.photo || "").replace(/[^a-z0-9]/gi, "").slice(0, 40),
    })).filter(it => it.name && it.price);
    const data = { on: !!body.on, items, updated: new Date().toISOString() };
    await store.setJSON(KEY, data);
    return json({ ok: true, ...data });
  }

  return json({ ok: true, on: !!cur.on, items: cur.items || [], updated: cur.updated });
};

export const config = { path: "/api/sales" };
