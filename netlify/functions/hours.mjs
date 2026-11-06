// The Beer Depot — store hours (edited in Store Tools → Hours)
// GET  /api/hours                         -> { weekly, overrides, updated }
//        weekly: null (use the built-in hours on the website) or 7 rows [open, close] for Sunday..Saturday, ["",""] = closed
//        overrides: one-day changes [{ date:"YYYY-MM-DD", closed:bool, open, close, note }] — only today and later
// POST /api/hours { pin, action:"list" }                          -> same, for Store Tools
// POST /api/hours { pin, action:"save", weekly?, overrides? }     -> saves what's sent (past one-day changes are dropped)
// A one-day change applies only to its date, so the day after it everything is back to normal by itself.

import { getStore } from "@netlify/blobs";
import { checkPin, json } from "../lib/pin.mjs";

const KEY = "hours";
const T = /^([01]\d|2[0-3]):[0-5]\d$/;
const D = /^\d{4}-\d{2}-\d{2}$/;

function chicagoToday() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return p;   // YYYY-MM-DD
}
const upcoming = list => (list || []).filter(o => o.date >= chicagoToday()).sort((a, b) => a.date.localeCompare(b.date));

export default async (req) => {
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  const cur = (await store.get(KEY, { type: "json" })) || { weekly: null, overrides: [] };
  const view = d => ({ weekly: d.weekly || null, overrides: upcoming(d.overrides), updated: d.updated });

  if (req.method === "GET") return json(view(cur));
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const bad = await checkPin(store, body.pin, "hours");
  if (bad) return json({ error: bad.error }, bad.status);
  if (body.action !== "save") return json({ ok: true, ...view(cur) });

  const next = { ...cur };
  if (body.weekly !== undefined) {
    if (!Array.isArray(body.weekly) || body.weekly.length !== 7) return json({ error: "Bad request." }, 400);
    const rows = [];
    for (const r of body.weekly) {
      const o = String((r || [])[0] || ""), c = String((r || [])[1] || "");
      if (!o && !c) { rows.push(["", ""]); continue; }
      if (!T.test(o) || !T.test(c) || o >= c) return json({ error: "Each open day needs an opening time before its closing time." }, 400);
      rows.push([o, c]);
    }
    next.weekly = rows;
  }
  if (body.overrides !== undefined) {
    if (!Array.isArray(body.overrides)) return json({ error: "Bad request." }, 400);
    const byDate = {};
    for (const x of body.overrides.slice(0, 40)) {
      const date = String(x.date || "");
      if (!D.test(date)) return json({ error: "Pick a date." }, 400);
      const closed = !!x.closed;
      const o = { date, closed, open: "", close: "", note: String(x.note || "").replace(/\s+/g, " ").trim().slice(0, 60) };
      if (!closed) {
        if (!T.test(String(x.open || "")) || !T.test(String(x.close || "")) || x.open >= x.close) return json({ error: "Opening time must be before closing time." }, 400);
        o.open = x.open; o.close = x.close;
      }
      byDate[date] = o;
    }
    next.overrides = upcoming(Object.values(byDate));
  } else next.overrides = upcoming(cur.overrides);
  next.updated = new Date().toISOString();
  await store.setJSON(KEY, next);
  return json({ ok: true, ...view(next) });
};

export const config = { path: "/api/hours" };
