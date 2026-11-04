// Allocated Bourbon Club sign-ups.
// POST { email, of_age } adds a member to the "bourbon-club" list in Blobs.
// GET ?unsub=<token> removes a member (link in every email).
// POST { pin, action:"list" | "test" | "remove" } is for Store Tools.
// The weekly email itself is bourbon-club-weekly.mjs (Thursdays 5 PM Central).
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import { checkPin } from "../lib/pin.mjs";
import { sendTest } from "../lib/club-email.mjs";

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
  if (b.action) return storeTools(b);
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

async function storeTools(b) {
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  const bad = await checkPin(store, b.pin);
  if (bad) return json({ error: bad.error }, bad.status);
  const list = (await store.get(KEY, { type: "json" })) || {};
  if (b.action === "remove") {
    const e = String(b.email || "").trim().toLowerCase();
    if (list[e]) { delete list[e]; await store.setJSON(KEY, list); }
  }
  if (b.action === "test") {
    const to = String(b.to || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return json({ error: "Enter the email to send the test to." }, 400);
    const stock = await store.get("stock-latest", { type: "json" });
    let bottles = [...new Set((stock?.items || []).filter(it => it.allocated && it.inStock).map(it => it.name))].sort((x, y) => x.localeCompare(y));
    if (!bottles.length) bottles = ["(Sample) Blanton's Single Barrel 750ml", "(Sample) Weller Special Reserve 750ml"];
    try { await sendTest(to, bottles); } catch (e) { return json({ error: e.message }, 502); }
    return json({ ok: true, bottles: bottles.length });
  }
  const members = Object.entries(list).map(([email, m]) => ({ email, joined: m.joined })).sort((x, y) => y.joined.localeCompare(x.joined));
  const last = await store.get("bourbon-club-sent", { type: "json" });
  return json({ count: members.length, members, last: last ? { date: last.date, sent: last.sent, bottles: (last.bottles || []).length } : null, ready: !!process.env.BREVO_API_KEY });
}

export const config = { path: "/api/bourbon-club" };
