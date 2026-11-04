// Allocated Bourbon Club sign-ups.
// POST { email, of_age } adds a member to the "bourbon-club" list in Blobs.
// GET ?unsub=<token> removes a member (link in every email).
// The weekly email itself is bourbon-club-weekly.mjs (Thursdays 5 PM Central).
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

const KEY = "bourbon-club";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const page = (msg) => new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bourbon Club</title>
<body style="font-family:Arial,sans-serif;background:#F3EBE2;color:#2B1B12;text-align:center;padding:60px 20px"><h1 style="color:#F26B1D">Bourbon Club</h1><p style="font-size:18px">${msg}</p>
<p><a href="/" style="color:#2B1B12;font-weight:bold">Back to The Beer Depot</a></p></body>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

async function unsubscribe(token) {
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  const list = (await store.get(KEY, { type: "json" })) || {};
  const hit = Object.keys(list).find(e => list[e].token === token);
  if (hit) { delete list[hit]; await store.setJSON(KEY, list); }
  return hit;
}

export default async (req) => {
  const unsub = new URL(req.url).searchParams.get("unsub");
  if (unsub) {
    await unsubscribe(unsub);
    return req.method === "POST" ? json({ ok: true }) : page("You're unsubscribed. You won't get any more Bourbon Club emails.");
  }
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let b = {}; try { b = await req.json(); } catch {}
  if (b.website) return json({ ok: true });                       // bot trap field
  const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "Please enter a valid email address." }, 400);
  if (!b.of_age) return json({ error: "You must be 21 or older to join." }, 400);
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  const list = (await store.get(KEY, { type: "json" })) || {};
  if (!list[email]) {
    list[email] = { joined: new Date().toISOString(), token: randomBytes(12).toString("hex") };
    await store.setJSON(KEY, list);
  }
  return json({ ok: true });
};

export const config = { path: "/api/bourbon-club" };
