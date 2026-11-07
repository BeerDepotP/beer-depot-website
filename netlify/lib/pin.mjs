// Shared PIN check for Store Tools.
// The owner's PIN is the FOOD_PIN environment variable in Netlify and opens everything, including the Staff tab.
// Staff PINs are added in Store Tools → Staff (Blobs "staff", stored scrambled, never in plain text) and only open
// the tabs the owner ticked for that person. No Netlify setting is needed for staff.
// After MAX_FAILS wrong PINs, every PIN check is locked for LOCK_MINUTES.
import { createHash } from "node:crypto";
import { describe, logChange } from "./activity.mjs";

const LOCK_KEY = "pin-lock";
const MAX_FAILS = 8;
const LOCK_MINUTES = 15;
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
  const lock = (await store.get(LOCK_KEY, { type: "json" })) || { fails: 0, until: 0 };
  if (lock.until && Date.now() < lock.until) {
    return { error: `Too many wrong PINs. Try again in ${Math.ceil((lock.until - Date.now()) / 60000)} min.`, status: 429 };
  }
  const who = await pinUser(store, pin);
  if (!who) {
    const fails = (lock.until && Date.now() >= lock.until ? 0 : lock.fails) + 1;
    await store.setJSON(LOCK_KEY, fails >= MAX_FAILS ? { fails: 0, until: Date.now() + LOCK_MINUTES * 60000 } : { fails, until: 0 });
    return { error: "Wrong PIN.", status: 401 };
  }
  if (lock.fails || lock.until) await store.setJSON(LOCK_KEY, { fails: 0, until: 0 });
  if (area && !who.owner) {
    const need = Array.isArray(area) ? area : [area];
    if (need.includes("owner") || !need.some(a => who.tabs.includes(a))) return { error: "Your PIN doesn't have access to that. Ask the owner.", status: 403 };
  }
  if (body) await logChange(store, who, describe(logArea || (Array.isArray(area) ? "insights" : area), body));
  return null;
}

export const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
