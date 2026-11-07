// Timecard reminder: the evening before payday (Thursday 6 PM store time) and again on payday morning (Friday 7 AM), anyone who is
// being paid that Friday (Every Friday people, plus anyone who asked) and has a worked shift in the pay period with no timecard gets a phone alert.
// People without a Store Tools login cannot get phone alerts. Each slot is sent once (Blob "schedule-reminded").
import { getStore } from "@netlify/blobs";
import { clean, missingTimecards } from "./schedule.mjs";
import { buildAlert, sendPush } from "../lib/push.mjs";

const fmt = (o) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", ...o });
const todayStr = () => fmt({ year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const hm = () => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(/^24:/, "00:");
const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const fD = s => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

export async function remindNow(force) {
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  const raw = await store.get("schedule", { type: "json" }); if (!raw) return 0;
  const d = clean(raw), t = todayStr(), now = hm(), dow = new Date(t + "T12:00:00Z").getUTCDay();
  let pd = "", key = "";
  if (force) { pd = force; key = "force-" + t + now; }
  else if (dow === 4 && now >= "18:00" && now < "19:30") { pd = addDays(t, 1); key = t + "-thu"; }
  else if (dow === 5 && now >= "07:00" && now < "08:30") { pd = t; key = t + "-fri"; }
  else return 0;
  const log = (await store.get("schedule-reminded", { type: "json" })) || {};
  if (log[key]) return 0;
  const staff = (((await store.get("staff", { type: "json" })) || { members: [] }).members || []).filter(m => m.on !== false);
  const linked = new Set(d.settings.people.map(p => p.staffId).filter(Boolean));
  const people = [{ id: "owner", push: "owner" }, ...d.settings.people.map(p => ({ id: p.id, push: p.staffId || "" })), ...staff.filter(m => !linked.has(m.id)).map(m => ({ id: m.id, push: m.id }))];
  let n = 0;
  for (const p of people) {
    const v = d.settings.pay[p.id] || { mode: "weekly", req: "" };
    if (!(v.mode === "weekly" || v.req === pd) || !p.push) continue;
    const miss = missingTimecards(d, p.id, pd, t, now); if (!miss.length) continue;
    const msg = buildAlert(d.settings.notify, "timecardMissing", { who: "", payday: fD(pd), shift: miss.slice(0, 3).map(m => fD(m.date)).join(" and ") + (miss.length > 3 ? " and more" : "") });
    if (msg && await sendPush([p.push], msg.title, msg.body)) n++;
  }
  log[key] = true;
  const keep = Object.keys(log).sort().slice(-12); const out = {}; keep.forEach(k => { out[k] = true; });
  await store.setJSON("schedule-reminded", out);
  return n;
}

export default async () => { try { const n = await remindNow(); if (n) console.log("Timecard reminders sent:", n); } catch (e) { console.error("timecard reminder", e); } };
export const config = { schedule: "*/15 * * * *" };
