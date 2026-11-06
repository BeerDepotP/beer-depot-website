// Back in Stock emails: customers ask to be emailed when an out-of-stock item returns.
// GET  /api/notify                      -> { on }  (website shows the button only when on)
// GET  /api/notify?unsub=<token>        -> unsubscribes that person from every item (page)
// POST /api/notify { action:"request", key, name, email, website }   (customers; "website" is a trap for bots)
// POST /api/notify { pin, action:"list" | "settings" (on, delayMin) | "clear" (key) | "removeEmail" (key, email) }   (Store Tools)
// notify-check.mjs sends the emails, once an item has stayed In Stock for the wait time.
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import { checkPin, json } from "../lib/pin.mjs";
import { loadState, loadWants, isIn, cleanForm, DEFAULT_FORM, notifyEmail } from "../lib/notify.mjs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const KEYS = /^[kfo]:/;

export default async (req) => {
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const tok = url.searchParams.get("unsub");
    if (tok) {
      const d = await loadWants(store);
      const email = Object.keys(d.tokens).find(e => d.tokens[e] === tok);
      if (email) {
        delete d.tokens[email];
        for (const k of Object.keys(d.wants)) { delete d.wants[k].people[email]; if (!Object.keys(d.wants[k].people).length) delete d.wants[k]; }
        await store.setJSON("notify", d);
      }
      return new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial;max-width:480px;margin:60px auto;padding:0 20px;color:#2B1B12"><h1>You're Unsubscribed</h1><p>You won't get any more Back in Stock emails from The Beer Depot.</p><p><a href="/">Back to the Website</a></p>`, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    const st = await loadState(store);
    return json({ on: st.on, form: cleanForm(st.form) });
  }
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  if (b.action === "request") {
    const state = await loadState(store);
    if (!state.on) return json({ error: "Back in Stock emails are turned off right now." }, 403);
    if (b.website) return json({ ok: true });                        // bot trap
    const email = String(b.email || "").trim().toLowerCase().slice(0, 120), key = String(b.key || ""), name = String(b.name || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!EMAIL.test(email)) return json({ error: "Enter a valid email." }, 400);
    if (!KEYS.test(key) || !name) return json({ error: "Bad request." }, 400);
    if (key.slice(2) !== name && key[0] === "k") return json({ error: "Bad request." }, 400);
    if ((await isIn(store, key, await store.get("stock-latest", { type: "json" }))) === true) return json({ error: "Good news, it's in stock right now!" }, 409);
    const d = await loadWants(store);
    const mine = Object.values(d.wants).filter(w => w.people[email]).length;
    if (!d.wants[key] && Object.keys(d.wants).length >= 800) return json({ error: "Try again later." }, 429);
    if (!d.wants[key]?.people[email] && mine >= 10) return json({ error: "That's the limit of 10 items per email." }, 429);
    d.wants[key] = d.wants[key] || { name, people: {} };
    const extra = {};
    for (const f of cleanForm(state.form).fields) {
      const v = String((b.extra || {})[f.id] ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (f.required && !v) return json({ error: `Please fill in ${f.label}.` }, 400);
      if (v) extra[f.label] = v;
    }
    d.wants[key].people[email] = { at: new Date().toISOString(), ...(Object.keys(extra).length ? { extra } : {}) };
    d.tokens[email] = d.tokens[email] || randomBytes(12).toString("hex");
    await store.setJSON("notify", d);
    return json({ ok: true });
  }

  const bad = await checkPin(store, b.pin, "notify");
  if (bad) return json({ error: bad.error }, bad.status);
  const d = await loadWants(store), state = await loadState(store);
  if (b.action === "settings") {
    await store.setJSON("notify-state", { ...state, on: !!b.on, delayMin: [0, 15, 30, 60, 120, 240].includes(+b.delayMin) ? +b.delayMin : state.delayMin });
  }
  if (b.action === "previewEmail") { const m = notifyEmail("(Sample) Blanton's Single Barrel 750ml", "preview", b.form); return json({ html: m.html, subject: m.subject }); }
  if (b.action === "form") await store.setJSON("notify-state", { ...state, form: cleanForm(b.form) });
  if (b.action === "clear" && d.wants[b.key]) { delete d.wants[b.key]; await store.setJSON("notify", d); }
  if (b.action === "removeEmail" && d.wants[b.key]) {
    delete d.wants[b.key].people[String(b.email || "")];
    if (!Object.keys(d.wants[b.key].people).length) delete d.wants[b.key];
    await store.setJSON("notify", d);
  }
  const s2 = await loadState(store);
  const items = Object.entries(d.wants).map(([key, w]) => ({
    key, name: w.name, count: Object.keys(w.people).length,
    people: Object.entries(w.people).map(([email, p]) => ({ email, at: p.at, extra: p.extra || {} })).sort((x, y) => y.at.localeCompare(x.at)),
  })).sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
  return json({ form: cleanForm(s2.form), defaults: DEFAULT_FORM, on: s2.on, delayMin: s2.delayMin, items, sent: (s2.sent || []).slice(-30).reverse(), ready: !!process.env.BREVO_API_KEY });
};

export const config = { path: "/api/notify" };
