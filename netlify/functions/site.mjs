// Website banners and wording (Store Tools → Banners & Text). Saved in Blobs "site"; no deploy needed.
// GET  /api/site                      -> { hotHam, announce, text }   (announcement left out once it has ended)
// POST /api/site { pin, action:"list" } | { pin, action:"save", hotHam?, announce?, text? }
import { getStore } from "@netlify/blobs";
import { checkPin, json } from "../lib/pin.mjs";
import { DEFAULT_INFO } from "../lib/info.mjs";

export const DEFAULTS = {
  hotHam: { on: true, day: 0, days: [0], from: "09:00", until: "15:00", text: "Hot Ham Available Now Until {until}" },
  announce: { on: false, text: "", link: "", color: "red", until: "" },
  text: {
    heroTitle: "See what's on our shelves",
    searchHint: "Search Tito's, Spotted Cow, ribs…",
    madeHereIntro: "Smoked and cooked right here at The Beer Depot. Grab it from the cooler and take it home.",
    cateringTitle: "Party & Catering Orders",
    cateringText: "Feeding a crowd? We'll smoke it for you. Order ribs, pulled pork, pulled chicken, mac & cheese, sides and more for your party, game day or event.",
    cateringButton: "Call to Order",
    saleIntro: "Deals this week, while they last.",
    localIntro: "Meat, cheese and bakery from local makers.",
    outdoorIntro: "",
    newIntro: "Just came in over the last two weeks.",
    allocNote: "Hard-to-Find Bottles. Once They're Gone, They're Gone.",
    allocRules: "Stock Updates Live · First Come, First Served · No Reservations",
    clubTitle: "Join the Bourbon Club",
    clubText: "Every Thursday at 5 PM, get our list of allocated bottles in stock.",
    clubDone: "You're in! Watch for our email Thursday at 5 PM.",
    requestTitle: "Don't See It? Ask Us to Bring It In.",
    requestText: "Tell us what you'd like us to carry. We read every request and will call you if we get it in.",
    gateTitle: "Are you 21 or older?",
    gateText: "This site lists beer and spirits. You must be 21 to see them.",
    gateYes: "Yes, I'm 21 or older",
    gateNo: "No, just show me the food",
    clubPageTitle: "Join the Bourbon Club",
    clubPageLede: "Every Thursday at 5 PM, get our list of allocated bottles in stock.",
    clubPageSub: "Hard-to-find bottles go fast. Be the first to know what's on the shelf.",
    clubPageFine: "One email a week, only on weeks we have bottles. First come, first served, in store only. Unsubscribe anytime.",
    clubPageDone: "Watch for our email Thursday at 5 PM.",
    thcNote: "A new federal law takes effect December 11, 2026 that ends sales of most hemp-derived THC drinks. We'll carry them until then, while supplies last.",
  },
  info: { ...DEFAULT_INFO },
  settings: { newDays: 14, thcUntil: "2026-12-11", thcNoteOn: true, newCount: 20, showCount: 20, allocCount: 10, sodaAlwaysIn: true },
  email: { fromName: "The Beer Depot", replyTo: "bourbon@beerdepotpewaukee.com", footer: "" },
  social: { on: false, facebook: "", instagram: "", tiktok: "", x: "", youtube: "" },
  colors: { main: "#F26B1D", dark: "#2B1A10", light: "#F3ECE3" },
  images: { logo: "", icon: "" },      // uploaded logo / browser tab icon ("" = the built-in ones)
};
const HEX = /^#[0-9a-f]{6}$/i;
const IMG_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_IMG = 700 * 1024;
const LIMITS = { heroTitle: 60, searchHint: 60, madeHereIntro: 300, cateringTitle: 60, cateringText: 500, cateringButton: 30 };
const MAY_BE_EMPTY = new Set(["outdoorIntro"]);
const T = /^([01]\d|2[0-3]):[0-5]\d$/, DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const one = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const nowCT = () => new Date().toLocaleString("sv-SE", { timeZone: "America/Chicago" }).slice(0, 16).replace(" ", "T");

function merged(d) {
  d = d || {};          // nothing saved yet comes back as null
  return { hotHam: { ...DEFAULTS.hotHam, ...(d.hotHam || {}) }, announce: { ...DEFAULTS.announce, ...(d.announce || {}) }, text: { ...DEFAULTS.text, ...(d.text || {}) },
    info: { ...DEFAULTS.info, ...(d.info || {}) }, settings: { ...DEFAULTS.settings, ...(d.settings || {}) },
    colors: { ...DEFAULTS.colors, ...(d.colors || {}) }, images: { ...DEFAULTS.images, ...(d.images || {}) },
    email: { ...DEFAULTS.email, ...(d.email || {}) }, social: { ...DEFAULTS.social, ...(d.social || {}) } };
}

