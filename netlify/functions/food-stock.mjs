// The Beer Depot — on/off switches for Made Here food and Local Favorites
// -----------------------------------------------------------------------
// GET  /api/food-stock                     -> { items: { "Shrimp Salad": true, ... }, updated }
// POST /api/food-stock  { pin, name, inStock } -> saves one switch (PIN required)
// POST /api/food-stock  { pin, check: true }   -> just checks the PIN
// POST /api/food-stock  { pin, name, prices:[[label,price],...] } -> price override (Grilling & Outdoor)
//
// Switches are saved in Netlify Blobs, so changing them does NOT need a new
// deploy and costs no deploy credits. The PIN lives in the FOOD_PIN
// environment variable in Netlify.

import { getStore } from "@netlify/blobs";

import { checkPin, json } from "../lib/pin.mjs";

const STORE = "beer-depot";
const KEY = "food-stock";

export default async (req) => {
  const store = getStore({ name: STORE, consistency: "strong" });

  if (req.method === "GET") {
    const data = (await store.get(KEY, { type: "json" })) || { items: {} };
    return json(data);
  }

  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  const bad = await checkPin(store, body.pin);
  if (bad) return json({ error: bad.error }, bad.status);

  if (body.check) return json({ ok: true });

  const name = String(body.name || "").trim();
  if (!name || name.length > 120) return json({ error: "Bad request." }, 400);
  const data = (await store.get(KEY, { type: "json" })) || { items: {} };

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
    return json({ ok: true, items: data.items, prices: data.prices, updated: data.updated });
  }

  if (typeof body.inStock !== "boolean") return json({ error: "Bad request." }, 400);
  data.items[name] = body.inStock;
  data.updated = new Date().toISOString();
  await store.setJSON(KEY, data);
  return json({ ok: true, items: data.items, prices: data.prices || {}, updated: data.updated });
};

export const config = { path: "/api/food-stock" };
