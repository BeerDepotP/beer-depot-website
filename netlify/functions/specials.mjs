// The Beer Depot — This Week's Specials banner
// GET  /api/specials                 -> { items: ["Spotted Cow 12pk $15.99", ...], updated }
// POST /api/specials { pin, items }   -> saves the list (PIN required). An empty list hides the banner.
// Saved in Netlify Blobs, so changes need no deploy.

import { getStore } from "@netlify/blobs";
import { checkPin, json } from "../lib/pin.mjs";

const MAX_ITEMS = 5;
const MAX_LEN = 100;

export default async (req) => {
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  if (req.method === "GET") {
    return json((await store.get("specials", { type: "json" })) || { items: [] });
  }
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const bad = await checkPin(store, body.pin);
  if (bad) return json({ error: bad.error }, bad.status);
  if (!Array.isArray(body.items)) return json({ error: "Bad request." }, 400);
  const items = body.items.map(s => String(s || "").replace(/\s+/g, " ").trim().slice(0, MAX_LEN)).filter(Boolean).slice(0, MAX_ITEMS);
  const data = { items, updated: new Date().toISOString() };
  await store.setJSON("specials", data);
  return json({ ok: true, ...data });
};

export const config = { path: "/api/specials" };
