// Per-visitor limits so one person can't flood the public forms or guess PINs.
// The visitor is the connection's IP address (Netlify provides it). Counts live in the "throttle" blob and old ones tidy themselves.
export function visitorIp() {
  try { const c = globalThis.Netlify && globalThis.Netlify.context; if (c && c.ip) return String(c.ip); } catch {}
  return "unknown";
}

// Returns true when this visitor has already used `max` tries in the last `windowMs` for `scope`. Otherwise it counts this try and returns false.
export async function tooMany(store, scope, max, windowMs) {
  const ip = visitorIp(), now = Date.now(), key = scope + "|" + ip;
  let d = null;
  try { d = await store.get("throttle", { type: "json" }); } catch {}
  d = d || {};
  for (const k of Object.keys(d)) { d[k] = (d[k] || []).filter(t => now - t < 86400000); if (!d[k].length) delete d[k]; }
  const mine = (d[key] || []).filter(t => now - t < windowMs);
  if (mine.length >= max) return true;
  d[key] = [...(d[key] || []), now].slice(-60);
  if (Object.keys(d).length > 3000) return false;           // never let this blob grow without limit
  try { await store.setJSON("throttle", d); } catch {}
  return false;
}
