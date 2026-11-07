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
import { buildReport } from "../lib/schedule-report.mjs";
import { backupNow, lastBackup } from "../lib/schedule-backup.mjs";
import { ALERTS, alertSettings, buildAlert, sendPush } from "../lib/push.mjs";
import seed from "../lib/schedule-seed.json" with { type: "json" };

const KEY = "schedule";
const D = /^\d{4}-\d{2}-\d{2}$/;
const T = /^([01]\d|2[0-3]):[0-5]\d$/;
const one = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim()) && String(e).length <= 80;
const rid = () => randomBytes(5).toString("hex");
const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const nowHM = () => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(/^24:/, "00:");
// Paychecks go out Friday 9 AM (store time). A request made before then is for today, after that for next Friday.
const nextPayday = () => { const t = today(), dow = new Date(t + "T12:00:00Z").getUTCDay(); let add = (5 - dow + 7) % 7; if (add === 0 && nowHM() >= "09:00") add = 7; return addDays(t, add); };
const PAL = ["#E6194B","#F58231","#D9A000","#6BA814","#1E8E3E","#008080","#0097B2","#4363D8","#1B1F6B","#911EB4","#8E7CC3","#D81FD1","#F06292","#800000","#8B5A2B","#808000","#5B6770","#222222","#3FA7E0","#5E2750"];   // same list as SCH_PAL in tools/schedule_ui.js (default person colors, in team order)
const COLORS = ["#F26B1D", "#1F7A3A", "#2F6DB5", "#8A4FBF", "#C8102E", "#B8860B", "#2B1A10"];
export const DEFAULT_PRESETS = [
  { id: "p1", name: "Open", start: "08:30", end: "16:00", color: COLORS[0] },
  { id: "p2", name: "Open Short", start: "08:30", end: "15:00", color: COLORS[1] },
  { id: "p3", name: "Mid", start: "12:00", end: "20:00", color: COLORS[2] },
  { id: "p4", name: "Mid Late", start: "12:00", end: "21:00", color: COLORS[3] },
  { id: "p5", name: "Close", start: "16:30", end: "21:00", color: COLORS[4] },
];

export function clean(d) {
  d = d || {};
  d.presets = Array.isArray(d.presets) && d.presets.length ? d.presets : DEFAULT_PRESETS.map(p => ({ ...p }));
  d.shifts = d.shifts && typeof d.shifts === "object" ? d.shifts : {};
  d.requests = Array.isArray(d.requests) ? d.requests : [];
  d.settings = d.settings && typeof d.settings === "object" ? d.settings : {};
  d.settings.approval = true;   // employees can never change shifts without the owner's OK
  d.settings.ownerName = one(d.settings.ownerName, 30) || "Owner";
  d.settings.people = (Array.isArray(d.settings.people) ? d.settings.people : []).filter(p => p && typeof p.id === "string" && p.name).map(p => ({ id: p.id, name: one(p.name, 30), staffId: p.staffId ? String(p.staffId) : "", email: validEmail(p.email) ? String(p.email).trim() : "" }));
  const rp = d.settings.report && typeof d.settings.report === "object" ? d.settings.report : {};   // Friday hours email to the owner
  d.settings.report = { on: rp.on !== false, email: rp.email === undefined ? "tyler@beerdepotpewaukee.com" : (validEmail(rp.email) ? String(rp.email).trim() : "") };
  d.settings.notify = alertSettings(d.settings.notify);   // push alerts: {on, kinds:{swapAsk,..:{on,title,body}}}
  const pe = d.settings.pending && typeof d.settings.pending === "object" ? d.settings.pending : {};   // alerts waiting for "Confirm Schedule": { who:{personId:[dates]}, open:[dates] }
  const ds = a => [...new Set((Array.isArray(a) ? a : []).filter(x => D.test(String(x))))].sort().slice(0, 400);
  d.settings.pending = { who: {}, open: ds(pe.open) };
  for (const [k, v] of Object.entries(pe.who && typeof pe.who === "object" ? pe.who : {})) { const a = ds(v); if (a.length) d.settings.pending.who[String(k).slice(0, 40)] = a; }
  // Months employees may see ("YYYY-MM"). Past and current months are always visible; a later month stays hidden from non-managers until "Confirm Schedule".
  // First time (nothing saved): every month that already has shifts counts as published, so nothing suddenly disappears.
  d.settings.published = Array.isArray(d.settings.published) ? [...new Set(d.settings.published.filter(x => /^\d{4}-\d{2}$/.test(String(x))))].sort().slice(0, 60)
    : [...new Set(Object.entries(d.shifts).filter(([, l]) => l.length).map(([k]) => k.slice(0, 7)))].sort();
  d.settings.colors = d.settings.colors && typeof d.settings.colors === "object" ? d.settings.colors : {};
  if (!T.test(String(d.settings.nightFrom || ""))) d.settings.nightFrom = "12:00";
  // Timecards: one per worked shift {id,date,who,name,shiftId,in,out,sent,paid,paidAt}. Paid ones are kept for 30 days (the "Past Hours" list), then dropped.
  d.cards = (Array.isArray(d.cards) ? d.cards : []).filter(c => c && typeof c.id === "string" && D.test(String(c.date)) && T.test(String(c.in)) && T.test(String(c.out)) && (!c.paid || Date.parse(c.paidAt) > Date.now() - 30 * 86400000)).slice(-1500);
  // How each person wants to be paid: mode "weekly" (every Friday, the default) or "ask" (only when they tap Pay Me); req = the Friday they asked for.
  const pay = d.settings.pay && typeof d.settings.pay === "object" ? d.settings.pay : {}; d.settings.pay = {};
  for (const [k, v] of Object.entries(pay)) if (v && typeof v === "object") d.settings.pay[String(k).slice(0, 40)] = { mode: v.mode === "ask" ? "ask" : "weekly", req: D.test(String(v.req || "")) ? v.req : "" };
  d.settings.hide = Array.isArray(d.settings.hide) ? d.settings.hide.filter(x => typeof x === "string") : [];
  return d;
}