export default async (req) => {
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  const cur = merged(await store.get("site", { type: "json" }));
  if (req.method === "GET") {
    const img = new URL(req.url).searchParams.get("img");
    if (img) {
      const id = img.replace(/[^a-z0-9.]/gi, "");
      const buf = await store.get("site-img-" + id, { type: "arrayBuffer" });
      if (!buf) return new Response("Not found", { status: 404 });
      const ext = id.split(".").pop(), type = Object.keys(IMG_TYPES).find(t => IMG_TYPES[t] === ext) || "image/png";
      return new Response(buf, { headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" } });
    }
    const a = cur.announce, live = a.on && a.text && !(a.until && a.until <= nowCT());
    const colors = cur.colors.until && cur.colors.until <= nowCT() ? { ...DEFAULTS.colors } : cur.colors;
    return json({ ...cur, colors, announce: live ? a : { on: false } });
  }
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const bad = await checkPin(store, b.pin, "banners", b);
  if (bad) return json({ error: bad.error }, bad.status);
  if (b.action === "image") {          // upload a new logo or tab icon, or go back to the built-in one
    const kind = b.kind === "icon" ? "icon" : "logo", next = merged(cur);
    if (b.reset) next.images[kind] = "";
    else {
      const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(String(b.data || ""));
      if (!m) return json({ error: "Use a PNG, JPG or WEBP picture." }, 400);
      const buf = Buffer.from(m[2], "base64");
      if (buf.length > MAX_IMG) return json({ error: "That picture is too big. Try one under 700 KB." }, 400);
      const id = kind + Date.now().toString(36) + "." + IMG_TYPES[m[1]];
      await store.set("site-img-" + id, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
      next.images[kind] = id;
    }
    next.updated = new Date().toISOString();
    await store.setJSON("site", next);
    return json({ ok: true, ...merged(next), defaults: DEFAULTS });
  }
  if (b.action === "save") {
    const next = merged(cur);
    if (b.hotHam) {
      const h = b.hotHam, days = [...new Set((Array.isArray(h.days) ? h.days : [h.day]).map(Number).filter(d => d >= 0 && d <= 6))].sort();
      if (!days.length || !T.test(h.from || "") || !T.test(h.until || "") || h.from >= h.until) return json({ error: "Hot Ham needs at least one day and a start time before the end time." }, 400);
      next.hotHam = { on: !!h.on, day: days[0], days, from: h.from, until: h.until, text: one(h.text, 80) || DEFAULTS.hotHam.text };
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
      for (const k of Object.keys(DEFAULTS.text)) {
        const v = b.text[k] === undefined ? next.text[k] : one(b.text[k], LIMITS[k] || 400);
        t[k] = v || (MAY_BE_EMPTY.has(k) ? "" : DEFAULTS.text[k]);
      }
      next.text = t;
    }
    if (b.info) {
      const phone = one(b.info.phone, 20), address = one(b.info.address, 120);
      if (phone.replace(/\D/g, "").length !== 10) return json({ error: "Enter a 10-digit phone number." }, 400);
      if (!address) return json({ error: "Enter the address." }, 400);
      const d = phone.replace(/\D/g, "");
      next.info = { phone: `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`, address };
    }
    if (b.colors) {
      const c = b.colors.reset ? { ...DEFAULTS.colors } : { main: b.colors.main, dark: b.colors.dark, light: b.colors.light };
      if (!Object.values(c).every(v => HEX.test(String(v || "")))) return json({ error: "Pick all three colors." }, 400);
      const until = !b.colors.reset && DT.test(b.colors.until || "") ? b.colors.until : "";
      if (until && until <= nowCT()) return json({ error: "That end time has already passed." }, 400);
      if (until) c.until = until;     // after this, the website goes back to the standard colors by itself
      next.colors = c;
    }
    if (b.email) {
      const reply = one(b.email.replyTo, 120).toLowerCase();
      if (reply && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(reply)) return json({ error: "Enter a valid reply-to email." }, 400);
      next.email = { fromName: one(b.email.fromName, 60) || DEFAULTS.email.fromName, replyTo: reply || DEFAULTS.email.replyTo, footer: one(b.email.footer, 300) };
    }
    if (b.social) {
      const soc = { on: !!b.social.on };
      for (const k of ["facebook", "instagram", "tiktok", "x", "youtube"]) {
        let u = one(b.social[k], 200);
        if (u && !/^https?:\/\//i.test(u)) u = "https://" + u;
        if (u && !/^https:\/\/[^\s<>"]+$/i.test(u.replace(/^http:/i, "https:"))) return json({ error: "That link doesn't look right: " + u }, 400);
        soc[k] = u.replace(/^http:/i, "https:");
      }
      next.social = soc;
    }
    if (b.settings) {
      const n = Math.round(Number(b.settings.newDays));
      if (!(n >= 1 && n <= 90)) return json({ error: "New Arrivals days must be 1 to 90." }, 400);
      const thc = String(b.settings.thcUntil || "");
      if (thc && !/^\d{4}-\d{2}-\d{2}$/.test(thc)) return json({ error: "Pick a date for the THC section." }, 400);
      const sc = Math.round(Number(b.settings.showCount ?? next.settings.showCount)), ac = Math.round(Number(b.settings.allocCount ?? next.settings.allocCount));
      if (!(sc >= 5 && sc <= 200) || !(ac >= 3 && ac <= 100)) return json({ error: "Show More counts must be 5 to 200 (Allocated: 3 to 100)." }, 400);
      const nc = Math.round(Number(b.settings.newCount ?? next.settings.newCount ?? 20));
      if (!(nc >= 3 && nc <= 200)) return json({ error: "New Arrivals count must be 3 to 200." }, 400);
      next.settings = { newDays: n, thcUntil: thc, newCount: nc, showCount: sc, allocCount: ac, sodaAlwaysIn: b.settings.sodaAlwaysIn === undefined ? next.settings.sodaAlwaysIn : !!b.settings.sodaAlwaysIn,
        thcNoteOn: b.settings.thcNoteOn === undefined ? next.settings.thcNoteOn !== false : !!b.settings.thcNoteOn };
    }
    next.updated = new Date().toISOString();
    await store.setJSON("site", next);
    return json({ ok: true, ...merged(next), defaults: DEFAULTS });
  }
  return json({ ok: true, ...cur, defaults: DEFAULTS });
};

export const config = { path: "/api/site" };

