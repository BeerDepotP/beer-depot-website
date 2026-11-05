// The Beer Depot — on/off switches for Made Here food and Local Favorites
// -----------------------------------------------------------------------
// GET  /api/food-stock                     -> { items: { "Shrimp Salad": true, ... }, updated }
// POST /api/food-stock  { pin, name, inStock } -> saves one switch (PIN required)
// POST /api/food-stock  { pin, check: true }   -> just checks the PIN
// POST /api/food-stock  { pin, name, prices:[[label,price],...] } -> price override (Grilling & Outdoor)
// POST /api/food-stock  { pin, action:"edit", name, label, prices, photo } -> edit one item (name shown, prices, picture)
//        label "" = back to the built-in name; photo: undefined = keep, "" = built-in picture, "none" = no picture, else an uploaded photo id
// POST /api/food-stock  { pin, action:"photo", id, data }   -> saves an uploaded picture (base64 JPEG made small in the browser)
// POST /api/food-stock  { pin, action:"toppings", list:[..] } -> the pizza topping list
// GET  /api/food-stock?photo=<id>          -> an uploaded picture (JPEG)
//
// Switches are saved in Netlify Blobs, so changing them does NOT need a new
// deploy and costs no deploy credits. The PIN lives in the FOOD_PIN
// environment variable in Netlify.

import { getStore } from "@netlify/blobs";

import { checkPin, json } from "../lib/pin.mjs";

const STORE = "beer-depot";
const KEY = "food-stock";
const MAX_PHOTO = 600 * 1024;            // bytes, after decoding
const clean = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
const title = s => s.replace(/(^|[\s(\-/])([a-z])/g, (m, a, b) => a + b.toUpperCase());
const priceRows = rows => (Array.isArray(rows) ? rows : []).slice(0, 8).map(r => {
  const label = clean((r || [])[0], 30);
  const n = Number(String((r || [])[1] ?? "").replace(/[^0-9.]/g, ""));
  return [label, isFinite(n) && n > 0 ? n.toFixed(2) : ""];
}).filter(r => r[0]);

export default async (req) => {
  const store = getStore({ name: STORE, consistency: "strong" });

  if (req.method === "GET") {
    const pid = new URL(req.url).searchParams.get("photo");
    if (pid) {
      const buf = await store.get("food-photo-" + pid.replace(/[^a-z0-9]/gi, ""), { type: "arrayBuffer" });
      if (!buf) return new Response("Not found", { status: 404 });
      return new Response(buf, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
    }
    const data = (await store.get(KEY, { type: "json" })) || { items: {} };
    return json(data);
  }

  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  const bad = await checkPin(store, body.pin);
  if (bad) return json({ error: bad.error }, bad.status);

  if (body.check) return json({ ok: true });

  if (body.action === "photo") {
    const id = String(body.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 24);
    const b64 = String(body.data || "").replace(/^data:image\/\w+;base64,/, "");
    if (!id || !b64) return json({ error: "Bad photo." }, 400);
    const buf = Buffer.from(b64, "base64");
    if (buf.length > MAX_PHOTO) return json({ error: "That photo is too big. Try a smaller one." }, 400);
    const ver = Date.now().toString(36);
    await store.set("food-photo-" + id + ver, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    return json({ ok: true, photo: id + ver });
  }

  if (body.action === "toppings") {
    if (!Array.isArray(body.list)) return json({ error: "Bad request." }, 400);
    const seen = new Set();
    const list = body.list.map(x => title(clean(x, 30))).filter(x => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).slice(0, 40);
    const d = (await store.get(KEY, { type: "json" })) || { items: {} };
    d.toppings = list;
    d.updated = new Date().toISOString();
    await store.setJSON(KEY, d);
    return json({ ok: true, ...d });
  }

  const name = String(body.name || "").trim();
  if (!name || name.length > 120) return json({ error: "Bad request." }, 400);
  const data = (await store.get(KEY, { type: "json" })) || { items: {} };

  if (body.action === "edit") {
    data.edits = data.edits || {};
    data.prices = data.prices || {};
    const e = { ...(data.edits[name] || {}) };
    if (typeof body.label === "string") { const l = title(clean(body.label, 60)); if (l) e.label = l; else delete e.label; }
    if (typeof body.photo === "string") { const ph = body.photo.replace(/[^a-z0-9]/gi, "").slice(0, 40); if (ph) e.photo = ph; else delete e.photo; }
    if (body.photo === "none") e.photo = "none";
    if (Object.keys(e).length) data.edits[name] = e; else delete data.edits[name];
    if (Array.isArray(body.prices)) data.prices[name] = priceRows(body.prices);
    data.updated = new Date().toISOString();
    await store.setJSON(KEY, data);
    return json({ ok: true, items: data.items, prices: data.prices, edits: data.edits, toppings: data.toppings || null, updated: data.updated });
  }

  if (Array.isArray(body.prices)) {            // price override (Grilling & Outdoor)
    const rows = body.prices.slice(0, 6).map(r => {
      const label = String((r || [])[0] || "").replace(/\s+/g, " ").trim().slice(0, 30);
      const n = Number(String((r || [])[1] ?? "").replace(/[^0-9.]/g, ""));
      return [label, isFinite(n) && n > 0 ? n.toFixed(2) : ""];
    }).filter(r => r[0]);
    data.prices = data.prices || {};
    data.prices[name] = rows;
    data.updated = new Date().toISOString();
    await store.setJSON(KEY, data);
    return json({ ok: true, items: data.items, prices: data.prices, edits: data.edits || {}, toppings: data.toppings || null, updated: data.updated });
  }

  if (typeof body.inStock !== "boolean") return json({ error: "Bad request." }, 400);
  data.items[name] = body.inStock;
  data.updated = new Date().toISOString();
  await store.setJSON(KEY, data);
  return json({ ok: true, items: data.items, prices: data.prices || {}, edits: data.edits || {}, toppings: data.toppings || null, updated: data.updated });
};

export const config = { path: "/api/food-stock" };
