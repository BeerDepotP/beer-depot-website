// The Beer Depot — on/off switches for Made Here food and Local Favorites
// -----------------------------------------------------------------------
// GET  /api/food-stock                     -> { items: { "Shrimp Salad": true, ... }, updated }
// POST /api/food-stock  { pin, name, inStock } -> saves one switch (PIN required)
// POST /api/food-stock  { pin, check: true }   -> just checks the PIN
//
// Switches are saved in Netlify Blobs, so changing them does NOT need a new
// deploy and costs no deploy credits. The PIN lives in the FOOD_PIN
// environment variable in Netlify.

import { getStore } from "@netlify/blobs";

const STORE = "beer-depot";
const KEY = "food-stock";
const LOCK_KEY = "food-stock-lock";
const MAX_FAILS = 8;               // wrong PINs allowed...
const LOCK_MINUTES = 15;           // ...before PIN entry is locked for this long

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function samePin(a, b) {
  a = String(a || ""); b = String(b || "");
  if (!a || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export default async (req) => {
  const store = getStore({ name: STORE, consistency: "strong" });

  if (req.method === "GET") {
    const data = (await store.get(KEY, { type: "json" })) || { items: {} };
    return json(data);
  }

  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);

  if (!process.env.FOOD_PIN) return json({ error: "The Food Stock PIN isn't set up yet in Netlify (FOOD_PIN)." }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  // lockout after too many wrong PINs
  const lock = (await store.get(LOCK_KEY, { type: "json" })) || { fails: 0, until: 0 };
  if (lock.until && Date.now() < lock.until) {
    const mins = Math.ceil((lock.until - Date.now()) / 60000);
    return json({ error: `Too many wrong PINs. Try again in ${mins} min.` }, 429);
  }
  if (!samePin(body.pin, process.env.FOOD_PIN)) {
    const fails = (lock.until && Date.now() >= lock.until ? 0 : lock.fails) + 1;
    await store.setJSON(LOCK_KEY, { fails: fails >= MAX_FAILS ? 0 : fails, until: fails >= MAX_FAILS ? Date.now() + LOCK_MINUTES * 60000 : 0 });
    return json({ error: "Wrong PIN." }, 401);
  }
  if (lock.fails) await store.setJSON(LOCK_KEY, { fails: 0, until: 0 });

  if (body.check) return json({ ok: true });

  const name = String(body.name || "").trim();
  if (!name || name.length > 120 || typeof body.inStock !== "boolean") return json({ error: "Bad request." }, 400);

  const data = (await store.get(KEY, { type: "json" })) || { items: {} };
  data.items[name] = body.inStock;
  data.updated = new Date().toISOString();
  await store.setJSON(KEY, data);
  return json({ ok: true, items: data.items, updated: data.updated });
};

export const config = { path: "/api/food-stock" };
