// The Beer Depot — employee schedule (Store Tools → Schedule). Everyone with a PIN can look; only the owner
// (or a staff member given the "Schedule" tab) can edit. Anyone can offer a shift, swap with a coworker or take an open shift.
// Blob "schedule" = { presets:[{id,name,start,end,color}], shifts:{ "YYYY-MM-DD":[{id,who,start,end,note}] },
//                     requests:[...], settings:{ approval, ownerName, hide:[ids] }, updated }
//   who = "owner", a person on the schedule (settings.people, they do not need a PIN), a staff id with no person, or "" for an Open Shift.
//   settings.people = [{id,name,staffId?}]: staffId links a person to a Store Tools PIN so that person sees their own shifts.
//   The first time (nothing saved yet) the November 2026 paper calendar in lib/schedule-seed.json is loaded.
// POST /api/schedule { pin, action, ... }
//   anyone with a PIN: get {from,to} | badge | give | swap | take | answer | cancel
//   manager only:      batch (add one shift to many days) | batchRemove | save | delete | copyWeek | clearWeek | presets | settings | resolve
// Swap flow: give -> status "open" (anyone may take) ; swap -> "ask" (the coworker answers) ; then "approve" (owner OKs, only if
// the approval setting is on) ; then "done". Every move checks nobody ends up double-booked.

import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import { checkPin, pinUser, json } from "../lib/pin.mjs";
import { sendMail, SITE } from "../lib/club-email.mjs";
import { storeInfo } from "../lib/info.mjs";
import seed from "../lib/schedule-seed.json" with { type: "json" };

const KEY = "schedule";
const D = /^\d{4}-\d{2}-\d{2}$/;
const T = /^([01]\d|2[0-3]):[0-5]\d$/;
const one = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim()) && String(e).length <= 80;
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
  d.settings.people = (Array.isArray(d.settings.people) ? d.settings.people : []).filter(p => p && typeof p.id === "string" && p.name).map(p => ({ id: p.id, name: one(p.name, 30), staffId: p.staffId ? String(p.staffId) : "", email: validEmail(p.email) ? String(p.email).trim() : "" }));
  d.settings.colors = d.settings.colors && typeof d.settings.colors === "object" ? d.settings.colors : {};
  if (!T.test(String(d.settings.nightFrom || ""))) d.settings.nightFrom = "12:00";
  d.settings.hide = Array.isArray(d.settings.hide) ? d.settings.hide.filter(x => typeof x === "string") : [];
  return d;
}

