// The Beer Depot — employee schedule (Store Tools → Schedule). Everyone with a PIN can look; only the owner
// (or a staff member given the "Schedule" tab) can edit. Anyone can offer a shift, swap with a coworker or take an open shift.
// Blob "schedule" = { presets:[{id,name,start,end,color}], shifts:{ "YYYY-MM-DD":[{id,who,start,end,note}] },
//                     requests:[...], settings:{ approval, ownerName, hide:[ids] }, updated }
//   who = a staff id, "owner", or "" for an Open Shift.
// POST /api/schedule { pin, action, ... }
//   anyone with a PIN: get {from,to} | badge | give | swap | take | answer | cancel
//   manager only:      save | delete | copyWeek | clearWeek | presets | settings | resolve
// Swap flow: give -> status "open" (anyone may take) ; swap -> "ask" (the coworker answers) ; then "approve" (owner OKs, only if
// the approval setting is on) ; then "done". Every move checks nobody ends up double-booked.

import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import { checkPin, pinUser, json } from "../lib/pin.mjs";

const KEY = "schedule";
const D = /^\d{4}-\d{2}-\d{2}$/;
const T = /^([01]\d|2[0-3]):[0-5]\d$/;
const one = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const rid = () => randomBytes(5).toString("hex");
const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const COLORS = ["#F26B1D", "#1F7A3A", "#2F6DB5", "#8A4FBF", "#C8102E", "#B8860B", "#2B1A10"];
export const DEFAULT_PRESETS = [
  { id: "p1", name: "Open", start: "08:30", end: "16:00", color: COLORS[0] },
  { id: "p2", name: "Open Short", start: "08:30", end: "15:00", color: COLORS[1] },
  { id: "p3", name: "Mid", start: "12:00", end: "20:00", color: COLORS[2] },
  { id: "p4", name: "Mid Late", start: "12:00", end: "21:00", color: COLORS[3] },
  { id: "p5", name: "Close", start: "16:30", end: "21:00", color: COLORS[4] },
];

function clean(d) {
  d = d || {};
  d.presets = Array.isArray(d.presets) && d.presets.length ? d.presets : DEFAULT_PRESETS.map(p => ({ ...p }));
  d.shifts = d.shifts && typeof d.shifts === "object" ? d.shifts : {};
  d.requests = Array.isArray(d.requests) ? d.requests : [];
  d.settings = d.settings && typeof d.settings === "object" ? d.settings : {};
  if (typeof d.settings.approval !== "boolean") d.settings.approval = true;
  d.settings.ownerName = one(d.settings.ownerName, 30) || "Owner";
  d.settings.colors = d.settings.colors && typeof d.settings.colors === "object" ? d.settings.colors : {};
  if (!T.test(String(d.settings.nightFrom || ""))) d.settings.nightFrom = "12:00";
  d.settings.hide = Array.isArray(d.settings.hide) ? d.settings.hide.filter(x => typeof x === "string") : [];
  return d;
}

async function teamOf(store, d) {
  const staff = ((await store.get("staff", { type: "json" })) || { members: [] }).members || [];
  return [{ id: "owner", name: d.settings.ownerName }, ...staff.filter(m => m.on !== false).map(m => ({ id: m.id, name: m.name }))]
    .map(p => ({ ...p, hidden: d.settings.hide.includes(p.id) }));
}

const findShift = (d, date, sid) => (d.shifts[date] || []).find(s => s.id === sid);
const clash = (d, date, who, start, end, ignore) => !!who && (d.shifts[date] || []).some(s => s.who === who && !ignore.includes(s.id) && s.start < end && start < s.end);
const snap = s => s && ({ start: s.start, end: s.end });

// Cancel waiting requests whose shifts no longer belong to the right person (the owner edited the schedule).
function sweep(d) {
  for (const r of d.requests) {
    if (!["open", "ask", "approve"].includes(r.status)) continue;
    const a = findShift(d, r.date, r.shiftId), b = r.kind === "swap" ? findShift(d, r.withDate, r.withShiftId) : true;
    if (!a || a.who !== r.by || !b || (r.kind === "swap" && b.who !== r.withWho)) { r.status = "cancelled"; r.why = "The schedule changed."; r.closed = new Date().toISOString(); }
  }
}

