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

// Made Here menu changes from Store Tools (all in the same "food-stock" blob):
//   custom:   [{ name:"c-xxxx", label, group, desc }]   items added in Store Tools (prices in prices[name], picture in edits[name])
//   order:    { group: [names] }                         the order items show in
//   removed:  { name: true }                             taken off the website (Store Tools lists them at the bottom to put back)
//   specials: { name: { on, prices:[[label, specialPrice]], until:"YYYY-MM-DDTHH:MM" Central or "" } }
// POST { pin, action:"addItem", label, group, desc, prices } | "removeItem"/"restoreItem"/"deleteItem" { name }
//      | "order" { group, names } | "special" { name, on, prices, until }
const chicagoStamp = () => new Date().toLocaleString("sv-SE", { timeZone: "America/Chicago" }).slice(0, 16).replace(" ", "T");
function tidy(d) {      // drop specials that have ended
  const now = chicagoStamp();
  for (const [k, sp] of Object.entries(d.specials || {})) if (!sp.on || (sp.until && sp.until <= now)) delete d.specials[k];
  return d;
}
const view = d => ({ ok: true, items: d.items || {}, prices: d.prices || {}, edits: d.edits || {}, toppings: d.toppings || null,
  custom: d.custom || [], order: d.order || {}, removed: d.removed || {}, specials: d.specials || {}, makers: d.makers || {}, newMakers: d.newMakers || [], variants: d.variants || {}, deleted: d.deleted || {}, groups: d.groups || [], updated: d.updated });