export function seeded() {
  const d = clean({ presets: null, shifts: JSON.parse(JSON.stringify(seed.shifts)), settings: { approval: true, ownerName: seed.ownerName, people: seed.people.map(p => ({ ...p })) } });
  return d;
}
async function staffOf(store) { return (((await store.get("staff", { type: "json" })) || { members: [] }).members || []).filter(m => m.on !== false); }
async function teamOf(store, d) {
  const staff = await staffOf(store), linked = new Set(d.settings.people.map(p => p.staffId).filter(Boolean));
  return [{ id: "owner", name: d.settings.ownerName }, ...d.settings.people.map(p => ({ id: p.id, name: p.name, staffId: p.staffId })), ...staff.filter(m => !linked.has(m.id)).map(m => ({ id: m.id, name: m.name }))]
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

const fT = t => { let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return h + (m ? ":" + String(m).padStart(2, "0") : "") + " " + ap; };
const fD = s => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const fS = (date, a) => `${fD(date)} ${fT(a.start)} – ${fT(a.end)}`;
const hesc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Email a person (best effort). Returns true if an email went out. People without an email just see it in Store Tools.
async function tell(store, d, toId, subject, lines) {
  const pe = d.settings.people.find(p => p.id === toId);
  if (!pe || !pe.email) return false;
  try {
    const info = await storeInfo(store), link = SITE + "/food-stock#schedule";
    const text = lines.join("\n\n") + "\n\nOpen the schedule: " + link;
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:16px">${lines.map(l => `<p style="font-size:17px;line-height:1.4;color:#22160F">${hesc(l)}</p>`).join("")}<p><a href="${link}" style="display:inline-block;background:#F26B1D;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold">Open the Schedule</a></p><p style="color:#8C7F74;font-size:12px">The Beer Depot · you can say yes or no after you sign in with your PIN.</p></div>`;
    await sendMail({ to: pe.email, subject, html, text, info });
    return true;
  } catch (e) { console.error("schedule email", e); return false; }
}

function view(d, team, me, from, to, staff) {
  const shifts = {};
  for (const [date, list] of Object.entries(d.shifts)) if (date >= from && date <= to && list.length) shifts[date] = list;
  const cutoff = Date.now() - 14 * 86400000;
  const requests = d.requests.filter(r => ["open", "ask", "approve"].includes(r.status) || (r.closed && Date.parse(r.closed) > cutoff)).slice(0, 60);
  const settings = me.manager ? d.settings : { ...d.settings, people: d.settings.people.map(({ email, ...p }) => p) };
  return { ok: true, me, team, presets: d.presets, settings, shifts, requests, staff: me.manager ? (staff || []).map(m => ({ id: m.id, name: m.name })) : [], ...counts(d, me), today: today() };
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
  const MANAGER = ["save", "delete", "copyWeek", "clearWeek", "presets", "settings", "resolve", "addPerson", "updatePerson", "removePerson", "batch", "batchRemove"];
  const bad = await checkPin(store, b.pin, MANAGER.includes(act) ? "schedule" : null, ["get", "badge"].includes(act) ? null : b, "schedule");
  if (bad) return json({ error: bad.error }, bad.status);

  const who = await pinUser(store, b.pin);
  const raw = await store.get(KEY, { type: "json" });
  const d = raw ? clean(raw) : seeded();
  let team = await teamOf(store, d);
  const mePerson = who.owner ? null : d.settings.people.find(p => p.staffId === who.id);
  const me = { id: who.owner ? "owner" : mePerson ? mePerson.id : who.id, name: who.owner ? d.settings.ownerName : who.name, manager: !!who.owner || (who.tabs || []).includes("schedule"), owner: !!who.owner };
  const name = id => (team.find(p => p.id === id) || { name: "Former Employee" }).name;
  const isDate = x => D.test(String(x || ""));
  const ok = async (extra) => {
    // tidy: drop very old shifts and old finished requests
    const old = addDays(today(), -400);
    for (const k of Object.keys(d.shifts)) if (k < old || !d.shifts[k].length) delete d.shifts[k];
    d.requests = d.requests.filter(r => ["open", "ask", "approve"].includes(r.status) || (r.closed && Date.parse(r.closed) > Date.now() - 30 * 86400000)).slice(0, 200);
    sweep(d);
    d.updated = new Date().toISOString();
    await store.setJSON(KEY, d);
    team = await teamOf(store, d);
    const from = isDate(b.from) ? b.from : addDays(today(), -7), to = isDate(b.to) ? b.to : addDays(from, 40);
    return json({ ...view(d, team, me, from, to, await staffOf(store)), ...(extra || {}) });
  };

  if (act === "badge") { const c = counts(d, me); return json({ ok: true, count: c.needs + c.offers }); }
  if (act === "get" || !act) {
    const from = isDate(b.from) ? b.from : addDays(today(), -7);
    let to = isDate(b.to) ? b.to : addDays(from, 13);
    if (to > addDays(from, 62)) to = addDays(from, 62);
    return json(view(d, team, me, from, to, await staffOf(store)));
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
  if (act === "batch" || act === "batchRemove") {
    const dates = [...new Set((Array.isArray(b.dates) ? b.dates : []).filter(isDate))].slice(0, 62);
    if (!dates.length) return json({ error: "Pick some days first." }, 400);
    if (act === "batch") {
      if (!T.test(String(b.start || "")) || !T.test(String(b.end || "")) || b.start >= b.end) return json({ error: "Pick a start time that is before the end time." }, 400);
      const w = b.who ? String(b.who) : "";
      if (w && !team.some(p => p.id === w)) return json({ error: "Pick someone from the team." }, 400);
      let added = 0, skipped = 0;
      for (const date of dates) {
        const list = d.shifts[date] = d.shifts[date] || [];
        const dup = w ? clash(d, date, w, b.start, b.end, []) : list.some(s => !s.who && s.start === b.start && s.end === b.end);
        if (dup) { skipped++; continue; }
        list.push({ id: rid(), who: w, start: b.start, end: b.end, note: one(b.note, 60) });
        list.sort((x, y) => x.start.localeCompare(y.start) || x.end.localeCompare(y.end));
        added++;
      }
      return ok({ added, skipped });
    }
    const all = b.who === undefined || b.who === null; let removed = 0;
    for (const date of dates) {
      const list = d.shifts[date] || [], keep = list.filter(s => !(all || s.who === String(b.who)));
      removed += list.length - keep.length; d.shifts[date] = keep;
    }
    return ok({ removed });
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
  if (act === "addPerson" || act === "updatePerson" || act === "removePerson") {
    const people = d.settings.people, staff = await staffOf(store);
    if (act === "addPerson") {
      const nm = one(b.name, 30); if (!nm) return json({ error: "Type the person's name." }, 400);
      if (people.length >= 40) return json({ error: "That's the limit of people on the schedule." }, 400);
      if (team.some(p => p.name.toLowerCase() === nm.toLowerCase())) return json({ error: "Someone with that name is already on the schedule." }, 400);
      const pid = "pe-" + rid();
      people.push({ id: pid, name: nm, staffId: "", email: validEmail(b.email) ? String(b.email).trim() : "" });
      if (/^#[0-9A-Fa-f]{6}$/.test(String(b.color || ""))) d.settings.colors[pid] = String(b.color);
    } else {
      const pe = people.find(x => x.id === b.id); if (!pe) return json({ error: "Not found." }, 404);
      if (act === "removePerson") {
        d.settings.people = people.filter(x => x.id !== b.id);
        for (const list of Object.values(d.shifts)) for (const s of list) if (s.who === b.id) s.who = "";   // their shifts become Open Shifts
      } else {
        if (b.name !== undefined) { const nm = one(b.name, 30); if (nm) pe.name = nm; }
        if (b.email !== undefined) { const em = String(b.email || "").trim(); if (em && !validEmail(em)) return json({ error: "That email doesn't look right." }, 400); pe.email = em; }
        if (b.staffId !== undefined) {
          const sid = String(b.staffId || "");
          if (sid && !staff.some(m => m.id === sid)) return json({ error: "Pick someone from the Staff tab." }, 400);
          if (sid && people.some(x => x.id !== pe.id && x.staffId === sid)) return json({ error: "That login is already linked to someone else." }, 400);
          pe.staffId = sid;
        }
      }
    }
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
    let emailed = false;
    if (act === "swap") emailed = await tell(store, d, r.withWho, `${name(me.id)} wants to swap shifts with you`, [`${name(me.id)} asked to swap shifts with you.`, `They would work your ${fS(r.withDate, r.b)} and you would work their ${fS(r.date, r.a)}.`, ...(r.note ? [`Note: ${r.note}`] : []), "Sign in to say yes or no."]);
    return ok({ notified: act === "swap" ? (emailed ? "email" : "app") : "" });
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
    const who2 = name(me.id), what = `your ${fS(r.date, r.a)} for their ${fS(r.withDate, r.b)}`;
    if (!b.accept) { r.status = "declined"; r.closed = new Date().toISOString(); await tell(store, d, r.by, `${who2} said no to the swap`, [`${who2} said no to swapping ${what}.`]); return ok(); }
    if (needsOk() === "approve") r.status = "approve";
    else { const e = carryOut(d, r, name); if (e) return json({ error: e }, 400); }
    await tell(store, d, r.by, `${who2} said yes to the swap`, [`${who2} said yes to swapping ${what}.`, r.status === "approve" ? "It now waits for the owner's OK." : "The schedule is updated."]);
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
