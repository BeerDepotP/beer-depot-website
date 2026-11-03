// Shared PIN check for the store-only pages (Food Stock, Searches).
// The PIN is the FOOD_PIN environment variable in Netlify.
// After MAX_FAILS wrong PINs, every PIN check is locked for LOCK_MINUTES.

const LOCK_KEY = "pin-lock";
const MAX_FAILS = 8;
const LOCK_MINUTES = 15;

function samePin(a, b) {
  a = String(a || ""); b = String(b || "");
  if (!a || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// Returns null when the PIN is good, or { error, status } when it isn't.
export async function checkPin(store, pin) {
  if (!process.env.FOOD_PIN) return { error: "The PIN isn't set up yet in Netlify (FOOD_PIN).", status: 503 };
  const lock = (await store.get(LOCK_KEY, { type: "json" })) || { fails: 0, until: 0 };
  if (lock.until && Date.now() < lock.until) {
    return { error: `Too many wrong PINs. Try again in ${Math.ceil((lock.until - Date.now()) / 60000)} min.`, status: 429 };
  }
  if (!samePin(pin, process.env.FOOD_PIN)) {
    const fails = (lock.until && Date.now() >= lock.until ? 0 : lock.fails) + 1;
    await store.setJSON(LOCK_KEY, fails >= MAX_FAILS ? { fails: 0, until: Date.now() + LOCK_MINUTES * 60000 } : { fails, until: 0 });
    return { error: "Wrong PIN.", status: 401 };
  }
  if (lock.fails || lock.until) await store.setJSON(LOCK_KEY, { fails: 0, until: 0 });
  return null;
}

export const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