async function saveData(store, d) { tidy(d); d.updated = new Date().toISOString(); await store.setJSON(KEY, d); return json(view(d)); }

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
    return json(view(tidy(data)));
  }

  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  const bad = await checkPin(store, body.pin, "food", body);
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

  if (body.action === "addItem") {
    const d = (await store.get(KEY, { type: "json" })) || { items: {} };
    const label = title(clean(body.label, 60)), group = clean(body.group, 40), maker = clean(body.maker, 60), outdoor = !!body.outdoor;
    if (!label || !(group || maker || outdoor)) return json({ error: "Give the item a name." }, 400);
    d.custom = d.custom || [];
    if (d.custom.length >= 150) return json({ error: "That's the limit of added items." }, 400);
    const name = "c-" + Date.now().toString(36);
    d.custom.push(outdoor ? { name, label, outdoor: true, desc: clean(body.desc, 120) } : maker ? { name, label, maker, desc: clean(body.desc, 120) } : { name, label, group, desc: clean(body.desc, 120) });
    const key = outdoor ? "Outdoor: " + name : name;
    d.prices = d.prices || {}; d.prices[key] = priceRows(body.prices);
    d.items[key] = true;
    return saveData(store, d);
  }
  if (body.action === "order") {
    const d = (await store.get(KEY, { type: "json" })) || { items: {} };
    const group = clean(body.group, 70);
    if (!group || !Array.isArray(body.names)) return json({ error: "Bad request." }, 400);
    d.order = d.order || {};
    d.order[group] = body.names.map(n => String(n || "").slice(0, 120)).filter(Boolean).slice(0, 120);
    return saveData(store, d);
  }

  // Local Favorites companies: rename / change city ("maker"), add one ("addMaker"), delete an added one ("deleteMaker")
  if (["maker", "addMaker", "deleteMaker"].includes(body.action)) {
    const d = (await store.get(KEY, { type: "json" })) || { items: {} };
    d.makers = d.makers || {}; d.newMakers = d.newMakers || [];
    if (body.action === "addMaker") {
      const name = title(clean(body.name, 50));
      if (!name) return json({ error: "Give the company a name." }, 400);
      if (d.newMakers.length >= 20) return json({ error: "That's the limit of added companies." }, 400);
      d.newMakers.push({ id: "m-" + Date.now().toString(36), name, where: clean(body.where, 50) });
    } else {
      const key = clean(body.key, 60);
      if (!key) return json({ error: "Bad request." }, 400);
      if (body.action === "deleteMaker") {
        if (!key.startsWith("m-")) return json({ error: "Only companies added in Store Tools can be deleted." }, 400);
        d.newMakers = d.newMakers.filter(m => m.id !== key);
        const gone = (d.custom || []).filter(c => c.maker === key).map(c => c.name);
        d.custom = (d.custom || []).filter(c => c.maker !== key);
        for (const n of gone) for (const k of ["removed", "prices", "edits", "items"]) if (d[k]) delete d[k][n];
        delete d.makers[key]; if (d.order) delete d.order["local:" + key];
      } else {
        const name = title(clean(body.name, 50));
        if (!name) return json({ error: "Give the company a name." }, 400);
        d.makers[key] = { name, where: clean(body.where, 50) };
      }
    }
    return saveData(store, d);
  }

  if (body.action === "groups") {          // Made Here groups: [{ key, name, note }] in order
    const d = (await store.get(KEY, { type: "json" })) || { items: {} };
    if (!Array.isArray(body.list)) return json({ error: "Bad request." }, 400);
    const seen = new Set(), list = [];
    for (const g of body.list.slice(0, 15)) {
      const name = title(clean(g && g.name, 40)); if (!name) return json({ error: "Each group needs a name." }, 400);
      let key = clean(g && g.key, 40); if (!key || seen.has(key)) key = "g-" + Date.now().toString(36) + list.length;
      seen.add(key); list.push({ key, name, note: clean(g && g.note, 200) });
    }
    if (!list.length) return json({ error: "Keep at least one group." }, 400);
    d.groups = list;
    return saveData(store, d);
  }

  if (body.action === "variants") {        // flavors of a Grilling & Outdoor item: [{ v, note }]
    const d = (await store.get(KEY, { type: "json" })) || { items: {} };
    const key = clean(body.name, 120);
    if (!key.startsWith("Outdoor: ") || !Array.isArray(body.list)) return json({ error: "Bad request." }, 400);
    const seen = new Set();
    const list = body.list.map(x => ({ v: title(clean(x && x.v, 40)), note: clean(x && x.note, 300) }))
      .filter(x => x.v && !seen.has(x.v.toLowerCase()) && seen.add(x.v.toLowerCase())).slice(0, 30);
    d.variants = d.variants || {}; d.variants[key] = list;
    return saveData(store, d);
  }

  if (body.action === "toppings") {
    if (!Array.isArray(body.list)) return json({ error: "Bad request." }, 400);
    const seen = new Set();
    const list = body.list.map(x => title(clean(x, 30))).filter(x => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).slice(0, 40);
    const d = (await store.get(KEY, { type: "json" })) || { items: {} };
    d.toppings = list;
    return saveData(store, d);
  }

  const name = String(body.name || "").trim();
  if (!name || name.length > 120) return json({ error: "Bad request." }, 400);
  const data = (await store.get(KEY, { type: "json" })) || { items: {} };

  if (["removeItem", "restoreItem", "deleteItem"].includes(body.action)) {
    data.removed = data.removed || {};
    if (body.action === "removeItem") { data.removed[name] = true; if (data.specials) delete data.specials[name]; }
    if (body.action === "restoreItem") delete data.removed[name];
    if (body.action === "deleteItem") {
      const id = name.replace(/^Outdoor: /, "");
      if (!id.startsWith("c-")) {       // a built-in item: hide it for good (it stays in the code, but never shows again)
        data.deleted = data.deleted || {}; data.deleted[name] = true; delete data.removed[name];
        return saveData(store, data);
      }
      data.custom = (data.custom || []).filter(c => c.name !== id);
      if (data.variants) delete data.variants[name];
      for (const k of ["removed", "prices", "edits", "specials", "items"]) if (data[k]) delete data[k][name];
      for (const g of Object.keys(data.order || {})) data.order[g] = data.order[g].filter(n => n !== name);
    }
    return saveData(store, data);
  }
  if (body.action === "special") {
    data.specials = data.specials || {};
    if (!body.on) { delete data.specials[name]; return saveData(store, data); }
    const rows = (Array.isArray(body.prices) ? body.prices : []).slice(0, 8).map(r => {
      const n = Number(String((r || [])[1] ?? "").replace(/[^0-9.]/g, ""));
      return [clean((r || [])[0], 30), isFinite(n) && n > 0 ? n.toFixed(2) : ""];
    }).filter(r => r[0] && r[1]);
    if (!rows.length) return json({ error: "Enter a special price." }, 400);
    const until = String(body.until || "");
    if (until && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(until)) return json({ error: "Pick a day and time for the special to end." }, 400);
    if (until && until <= chicagoStamp()) return json({ error: "The end time has already passed." }, 400);
    data.specials[name] = { on: true, prices: rows, until };
    return saveData(store, data);
  }

  if (body.action === "edit") {
    if (typeof body.desc === "string") { const id = name.replace(/^Outdoor: /, ""); const c = (data.custom || []).find(x => x.name === id); if (c) c.desc = clean(body.desc, 120); }
    data.edits = data.edits || {};
    data.prices = data.prices || {};
    const e = { ...(data.edits[name] || {}) };
    if (typeof body.label === "string") { const l = title(clean(body.label, 60)); if (l) e.label = l; else delete e.label; }
    if (typeof body.photo === "string") { const ph = body.photo.replace(/[^a-z0-9]/gi, "").slice(0, 40); if (ph) e.photo = ph; else delete e.photo; }
    if (body.photo === "none") e.photo = "none";
    if (typeof body.group === "string") { const g = clean(body.group, 40); if (g) e.group = g; else delete e.group; }
    if (Object.keys(e).length) data.edits[name] = e; else delete data.edits[name];
    if (Array.isArray(body.prices)) data.prices[name] = priceRows(body.prices);
    return saveData(store, data);
  }

  if (Array.isArray(body.prices)) {            // price override (Grilling & Outdoor)
    const rows = body.prices.slice(0, 6).map(r => {
      const label = String((r || [])[0] || "").replace(/\s+/g, " ").trim().slice(0, 30);
      const n = Number(String((r || [])[1] ?? "").replace(/[^0-9.]/g, ""));
      return [label, isFinite(n) && n > 0 ? n.toFixed(2) : ""];
    }).filter(r => r[0]);
    data.prices = data.prices || {};
    data.prices[name] = rows;
    return saveData(store, data);
  }

  if (typeof body.inStock !== "boolean") return json({ error: "Bad request." }, 400);
  data.items[name] = body.inStock;
  return saveData(store, data);
};

export const config = { path: "/api/food-stock" };