// Shifts a person already worked in the pay period before payday `pd` (Friday through Thursday) that have no timecard yet.
// Only shifts they can still fix (up to a week after) count. Used to block "Pay Me" and to send the reminder alert.
export function missingTimecards(d, who, pd, t = today(), hm = nowHM()) {
  const out = [], lo = addDays(t, -7), from = addDays(pd, -7);
  for (let x = from < lo ? lo : from; x < pd && x <= t; x = addDays(x, 1))
    for (const s of d.shifts[x] || []) if (s.who === who && (x < t || (s.end > s.start && hm >= s.end)) && !d.cards.some(c => c.shiftId === s.id && c.who === who)) out.push({ date: x, s });
  return out;
}

export function seeded() {
  const d = clean({ presets: null, shifts: JSON.parse(JSON.stringify(seed.shifts)), settings: { approval: true, ownerName: seed.ownerName, people: seed.people.map(p => ({ ...p })) } });
  return d;
}
async function staffOf(store) { return (((await store.get("staff", { type: "json" })) || { members: [] }).members || []).filter(m => m.on !== false); }
async function teamOf(store, d) {
  const staff = await staffOf(store), linked = new Set(d.settings.people.map(p => p.staffId).filter(Boolean));
  const col = id => { const c = (staff.find(m => m.id === id) || {}).color; return /^#[0-9A-Fa-f]{6}$/.test(c || "") ? c : undefined; };
  return [{ id: "owner", name: d.settings.ownerName }, ...d.settings.people.map(p => ({ id: p.id, name: p.name, staffId: p.staffId, color: col(p.staffId) })), ...staff.filter(m => !linked.has(m.id)).map(m => ({ id: m.id, name: m.name, color: col(m.id) }))]
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
const fD = s => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
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
  const nowM = today().slice(0, 7), hid = date => !me.manager && date.slice(0, 7) > nowM && !d.settings.published.includes(date.slice(0, 7));   // months not confirmed yet are hidden from employees
  for (const [date, list] of Object.entries(d.shifts)) if (date >= from && date <= to && list.length && !hid(date)) shifts[date] = list;
  const cutoff = Date.now() - 14 * 86400000;
  const requests = d.requests.filter(r => !hid(r.date) && !(r.withDate && hid(r.withDate))).filter(r => ["open", "ask", "approve"].includes(r.status) || (r.closed && Date.parse(r.closed) > cutoff)).slice(0, 60);
  const settings = me.manager ? d.settings : { ...d.settings, people: d.settings.people.map(({ email, ...p }) => p) };
  if (!me.manager) delete settings.pay;   // nobody sees how coworkers get paid
  return { ok: true, me, team, presets: d.presets, settings, shifts, requests, staff: me.manager ? (staff || []).map(m => ({ id: m.id, name: m.name })) : [], alerts: me.manager ? ALERTS : undefined, cards: me.manager ? d.cards : d.cards.filter(c => c.who === me.id), pay: me.manager ? d.settings.pay : { [me.id]: d.settings.pay[me.id] || { mode: "weekly", req: "" } }, payday: nextPayday(), ...counts(d, me), today: today() };
}
function counts(d, me) {
  let needs = 0, offers = 0;
  for (const r of d.requests) {
    if (r.date < today()) continue;
    if (r.status === "ask" && r.withWho === me.id) needs++;
    if (r.status === "approve" && me.owner) needs++;
    if (r.status === "open" && r.by !== me.id) offers++;
  }
  return { needs, offers };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const act = b.action;
  const MANAGER = ["save", "delete", "copyWeek", "clearWeek", "presets", "settings", "resolve", "addPerson", "updatePerson", "removePerson", "batch", "batchRemove", "confirm", "discardPending", "hideMonth", "tcFix", "tcPaid", "tcPay", "tcPaidAll"];
  const bad = await checkPin(store, b.pin, MANAGER.includes(act) ? "schedule" : null, ["get", "badge"].includes(act) ? null : b, "schedule");
  if (bad) return json({ error: bad.error }, bad.status);

  const who = await pinUser(store, b.pin);
  if (act === "presets" && !(who.owner || who.boss)) return json({ error: "Only the owner can add or remove shift presets." }, 403);
  const raw = await store.get(KEY, { type: "json" });
  const d = raw ? clean(raw) : seeded();
  let team = await teamOf(store, d);
  const mePerson = who.owner ? null : d.settings.people.find(p => p.staffId === who.id);
  const me = { id: who.owner ? "owner" : mePerson ? mePerson.id : who.id, name: who.owner ? d.settings.ownerName : who.name, manager: !!who.owner || (who.tabs || []).includes("schedule"), owner: !!(who.owner || who.boss), root: !!who.owner };   // owner = may OK give-aways and change presets (the real owner or a staff Manager)
  me.push = who.owner ? "owner" : who.id;   // OneSignal external id for this login
  const outbox = [];
  const pushId = pid => pid === "owner" ? "owner" : d.settings.people.some(p => p.id === pid) ? (d.settings.people.find(p => p.id === pid).staffId || "") : pid;
  const everyone = () => team.filter(p => !p.hidden).map(p => p.id);
  const managers = async () => ["owner", ...(await staffOf(store)).filter(m => m.manager).map(m => m.id)];
  const queue = (kind, people, tokens) => { const ids = [...new Set((people || []).map(pushId).filter(x => x && x !== me.push))]; if (ids.length) outbox.push({ kind, ids, tokens: { who: me.name, ...tokens } }); };
  const queueIds = (kind, ids, tokens) => { ids = [...new Set(ids.filter(x => x && x !== me.push))]; if (ids.length) outbox.push({ kind, ids, tokens: { who: me.name, ...tokens } }); };
  const holding = () => d.settings.notify.on !== false && d.settings.notify.hold !== false;
  const span = ups => ups.length === 1 ? fD(ups[0]) : `${ups.length} days between ${fD(ups[0])} and ${fD(ups[ups.length - 1])}`;
  // A manager edit: wait for "Confirm Schedule" (so nobody gets a pile of alerts while a month is being built), or tell right away if holding is off.
  const isPub = date => date.slice(0, 7) <= today().slice(0, 7) || d.settings.published.includes(date.slice(0, 7));   // employees can see that day
  const monthName = m => new Date(m + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const noteChange = (pid, date, text) => {
    if (!pid || date < today() || !isPub(date)) return;   // a hidden month has nothing to tell anyone yet
    if (holding()) { const w = d.settings.pending.who; w[pid] = [...new Set([...(w[pid] || []), date])].sort().slice(0, 400); }
    else queue("shiftChanged", [pid], { shift: text });
  };
  const noteOpen = (dates, text) => {
    const ups = dates.filter(x => x >= today() && isPub(x)); if (!ups.length) return;
    if (holding()) d.settings.pending.open = [...new Set([...d.settings.pending.open, ...ups])].sort().slice(0, 400);
    else queue("openShift", everyone(), { shift: text });
  };
  const colorOf = (p, i) => String(p.color || (d.settings.colors || {})[p.id] || PAL[i % PAL.length]).toLowerCase();
  const colorTaken = (id, col) => { const c = String(col).toLowerCase(); return team.some((p, i) => p.id !== id && colorOf(p, i) === c); };
  const name = id => (team.find(p => p.id === id) || { name: "Former Employee" }).name;
  const isDate = x => D.test(String(x || ""));
  const ok = async (extra) => {
    // tidy: drop very old shifts and old finished requests
    const old = addDays(today(), -400);
    for (const k of Object.keys(d.shifts)) if (k < old || !d.shifts[k].length) delete d.shifts[k];
    d.requests = d.requests.filter(r => ["open", "ask", "approve"].includes(r.status) || (r.closed && Date.parse(r.closed) > Date.now() - 30 * 86400000)).slice(0, 200);
    d.cards = d.cards.filter(c => !c.paid || Date.parse(c.paidAt) > Date.now() - 30 * 86400000);
    for (const [id, v] of Object.entries(d.settings.pay)) if (v.req && !d.cards.some(c => c.who === id && !c.paid && c.date < v.req)) v.req = "";   // pay periods run Friday-Thursday: Friday's own hours ride on the next paycheck, so only hours dated before the payday count
    sweep(d);
    d.updated = new Date().toISOString();
    await store.setJSON(KEY, d);
    for (const o of outbox.splice(0)) { const m = buildAlert(d.settings.notify, o.kind, o.tokens); if (m) await sendPush(o.ids, m.title, m.body); }
    team = await teamOf(store, d);
    const from = isDate(b.from) ? b.from : addDays(today(), -7), to = isDate(b.to) ? b.to : addDays(from, 40);
    return json({ ...view(d, team, me, from, to, await staffOf(store)), ...(extra || {}) });
  };

  if (act === "pushTest") {
    const hasKey = !!((typeof process !== "undefined" && process.env && process.env.ONESIGNAL_API_KEY) || (typeof Netlify !== "undefined" && Netlify.env && Netlify.env.get("ONESIGNAL_API_KEY")));
    if (!hasKey) return json({ ok: true, message: "Not connected yet: the OneSignal key has not been added to Netlify." });
    const sent = await sendPush([me.push], "Test alert", "Phone alerts are working. This came from the Beer Depot schedule.");
    return json({ ok: true, message: sent ? "Sent. It should pop up on your phone in a few seconds." : "OneSignal did not accept it. Turn On Notifications on this phone first." });
  }
  if (act === "backupDownload" || act === "backupNow" || act === "reportTest") {   // owner only
    if (!who.owner) return json({ error: "Only the owner can do that." }, 403);
    if (act === "backupDownload") return json({ ok: true, file: { saved: new Date().toISOString(), schedule: d, staff: await store.get("staff", { type: "json" }) } });
    if (act === "backupNow") { const day = await backupNow(store); return json({ ok: true, message: day ? "Backup saved." : "Nothing to back up yet.", last: await lastBackup(store) }); }
    if (!d.settings.report.email) return json({ error: "Type the email first and tap Save." }, 400);
    try { const rep = buildReport(d, Object.fromEntries(team.map(p => [p.id, p.name])), today(), today(), nowHM(), missingTimecards); await sendMail({ to: d.settings.report.email, subject: "TEST: " + rep.subject, html: rep.html, text: rep.text, info: await storeInfo(store) }); return json({ ok: true, message: "Sent to " + d.settings.report.email + "." }); }
    catch (e) { return json({ error: "Couldn't send: " + e.message }, 500); }
  }
  if (act === "backupInfo") { if (!who.owner) return json({ ok: true, last: "" }); return json({ ok: true, last: await lastBackup(store) }); }
  if (act === "badge") { const c = counts(d, me); return json({ ok: true, count: c.needs + c.offers }); }
  if (act === "get" || !act) {
    const from = isDate(b.from) ? b.from : addDays(today(), -7);
    let to = isDate(b.to) ? b.to : addDays(from, 13);
    if (to > addDays(from, 160)) to = addDays(from, 160);
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
    const prevWho = cur ? cur.who : null;
    if (cur) Object.assign(cur, row); else list.push(row);
    if (b.date >= today()) {
      if (!w) { if (prevWho !== "") noteOpen([b.date], fS(b.date, row)); }
      else noteChange(w, b.date, fS(b.date, row));
      if (prevWho && prevWho !== w) noteChange(prevWho, b.date, `${fS(b.date, row)} is no longer yours`);
    }
    list.sort((x, y) => x.start.localeCompare(y.start) || x.end.localeCompare(y.end));
    return ok();
  }
  if (act === "delete") {
    if (!isDate(b.date)) return json({ error: "Bad request." }, 400);
    const gone = (d.shifts[b.date] || []).find(s => s.id === b.id);
    d.shifts[b.date] = (d.shifts[b.date] || []).filter(s => s.id !== b.id);
    if (gone && gone.who) noteChange(gone.who, b.date, `${fS(b.date, gone)} was removed`);
    return ok();
  }
  if (act === "batch" || act === "batchRemove") {
    const dates = [...new Set((Array.isArray(b.dates) ? b.dates : []).filter(isDate))].slice(0, 62);
    if (!dates.length) return json({ error: "Pick some days first." }, 400);
    if (act === "batch") {
      if (!T.test(String(b.start || "")) || !T.test(String(b.end || "")) || b.start >= b.end) return json({ error: "Pick a start time that is before the end time." }, 400);
      const w = b.who ? String(b.who) : "";
      if (w && !team.some(p => p.id === w)) return json({ error: "Pick someone from the team." }, 400);
      let added = 0, changed = 0, skipped = 0;
      const hit = [];
      for (const date of dates) {
        const list = d.shifts[date] = d.shifts[date] || [];
        if (!w) {                                   // Open Shifts: don't pile up exact copies
          if (list.some(s => !s.who && s.start === b.start && s.end === b.end)) { skipped++; continue; }
          list.push({ id: rid(), who: "", start: b.start, end: b.end, note: one(b.note, 60) }); added++; hit.push(date);
        } else {
          const over = list.filter(s => s.who === w && s.start < b.end && b.start < s.end);   // their shift(s) at that time: change it to the new hours
          if (over.length) {
            const keep = over[0]; keep.start = b.start; keep.end = b.end; if (b.note) keep.note = one(b.note, 60);
            for (const x of over.slice(1)) list.splice(list.indexOf(x), 1);
            changed++; hit.push(date);
          } else { list.push({ id: rid(), who: w, start: b.start, end: b.end, note: one(b.note, 60) }); added++; hit.push(date); }
        }
        list.sort((x, y) => x.start.localeCompare(y.start) || x.end.localeCompare(y.end));
      }
      sweep(d);
      const upcoming = hit.filter(x => x >= today()).sort();
      if (upcoming.length) {
        const txt = upcoming.length === 1 ? `${fS(upcoming[0], b)}` : `${upcoming.length} days (${fD(upcoming[0])} to ${fD(upcoming[upcoming.length - 1])}, ${fT(b.start)} – ${fT(b.end)})`;
        if (w) for (const x of upcoming) noteChange(w, x, txt);
        else noteOpen(upcoming, txt);
      }
      return ok({ added, changed, skipped });
    }
    const all = b.who === undefined || b.who === null; let removed = 0;
    const lost = {};
    for (const date of dates) {
      const list = d.shifts[date] || [], keep = list.filter(s => !(all || s.who === String(b.who)));
      if (date >= today()) for (const s of list) if (!keep.includes(s) && s.who) { lost[s.who] = (lost[s.who] || 0) + 1; noteChange(s.who, date, ""); }
      removed += list.length - keep.length; d.shifts[date] = keep;
    }
    if (!holding()) for (const [pid, n] of Object.entries(lost)) queue("shiftChanged", [pid], { shift: `${n} shift${n === 1 ? " was" : "s were"} removed` });
    return ok({ removed });
  }
  if (act === "hideMonth") {
    const m = String(b.month || "");
    if (!/^\d{4}-\d{2}$/.test(m) || m <= today().slice(0, 7)) return json({ error: "Only a later month can be hidden." }, 400);
    d.settings.published = d.settings.published.filter(x => x !== m);
    for (const k of Object.keys(d.settings.pending.who)) d.settings.pending.who[k] = d.settings.pending.who[k].filter(x => x.slice(0, 7) !== m);
    d.settings.pending.open = d.settings.pending.open.filter(x => x.slice(0, 7) !== m);
    return ok();
  }
  if (act === "confirm" || act === "discardPending") {
    const pe = d.settings.pending; let people = 0, shown = "";
    if (act === "confirm") {
      const m = /^\d{4}-\d{2}$/.test(String(b.month || "")) ? String(b.month) : "";
      if (m && m > today().slice(0, 7) && !d.settings.published.includes(m)) {   // the whole month goes live and everyone hears about it once
        d.settings.published = [...d.settings.published, m].sort(); shown = m;
        queue("monthReady", everyone(), { month: monthName(m), shift: monthName(m) });
      }
      for (const [pid, dates] of Object.entries(pe.who)) { const ups = dates.filter(x => x >= today()); if (ups.length) { queue("shiftChanged", [pid], { shift: span(ups) }); people++; } }
      const open = pe.open.filter(x => x >= today());
      if (open.length) queue("openShift", everyone(), { shift: open.length === 1 ? `${fD(open[0])}` : `${open.length} days between ${fD(open[0])} and ${fD(open[open.length - 1])}` });
    }
    d.settings.pending = { who: {}, open: [] };
    return ok({ confirmed: act === "confirm" ? people : 0, shown });
  }
  if (act === "copyWeek" || act === "clearWeek") {
    const start = act === "copyWeek" ? b.to : b.start;
    if (!isDate(start) || (act === "copyWeek" && !isDate(b.from))) return json({ error: "Bad request." }, 400);
    for (let i = 0; i < 7; i++) {
      const dst = addDays(start, i);
      if (act === "clearWeek" || b.replace) { for (const s of d.shifts[dst] || []) if (s.who) noteChange(s.who, dst, `${fS(dst, s)} was removed`); delete d.shifts[dst]; }
      if (act === "copyWeek") {
        const src = (d.shifts[addDays(b.from, i)] || []).map(s => ({ ...s, id: rid() }));
        const fresh = src.filter(s => !(d.shifts[dst] || []).some(e => e.who === s.who && e.start === s.start && e.end === s.end));
        for (const s of fresh) { if (s.who) noteChange(s.who, dst, fS(dst, s)); else noteOpen([dst], fS(dst, s)); }
        d.shifts[dst] = [...(d.shifts[dst] || []), ...fresh];
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
    if (b.ownerName !== undefined) d.settings.ownerName = one(b.ownerName, 30) || "Owner";
    if (b.colors && typeof b.colors === "object") {
      const c = {};
      for (const [k, x] of Object.entries(b.colors).slice(0, 80)) if (/^#[0-9A-Fa-f]{6}$/.test(String(x))) c[String(k).slice(0, 24)] = String(x);
      for (const [k, x] of Object.entries(c)) if (x !== (d.settings.colors || {})[k] && (colorTaken(k, x) || Object.entries(c).some(([k2, x2]) => k2 !== k && x2.toLowerCase() === x.toLowerCase()))) return json({ error: "Someone else already has that color. Pick another." }, 400);
      d.settings.colors = c;
    }
    if (b.nightFrom !== undefined) { if (!T.test(String(b.nightFrom))) return json({ error: "Pick a time." }, 400); d.settings.nightFrom = String(b.nightFrom); }
    if (b.report && typeof b.report === "object") {
      if (!who.owner) return json({ error: "Only the owner can change the Friday email." }, 403);
      const em = String(b.report.email || "").trim(); if (em && !validEmail(em)) return json({ error: "That email address doesn't look right." }, 400);
      d.settings.report = { on: b.report.on !== false, email: em };
    }
    if (b.notify && typeof b.notify === "object") d.settings.notify = alertSettings(b.notify);
    if (Array.isArray(b.hide)) d.settings.hide = b.hide.filter(x => typeof x === "string").slice(0, 60);
    return ok();
  }
  if (act === "addPerson" || act === "updatePerson" || act === "removePerson") {
    const people = d.settings.people, staff = await staffOf(store);
    if (act === "addPerson") {
      const nm = one(b.name, 30); if (!nm) return json({ error: "Type the person's name." }, 400);
      if (people.length >= 40) return json({ error: "That's the limit of people on the schedule." }, 400);
      if (team.some(p => p.name.toLowerCase() === nm.toLowerCase())) return json({ error: "Someone with that name is already on the schedule." }, 400);
      if (/^#[0-9A-Fa-f]{6}$/.test(String(b.color || "")) && colorTaken("", b.color)) return json({ error: "Someone else already has that color. Pick another." }, 400);
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
    if (!(who.owner || who.boss)) return json({ error: "Only the owner or a manager can OK a change." }, 403);
    const r = d.requests.find(x => x.id === b.id);
    if (!r || r.status !== "approve") return json({ error: "That request is already finished." }, 400);
    if (b.approve) { const e = carryOut(d, r, name); if (e) return json({ error: e }, 400); }
    else { r.status = "declined"; r.closed = new Date().toISOString(); }
    queue("shiftChanged", [r.by, r.taker], { shift: `${fS(r.date, r.a)} was ${b.approve ? "OK'd" : "not approved"}` });
    return ok();
  }

  /* ---------- everyone ---------- */
  const mine = (date, sid) => { const s = findShift(d, date, sid); return s && s.who === me.id ? s : null; };
  const needsOk = kind => (kind === "give" ? "approve" : "go");   // owner OKs only a shift someone gives away; swaps (both agree) and Open Shifts go through
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
    if (act === "give") queue("giveOut", everyone(), { shift: fS(b.date, a) });
    else queue("swapAsk", [r.withWho], { shift: fS(r.withDate, r.b), other: fS(r.date, r.a) });
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
    if (needsOk("give") === "approve") { r.status = "approve"; queueIds("needsOk", await managers(), { who: name(me.id), shift: fS(r.date, a) }); }
    else { const e = carryOut(d, r, name); if (e) return json({ error: e }, 400); }
    return ok();
  }
  if (act === "openTake") {   // take an Open Shift the owner left empty
    if (!isDate(b.date)) return json({ error: "Bad request." }, 400);
    const s = findShift(d, b.date, b.shiftId);
    if (!s || s.who) return json({ error: "Someone already has that shift." }, 400);
    if (clash(d, b.date, me.id, s.start, s.end, [])) return json({ error: "You already work then." }, 400);
    if (needsOk("openTake") === "approve") {
      if (d.requests.some(r => r.kind === "claim" && r.shiftId === s.id && r.status === "approve")) return json({ error: "Someone already asked for that one." }, 400);
      d.requests.unshift({ id: rid(), kind: "claim", status: "approve", by: "", taker: me.id, date: b.date, shiftId: s.id, a: snap(s), at: new Date().toISOString() });
    } else s.who = me.id;
    return ok();
  }
  if (act === "answer") {
    const r = d.requests.find(x => x.id === b.id);
    if (!r || r.status !== "ask" || r.withWho !== me.id) return json({ error: "That request is already finished." }, 400);
    queue("swapAnswer", [r.by], { who: name(me.id), answer: b.accept ? "yes" : "no", shift: fS(r.date, r.a) });
    const who2 = name(me.id), what = `your ${fS(r.date, r.a)} for their ${fS(r.withDate, r.b)}`;
    if (!b.accept) { r.status = "declined"; r.closed = new Date().toISOString(); await tell(store, d, r.by, `${who2} said no to the swap`, [`${who2} said no to swapping ${what}.`]); return ok(); }
    if (needsOk("swap") === "approve") r.status = "approve";
    else { const e = carryOut(d, r, name); if (e) return json({ error: e }, 400); }
    await tell(store, d, r.by, `${who2} said yes to the swap`, [`${who2} said yes to swapping ${what}.`, r.status === "approve" ? "It now waits for the owner's OK." : "The schedule is updated."]);
    return ok();
  }
  /* ---------- timecards ---------- */
  if (act === "tcSave" || act === "tcFix") {   // tcSave = my own shift (the day it starts, up to a week after); tcFix = a manager fixes anyone's
    const date = String(b.date || ""), s = isDate(date) ? findShift(d, date, b.shiftId) : null;
    if (!s || !s.who) return json({ error: "I can't find that shift." }, 400);
    if (act === "tcSave") {
      const t0 = today();
      if (s.who !== me.id) return json({ error: "That isn't your shift." }, 403);
      if (date > t0 || date < addDays(t0, -7) || (date === t0 && nowHM() < s.start)) return json({ error: "You can fill in your timecard once your shift starts, and up to one week after." }, 400);
    }
    const off = b.off === true;   // "I didn't work this day": a timecard that counts 0 hours
    if (off) { b.in = "00:00"; b.out = "00:00"; }
    else if (!T.test(String(b.in || "")) || !T.test(String(b.out || "")) || b.in === b.out) return json({ error: "Enter the time you came in and the time you left." }, 400);
    let c = d.cards.find(x => x.shiftId === s.id && x.who === s.who);
    if (c && c.paid) return json({ error: "That day is already marked paid, so it can't be changed." }, 400);
    if (!c) { c = { id: rid(), date, who: s.who, name: name(s.who), shiftId: s.id, paid: false, paidAt: "" }; d.cards.push(c); }
    c.in = b.in; c.out = b.out; c.off = off; c.sent = new Date().toISOString(); c.by = me.id;
    return ok();
  }
  if (act === "tcAdd" || act === "tcDel") {   // extra hours with no scheduled shift (came in to help out, a last-minute shift). Employees do their own; managers can do anyone's.
    const target = me.manager && b.who ? String(b.who).slice(0, 40) : me.id;
    if (act === "tcDel") {
      const c = d.cards.find(x => x.id === b.id && x.extra); if (!c) return json({ error: "I can't find those extra hours." }, 400);
      if (c.who !== me.id && !me.manager) return json({ error: "Those aren't your hours." }, 403);
      if (c.paid) return json({ error: "Those hours are already marked paid." }, 400);
      d.cards = d.cards.filter(x => x !== c);
      return ok();
    }
    const date = String(b.date || ""), t0 = today();
    if (!isDate(date)) return json({ error: "Pick the day." }, 400);
    if (date > t0) return json({ error: "That day hasn't happened yet." }, 400);
    if (date < addDays(t0, me.manager ? -60 : -14)) return json({ error: "That day is too long ago. Ask the owner to add it." }, 400);
    if (!T.test(String(b.in || "")) || !T.test(String(b.out || "")) || b.in === b.out) return json({ error: "Enter the time you came in and the time you left." }, 400);
    const span = (i, o) => { const m = x => Number(x.slice(0, 2)) * 60 + Number(x.slice(3)); const a0 = m(i); let b0 = m(o); if (b0 <= a0) b0 += 1440; return [a0, b0]; };
    const [n0, n1] = span(b.in, b.out);
    if (d.cards.some(c => c.who === target && c.date === date && !c.off && (() => { const [c0, c1] = span(c.in, c.out); return n0 < c1 && c0 < n1; })())) return json({ error: "That overlaps hours already on the timecard that day." }, 400);
    d.cards.push({ id: rid(), date, who: target, name: name(target), shiftId: "x-" + rid(), extra: true, in: b.in, out: b.out, off: false, sent: new Date().toISOString(), by: me.id, paid: false, paidAt: "" });
    return ok();
  }
  if (act === "tcPref") {   // how someone wants to be paid: yourself, or a manager for anyone
    const target = me.manager && b.who ? String(b.who).slice(0, 40) : me.id, cur = d.settings.pay[target] || { mode: "weekly", req: "" };
    cur.mode = b.mode === "ask" ? "ask" : "weekly"; if (cur.mode === "weekly") cur.req = "";
    d.settings.pay[target] = cur;
    return ok();
  }
  if (act === "tcAsk") {   // "Pay me on the next payday" (or cancel it)
    const cur = d.settings.pay[me.id] || { mode: "weekly", req: "" };
    if (b.cancel) cur.req = "";
    else { const pd = nextPayday(), miss = missingTimecards(d, me.id, pd); if (miss.length) return json({ error: "Send your timecard first for " + miss.map(m => fD(m.date)).join(" and ") + ". Then tap Pay Me again." }, 400); if (!d.cards.some(c => c.who === me.id && !c.paid && c.date < pd)) return json({ error: "You have no hours for this paycheck yet. Hours worked through Thursday go on Friday's paycheck. Send a timecard first." }, 400); cur.req = pd; }
    d.settings.pay[me.id] = cur;
    return ok();
  }
  if (act === "tcPaid") {
    const c = d.cards.find(x => x.id === b.id); if (!c) return json({ error: "I can't find that timecard." }, 400);
    c.paid = !!b.paid; c.paidAt = c.paid ? new Date().toISOString() : ""; if (!c.paid) c.check = "";
    return ok();
  }
  if (act === "tcPay") {   // mark the chosen timecards paid, with an optional check number
    const ids = new Set(Array.isArray(b.ids) ? b.ids.map(String) : []), ck = one(b.check, 20); let n = 0;
    for (const c of d.cards) if (ids.has(c.id) && !c.paid) { c.paid = true; c.paidAt = new Date().toISOString(); c.check = ck; n++; }
    return ok({ marked: n });
  }
  if (act === "tcPaidAll") {
    let n = 0; for (const c of d.cards) if (c.who === b.who && !c.paid) { c.paid = true; c.paidAt = new Date().toISOString(); c.check = one(b.check, 20); n++; }
    return ok({ marked: n });
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
