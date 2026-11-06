// Website banners and wording (Store Tools → Banners & Text). Saved in Blobs "site"; no deploy needed.
// GET  /api/site                      -> { hotHam, announce, text }   (announcement left out once it has ended)
// POST /api/site { pin, action:"list" } | { pin, action:"save", hotHam?, announce?, text? }
import { getStore } from "@netlify/blobs";
import { checkPin, json } from "../lib/pin.mjs";

export const DEFAULTS = {
  hotHam: { on: true, day: 0, from: "09:00", until: "15:00", text: "Hot Ham Available Now Until {until}" },
  announce: { on: false, text: "", link: "", color: "red", until: "" },
  text: {
    heroTitle: "See what's on our shelves",
    searchHint: "Search Tito's, Spotted Cow, ribs…",
    madeHereIntro: "Smoked and cooked right here at The Beer Depot. Grab it from the cooler and take it home.",
    cateringTitle: "Party & Catering Orders",
    cateringText: "Feeding a crowd? We'll smoke it for you. Order ribs, pulled pork, pulled chicken, mac & cheese, sides and more for your party, game day or event.",
    cateringButton: "Call to Order",
  },
};
const LIMITS = { heroTitle: 60, searchHint: 60, madeHereIntro: 300, cateringTitle: 60, cateringText: 500, cateringButton: 30 };
const T = /^([01]\d|2[0-3]):[0-5]\d$/, DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const one = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const nowCT = () => new Date().toLocaleString("sv-SE", { timeZone: "America/Chicago" }).slice(0, 16).replace(" ", "T");

function merged(d = {}) {
  return { hotHam: { ...DEFAULTS.hotHam, ...(d.hotHam || {}) }, announce: { ...DEFAULTS.announce, ...(d.announce || {}) }, text: { ...DEFAULTS.text, ...(d.text || {}) } };
}

export default async (req) => {
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  const cur = merged(await store.get("site", { type: "json" }));
  if (req.method === "GET") {
    const a = cur.announce, live = a.on && a.text && !(a.until && a.until <= nowCT());
    return json({ ...cur, announce: live ? a : { on: false } });
  }
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const bad = await checkPin(store, b.pin);
  if (bad) return json({ error: bad.error }, bad.status);
  if (b.action === "save") {
    const next = merged(cur);
    if (b.hotHam) {
      const h = b.hotHam, day = Number(h.day);
      if (!(day >= 0 && day <= 6) || !T.test(h.from || "") || !T.test(h.until || "") || h.from >= h.until) return json({ error: "Hot Ham needs a day and a start time before the end time." }, 400);
      next.hotHam = { on: !!h.on, day, from: h.from, until: h.until, text: one(h.text, 80) || DEFAULTS.hotHam.text };
    }
    if (b.announce) {
      const a = b.announce, until = DT.test(a.until || "") ? a.until : "";
      if (a.on && !one(a.text, 200)) return json({ error: "Type the announcement first." }, 400);
      if (until && until <= nowCT()) return json({ error: "That end time has already passed." }, 400);
      const link = one(a.link, 200);
      next.announce = { on: !!a.on, text: one(a.text, 200), link: /^(#[a-z0-9-]+|https?:\/\/\S+|tel:\+?[0-9-]+)?$/i.test(link) ? link : "", color: ["red", "orange", "dark"].includes(a.color) ? a.color : "red", until };
    }
    if (b.text) {
      const t = {};
      for (const k of Object.keys(DEFAULTS.text)) t[k] = one(b.text[k], LIMITS[k]) || DEFAULTS.text[k];
      next.text = t;
    }
    next.updated = new Date().toISOString();
    await store.setJSON("site", next);
    return json({ ok: true, ...merged(next), defaults: DEFAULTS });
  }
  return json({ ok: true, ...cur, defaults: DEFAULTS });
};

export const config = { path: "/api/site" };
