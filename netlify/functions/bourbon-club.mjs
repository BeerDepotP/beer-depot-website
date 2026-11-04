// Allocated Bourbon Club sign-ups.
// POST { email, of_age } adds a member to the "bourbon-club" list in Blobs.
// Emails are not sent from here yet; that part waits on the email service.
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

const KEY = "bourbon-club";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
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