// Make a finished request real. Returns an error sentence or "".
function carryOut(d, r, name) {
  const a = findShift(d, r.date, r.shiftId);
  if (!a || a.who !== r.by) return "That shift changed. Ask again.";
  if (r.kind === "claim") {
    if (clash(d, r.date, r.taker, a.start, a.end, [a.id])) return `${name(r.taker)} already works then.`;
    a.who = r.taker;
  } else if (r.kind === "give") {
    if (clash(d, r.date, r.taker, a.start, a.end, [a.id])) return `${name(r.taker)} already works then.`;
    a.who = r.taker;
  } else {
    const b = findShift(d, r.withDate, r.withShiftId);
    if (!b || b.who !== r.withWho) return "The other shift changed. Ask again.";
    if (clash(d, r.withDate, r.by, b.start, b.end, [a.id, b.id])) return `${name(r.by)} already works then.`;
    if (clash(d, r.date, r.withWho, a.start, a.end, [a.id, b.id])) return `${name(r.withWho)} already works then.`;
    a.who = r.withWho; b.who = r.by;
  }
  r.status = "done"; r.closed = new Date().toISOString();
  return "";
}

function view(d, team, me, from, to) {
  const shifts = {};
  for (const [date, list] of Object.entries(d.shifts)) if (date >= from && date <= to && list.length) shifts[date] = list;
  const cutoff = Date.now() - 14 * 86400000;
  const requests = d.requests.filter(r => ["open", "ask", "approve"].includes(r.status) || (r.closed && Date.parse(r.closed) > cutoff)).slice(0, 60);
  return { ok: true, me, team, presets: d.presets, settings: d.settings, shifts, requests, ...counts(d, me), today: today() };
}
function counts(d, me) {
  let needs = 0, offers = 0;
  for (const r of d.requests) {
    if (r.date < today()) continue;
    if (r.status === "ask" && r.withWho === me.id) needs++;
    if (r.status === "approve" && me.manager) needs++;
    if (r.status === "open" && r.by !== me.id) offers++;
  }
  return { needs, offers };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const act = b.action;
  const MANAGER = ["save", "delete", "copyWeek", "clearWeek", "presets", "settings", "resolve"];
  const bad = await checkPin(store, b.pin, MANAGER.includes(act) ? "schedule" : null, ["get", "badge"].includes(act) ? null : b, "schedule");
  if (bad) return json({ error: bad.error }, bad.status);

  const who = await pinUser(store, b.pin);
  const d = clean(await store.get(KEY, { type: "json" }));
  const team = await teamOf(store, d);
  const me = { id: who.owner ? "owner" : who.id, name: who.owner ? d.settings.ownerName : who.name, manager: !!who.owner || (who.tabs || []).includes("schedule"), owner: !!who.owner };
  const name = id => (team.find(p => p.id === id) || { name: "Former Employee" }).name;
  const isDate = x => D.test(String(x || ""));
  const ok = async () => {
    // tidy: drop very old shifts and old finished requests
    const old = addDays(today(), -400);
    for (const k of Object.keys(d.shifts)) if (k < old || !d.shifts[k].length) delete d.shifts[k];
    d.requests = d.requests.filter(r => ["open", "ask", "approve"].includes(r.status) || (r.closed && Date.parse(r.closed) > Date.now() - 30 * 86400000)).slice(0, 200);
    sweep(d);
    d.updated = new Date().toISOString();
    await store.setJSON(KEY, d);
    const from = isDate(b.from) ? b.from : addDays(today(), -7), to = isDate(b.to) ? b.to : addDays(from, 40);
    return json(view(d, team, me, from, to));
  };

  if (act === "badge") { const c = counts(d, me); return json({ ok: true, count: c.needs + c.offers }); }
  if (act === "get" || !act) {
    const from = isDate(b.from) ? b.from : addDays(today(), -7);
    let to = isDate(b.to) ? b.to : addDays(from, 13);
    if (to > addDays(from, 62)) to = addDays(from, 62);
    return json(view(d, team, me, from, to));
  }

  /* ---------- manager ---------- */
  if (act === "save") {
    if (!isDate(b.date) || !T.test(String(b.start || "")) || !T.test(String(b.end || "")) || b.start >= b.end) return json({ error: "Pick a start time that is before the end time." }, 400);
    const w = b.who ? String(b.who) : "";
    if (w && !team.some(p => p.id === w)) return json({ error: "Pick someone from the team." }, 400);
    const list = d.shifts[b.date] = d.shifts[b.date] || [];
    const cur = b.id ? list.find(s => s.id === b.id) : null;
    if (clash(d, b.date, w, b.start, b.end, cur ? [cur.id] : [])) return json({ error: `${name(w)} already works then.` }, 400);
    const row = { id: cur ? cur.id : rid(), who: w, start: b.start, end: b.end, note: one(b.note, 60) };
    if (cur) Object.assign(cur, row); else list.push(row);
    list.sort((x, y) => x.start.localeCompare(y.start) || x.end.localeCompare(y.end));
    return ok();
  }
  if (act === "delete") {
    if (!isDate(b.date)) return json({ error: "Bad request." }, 400);
    d.shifts[b.date] = (d.shifts[b.date] || []).filter(s => s.id !== b.id);
    return ok();
  }
  if (act === "copyWeek" || act === "clearWeek") {
    const start = act === "copyWeek" ? b.to : b.start;
    if (!isDate(start) || (act === "copyWeek" && !isDate(b.from))) return json({ error: "Bad request." }, 400);
    for (let i = 0; i < 7; i++) {
      const dst = addDays(start, i);
      if (act === "clearWeek" || b.replace) delete d.shifts[dst];
      if (act === "copyWeek") {
        const src = (d.shifts[addDays(b.from, i)] || []).map(s => ({ ...s, id: rid() }));
        d.shifts[dst] = [...(d.shifts[dst] || []), ...src.filter(s => !(d.shifts[dst] || []).some(e => e.who === s.who && e.start === s.start && e.end === s.end))];
      }
    }
    return ok();
  }
  if (act === "presets") {
    const list = (Array.isArray(b.presets) ? b.presets : []).slice(0, 20).map((p, i) => ({
      id: one(p.id, 12) || "p" + rid(), name: one(p.name, 24), start: String(p.start || ""), end: String(p.end || ""), color: COLORS.includes(p.color) ? p.color : COLORS[i % COLORS.length] }));
    if (!list.length) return json({ error: "Keep at least one preset." }, 400);
    if (list.some(p => !T.test(p.start) || !T.test(p.end) || p.start >= p.end)) return json({ error: "Each preset needs a start time before its end time." }, 400);
    d.presets = list;
    return ok();
  }
  if (act === "settings") {
    if (typeof b.approval === "boolean") d.settings.approval = b.approval;
    if (b.ownerName !== undefined) d.settings.ownerName = one(b.ownerName, 30) || "Owner";
    if (b.colors && typeof b.colors === "object") {
      const c = {};
      for (const [k, x] of Object.entries(b.colors).slice(0, 80)) if (/^#[0-9A-Fa-f]{6}$/.test(String(x))) c[String(k).slice(0, 24)] = String(x);
      d.settings.colors = c;
    }
    if (b.nightFrom !== undefined) { if (!T.test(String(b.nightFrom))) return json({ error: "Pick a time." }, 400); d.settings.nightFrom = String(b.nightFrom); }
    if (Array.isArray(b.hide)) d.settings.hide = b.hide.filter(x => typeof x === "string").slice(0, 60);
    return ok();
  }
  if (act === "resolve") {
    const r = d.requests.find(x => x.id === b.id);
    if (!r || r.status !== "approve") return json({ error: "That request is already finished." }, 400);
    if (b.approve) { const e = carryOut(d, r, name); if (e) return json({ error: e }, 400); }
    else { r.status = "declined"; r.closed = new Date().toISOString(); }
    return ok();
  }

  /* ---------- everyone ---------- */
  const mine = (date, sid) => { const s = findShift(d, date, sid); return s && s.who === me.id ? s : null; };
  const needsOk = () => (d.settings.approval ? "approve" : "go");
  if (act === "give" || act === "swap") {
    if (!isDate(b.date) || b.date < today()) return json({ error: "Pick a shift that hasn't happened yet." }, 400);
    const a = mine(b.date, b.shiftId);
    if (!a) return json({ error: "That isn't your shift." }, 400);
    if (d.requests.some(r => ["open", "ask", "approve"].includes(r.status) && r.date === b.date && r.shiftId === a.id)) return json({ error: "That shift already has a request waiting." }, 400);
    const r = { id: rid(), kind: act, status: "open", by: me.id, date: b.date, shiftId: a.id, a: snap(a), note: one(b.note, 80), at: new Date().toISOString() };
    if (act === "swap") {
      const o = findShift(d, b.withDate, b.withShiftId);
      if (!o || !o.who || o.who === me.id || b.withDate < today()) return json({ error: "Pick a coworker's shift." }, 400);
      Object.assign(r, { status: "ask", withWho: o.who, withDate: b.withDate, withShiftId: o.id, b: snap(o) });
    }
    d.requests.unshift(r);
    return ok();
  }
  if (act === "take") {
    const r = d.requests.find(x => x.id === b.id);
    if (!r || r.status !== "open" || r.kind !== "give") return json({ error: "Someone already took it, or it was cancelled." }, 400);
    if (r.by === me.id) return json({ error: "That's your own shift." }, 400);
    const a = findShift(d, r.date, r.shiftId);
    if (!a || a.who !== r.by) return json({ error: "That shift changed." }, 400);
    if (clash(d, r.date, me.id, a.start, a.end, [])) return json({ error: "You already work then." }, 400);
    r.taker = me.id;
    if (needsOk() === "approve") r.status = "approve";
    else { const e = carryOut(d, r, name); if (e) return json({ error: e }, 400); }
    return ok();
  }
  if (act === "openTake") {   // take an Open Shift the owner left empty
    if (!isDate(b.date)) return json({ error: "Bad request." }, 400);
    const s = findShift(d, b.date, b.shiftId);
    if (!s || s.who) return json({ error: "Someone already has that shift." }, 400);
    if (clash(d, b.date, me.id, s.start, s.end, [])) return json({ error: "You already work then." }, 400);
    if (needsOk() === "approve") {
      if (d.requests.some(r => r.kind === "claim" && r.shiftId === s.id && r.status === "approve")) return json({ error: "Someone already asked for that one." }, 400);
      d.requests.unshift({ id: rid(), kind: "claim", status: "approve", by: "", taker: me.id, date: b.date, shiftId: s.id, a: snap(s), at: new Date().toISOString() });
    } else s.who = me.id;
    return ok();
  }
  if (act === "answer") {
    const r = d.requests.find(x => x.id === b.id);
    if (!r || r.status !== "ask" || r.withWho !== me.id) return json({ error: "That request is already finished." }, 400);
    if (!b.accept) { r.status = "declined"; r.closed = new Date().toISOString(); return ok(); }
    if (needsOk() === "approve") r.status = "approve";
    else { const e = carryOut(d, r, name); if (e) return json({ error: e }, 400); }
    return ok();
  }
  if (act === "cancel") {
    const r = d.requests.find(x => x.id === b.id);
    if (!r || !["open", "ask", "approve"].includes(r.status)) return json({ error: "That request is already finished." }, 400);
    if (r.by !== me.id && r.taker !== me.id && !me.manager) return json({ error: "That isn't your request." }, 403);
    r.status = "cancelled"; r.closed = new Date().toISOString();
    return ok();
  }
  return json({ error: "Bad request." }, 400);
};

export const config = { path: "/api/schedule" };
