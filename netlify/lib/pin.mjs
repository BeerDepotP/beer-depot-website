// Shared PIN check for Store Tools.
// The owner's PIN is the FOOD_PIN environment variable in Netlify and opens everything, including the Staff tab.
// Staff PINs are added in Store Tools → Staff (Blobs "staff", stored scrambled, never in plain text) and only open
// the tabs the owner ticked for that person. No Netlify setting is needed for staff.
// Wrong PINs are counted per visitor (IP address). After MAX_FAILS wrong PINs that visitor is locked out for 15 minutes, then 1 hour, then 4 hours
// if they keep guessing. If very many wrong PINs arrive from everywhere at once, all PIN checks pause for 15 minutes.
import { createHash } from "node:crypto";
import { describe, logChange } from "./activity.mjs";
import { visitorIp } from "./throttle.mjs";

const LOCK_KEY = "pin-lock";
const MAX_FAILS = 8;
const LOCK_STEPS = [15, 60, 240];                 // minutes, by how many times this visitor has been locked
const GLOBAL_FAILS = 60, GLOBAL_WINDOW = 15 * 60000;
export const AREAS = ["schedule", "food", "sales", "seasonal", "hours", "notify", "layout", "banners", "drinks", "nofind", "top", "requests", "club"];

function samePin(a, b) {
  a = String(a || ""); b = String(b || "");
  if (!a || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export const hashPin = (pin, salt) => createHash("sha256").update(salt + ":" + String(pin)).digest("hex");

// Who a PIN belongs to: { owner:true } | { staff:{ id, name, tabs } } | null
export async function pinUser(store, pin) {
  pin = String(pin || "");
  if (!pin) return null;
  if (samePin(pin, process.env.FOOD_PIN)) return { owner: true, name: "Owner", tabs: AREAS };
  const list = ((await store.get("staff", { type: "json" })) || { members: [] }).members || [];
  const m = list.find(x => x.on !== false && samePin(hashPin(pin, x.salt), x.hash));
  return m ? { staff: true, id: m.id, name: m.name, boss: !!m.manager, tabs: m.manager ? AREAS : (m.tabs || []).filter(t => AREAS.includes(t) && t !== "schedule") } : null;   // manager = every tab + schedule approvals, but never the owner-only Staff tab
}

// Returns null when the PIN is good (and may use `area`), or { error, status } when it isn't.
// area: one of AREAS, "owner" (owner only), an array (any of them), or empty (any good PIN).
// body (optional): the request, so changes can be written to the activity log shown in the Staff tab.
export async function checkPin(store, pin, area, body, logArea) {
  if (!process.env.FOOD_PIN) return { error: "The PIN isn't set up yet in Netlify (FOOD_PIN).", status: 503 };
  const now = Date.now(), ip = visitorIp();
  let lock = null; try { lock = await store.get(LOCK_KEY, { type: "json" }); } catch {}
  lock = lock && lock.ips ? lock : { ips: {}, g: [], gUntil: 0 };
  for (const k of Object.keys(lock.ips)) if (now - (lock.ips[k].at || 0) > 86400000) delete lock.ips[k];
  const rec = lock.ips[ip] || { fails: 0, until: 0, strikes: 0, at: now };
  const wait = u => `Too many wrong PINs. Try again in ${Math.ceil((u - now) / 60000)} min.`;
  if (rec.until && now < rec.until) return { error: wait(rec.until), status: 429 };
  if (lock.gUntil && now < lock.gUntil) return { error: wait(lock.gUntil), status: 429 };
  const who = await pinUser(store, pin);
  if (!who) {
    rec.fails++; rec.at = now;
    if (rec.fails >= MAX_FAILS) { rec.until = now + LOCK_STEPS[Math.min(rec.strikes, LOCK_STEPS.length - 1)] * 60000; rec.strikes++; rec.fails = 0; }
    lock.ips[ip] = rec;
    lock.g = (lock.g || []).filter(t => now - t < GLOBAL_WINDOW).concat(now);
    if (lock.g.length >= GLOBAL_FAILS) { lock.gUntil = now + GLOBAL_WINDOW; lock.g = []; }
    if (Object.keys(lock.ips).length > 2000) lock.ips = { [ip]: rec };
    await store.setJSON(LOCK_KEY, lock);
    return { error: "Wrong PIN.", status: 401 };
  }
  if (rec.fails || rec.until) { rec.fails = 0; rec.until = 0; lock.ips[ip] = rec; await store.setJSON(LOCK_KEY, lock); }
  if (area && !who.owner) {
    const need = Array.isArray(area) ? area : [area];
    if (need.includes("owner") || !need.some(a => who.tabs.includes(a))) return { error: "Your PIN doesn't have access to that. Ask the owner.", status: 403 };
  }
  if (body) await logChange(store, who, describe(logArea || (Array.isArray(area) ? "insights" : area), body));
  return null;
}

export const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
