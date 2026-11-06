// The Beer Depot — Seasonal section (edited in Store Tools → Seasonal)
// GET  /api/seasonal                       -> { on, title, items:[{id,name,price,note,photo}], updated }  (items only when on)
// GET  /api/seasonal?photo=<id>            -> the item's photo (JPEG)
// POST /api/seasonal { pin, action:"list" }                   -> everything, even when off (Store Tools)
// POST /api/seasonal { pin, action:"save", on, title, items } -> saves the list, the name and the on/off switch
// POST /api/seasonal { pin, action:"photo", id, data }        -> saves a photo (data = base64 JPEG, made small in the browser)
// The name (title) shows on the website's menu bar, the 3-line Browse menu and the section heading.
// Saved in Netlify Blobs, so changes need no deploy.

import { getStore } from "@netlify/blobs";
import { checkPin, json } from "../lib/pin.mjs";

const KEY = "seasonal";
const MAX_ITEMS = 30;
const MAX_PHOTO = 600 * 1024;            // bytes, after decoding
const DEFAULT_TITLE = "Seasonal";
const money = v => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return isFinite(n) && n > 0 ? n.toFixed(2) : ""; };
// Optional end: "YYYY-MM-DDTHH:MM" store time. After it, the section is off by itself.
const nowCT = () => new Date().toLocaleString("sv-SE", { timeZone: "America/Chicago" }).slice(0, 16).replace(" ", "T");
const isOn = d => !!d.on && !(d.until && d.until <= nowCT());
const clean = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

export default async (req) => {
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const pid = url.searchParams.get("photo");
    if (pid) {
      const buf = await store.get("seasonal-photo-" + pid.replace(/[^a-z0-9]/gi, ""), { type: "arrayBuffer" });
      if (!buf) return new Response("Not found", { status: 404 });
      return new Response(buf, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
    }
    const d = (await store.get(KEY, { type: "json" })) || { on: false, items: [] };
    return json(isOn(d) ? { on: true, title: d.title || DEFAULT_TITLE, items: d.items || [], updated: d.updated } : { on: false, items: [] });
  }
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const bad = await checkPin(store, body.pin, "seasonal");
  if (bad) return json({ error: bad.error }, bad.status);
  const cur = (await store.get(KEY, { type: "json" })) || { on: false, items: [] };

  if (body.action === "photo") {
    const id = String(body.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 24);
    const b64 = String(body.data || "").replace(/^data:image\/\w+;base64,/, "");
    if (!id || !b64) return json({ error: "Bad photo." }, 400);
    const buf = Buffer.from(b64, "base64");
    if (buf.length > MAX_PHOTO) return json({ error: "That photo is too big. Try a smaller one." }, 400);
    const ver = Date.now().toString(36);
    await store.set("seasonal-photo-" + id + ver, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    return json({ ok: true, photo: id + ver });
  }

  if (body.action === "save") {
    if (!Array.isArray(body.items)) return json({ error: "Bad request." }, 400);
    const items = body.items.slice(0, MAX_ITEMS).map(it => ({
      id: String(it.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 24) || Math.random().toString(36).slice(2, 10),
      name: clean(it.name, 80),
      price: money(it.price),
      note: clean(it.note, 80),
      photo: String(it.photo || "").replace(/[^a-z0-9]/gi, "").slice(0, 40),
    })).filter(it => it.name);
    const until = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(body.until || "")) && body.until > nowCT() ? body.until : "";
    const data = { on: !!body.on, until, title: clean(body.title, 30) || DEFAULT_TITLE, items, updated: new Date().toISOString() };
    await store.setJSON(KEY, data);
    return json({ ok: true, ...data });
  }

  return json({ ok: true, until: cur.until || "", on: isOn(cur), title: cur.title || DEFAULT_TITLE, items: cur.items || [], updated: cur.updated });
};

export const config = { path: "/api/seasonal" };
