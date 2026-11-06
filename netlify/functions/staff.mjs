// Staff PINs (Store Tools → Staff, owner only).
// POST /api/staff { pin, action:"list" }                                  -> { members:[{id,name,tabs,on,added}] }
// POST /api/staff { pin, action:"add", name, newPin, tabs }
// POST /api/staff { pin, action:"update", id, name?, tabs?, on?, newPin? }
// POST /api/staff { pin, action:"remove", id }
// POST /api/staff { pin, action:"whoami" }   (anyone signed in)             -> { owner, name, tabs }
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import { checkPin, pinUser, hashPin, json, AREAS } from "../lib/pin.mjs";

const one = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const okPin = p => /^\d{4,12}$/.test(String(p || ""));

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  if (b.action === "whoami") {
    const bad = await checkPin(store, b.pin);
    if (bad) return json({ error: bad.error }, bad.status);
    const who = await pinUser(store, b.pin);
    return json({ owner: !!who.owner, name: who.name, tabs: who.tabs });
  }

  const bad = await checkPin(store, b.pin, "owner", b, "staff");
  if (bad) return json({ error: bad.error }, bad.status);
  const d = (await store.get("staff", { type: "json" })) || { members: [] };
  const tabs = t => [...new Set((Array.isArray(t) ? t : []).filter(x => AREAS.includes(x)))];
  const pinTaken = (p, exceptId) => p === process.env.FOOD_PIN || d.members.some(m => m.id !== exceptId && hashPin(p, m.salt) === m.hash);

  if (b.action === "add" || (b.action === "update" && b.newPin)) {
    if (!okPin(b.newPin)) return json({ error: "PINs are 4 to 12 numbers." }, 400);
    if (pinTaken(String(b.newPin), b.id)) return json({ error: "That PIN is already used. Pick another." }, 400);
  }
  if (b.action === "add") {
    const name = one(b.name, 40);
    if (!name) return json({ error: "Type the person's name." }, 400);
    if (d.members.length >= 30) return json({ error: "That's the limit of staff PINs." }, 400);
    const salt = randomBytes(8).toString("hex");
    d.members.push({ id: randomBytes(6).toString("hex"), name, salt, hash: hashPin(String(b.newPin), salt), tabs: tabs(b.tabs), on: true, added: new Date().toISOString() });
  } else if (b.action === "update") {
    const m = d.members.find(x => x.id === b.id);
    if (!m) return json({ error: "Not found." }, 404);
    if (b.name !== undefined) { const n = one(b.name, 40); if (n) m.name = n; }
    if (b.tabs !== undefined) m.tabs = tabs(b.tabs);
    if (b.on !== undefined) m.on = !!b.on;
    if (b.newPin) { m.salt = randomBytes(8).toString("hex"); m.hash = hashPin(String(b.newPin), m.salt); }
  } else if (b.action === "remove") {
    d.members = d.members.filter(x => x.id !== b.id);
  }
  if (b.action !== "list") await store.setJSON("staff", d);
  const activity = ((await store.get("activity", { type: "json" })) || []).slice(0, 300);
  return json({ ok: true, areas: AREAS, members: d.members.map(({ salt, hash, ...m }) => m), activity });
};

export const config = { path: "/api/staff" };
