// The Beer Depot — what customers search for, and their product requests
// ----------------------------------------------------------------------
// POST /api/insights { type:"search", q, found }              (from the website, no PIN)
// POST /api/insights { type:"request", item, name, phone }    (from the request box, no PIN)
// POST /api/insights { type:"report", pin, week? }            (Searches page, PIN required)
//
// Searches are counted per week (Central time). Requests keep the latest 300.
// Everything is stored in Netlify Blobs; nothing here needs a deploy.

import { getStore } from "@netlify/blobs";
import { checkPin, json } from "../lib/pin.mjs";

const STORE = "beer-depot";
const MAX_TERMS_PER_WEEK = 3000;
const MAX_REQUESTS = 300;

// ISO week in America/Chicago, e.g. "2026-W45"
export function weekKey(date = new Date()) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const d = new Date(ymd + "T12:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;            // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3);         // Thursday of this week
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function prevWeekKey(key) {
  // step back 7 days from the Thursday of `key`
  const [y, w] = key.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const thu = new Date(jan4); thu.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3 + (w - 1) * 7 - 7);
  return weekKey(thu);
}

const clean = (s, max) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const store = getStore({ name: STORE, consistency: "strong" });

  if (body.type === "search") {
    const q = clean(body.q, 60).toLowerCase();
    if (q.length < 2) return json({ ok: true });
    const key = "searches-" + weekKey();
    const data = (await store.get(key, { type: "json" })) || { terms: {} };
    const t = data.terms[q];
    if (!t && Object.keys(data.terms).length >= MAX_TERMS_PER_WEEK) return json({ ok: true });
    const found = Math.max(0, Number(body.found) || 0);
    data.terms[q] = { n: (t?.n || 0) + 1, none: (t?.none || 0) + (found === 0 ? 1 : 0) };
    await store.setJSON(key, data);
    return json({ ok: true });
  }

  if (body.type === "request") {
    const item = clean(body.item, 500);
    if (!item) return json({ error: "Bad request." }, 400);
    const list = (await store.get("requests", { type: "json" })) || [];
    list.unshift({ item, name: clean(body.name, 80), phone: clean(body.phone, 20), at: new Date().toISOString() });
    await store.setJSON("requests", list.slice(0, MAX_REQUESTS));
    return json({ ok: true });
  }

  if (body.type === "report") {
    const bad = await checkPin(store, body.pin);
    if (bad) return json({ error: bad.error }, bad.status);
    const week = /^\d{4}-W\d{2}$/.test(body.week || "") ? body.week : weekKey();
    const data = (await store.get("searches-" + week, { type: "json" })) || { terms: {} };
    const rows = Object.entries(data.terms).map(([q, t]) => ({ q, n: t.n, none: t.none }));
    const top = [...rows].sort((a, b) => b.n - a.n).slice(0, 50);
    const noResults = rows.filter(r => r.none > 0).sort((a, b) => b.none - a.none).slice(0, 50);
    const requests = (await store.get("requests", { type: "json" })) || [];
    return json({
      week, thisWeek: weekKey(), prevWeek: prevWeekKey(week),
      totalSearches: rows.reduce((s, r) => s + r.n, 0),
      top, noResults, requests: requests.slice(0, 100),
    });
  }

  return json({ error: "Bad request." }, 400);
};

export const config = { path: "/api/insights" };
