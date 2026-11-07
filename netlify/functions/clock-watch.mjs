// Every 15 minutes: remind people who are still clocked in after their shift ended, and clock them out (at the scheduled end) an hour later.
// Rules live in sweepClocks() in schedule.mjs. Alerts: "clockReminder" and "clockAuto" (reword or switch off in Schedule → Setup → Phone Alerts).
import { getStore } from "@netlify/blobs";
import { clean, sweepClocks } from "./schedule.mjs";
import { buildAlert, sendPush } from "../lib/push.mjs";

const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const hm = () => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(/^24:/, "00:");
const fT = t => { let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return h + (m ? ":" + String(m).padStart(2, "0") : "") + " " + ap; };

export async function watchNow() {
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  const raw = await store.get("schedule", { type: "json" }); if (!raw) return 0;
  const d = clean(raw); if (!Object.keys(d.clocks).length) return 0;
  const r = sweepClocks(d, todayStr(), hm()); if (!r.changed) return 0;
  d.updated = new Date().toISOString();
  await store.setJSON("schedule", d);
  const pushId = who => who === "owner" ? "owner" : ((d.settings.people.find(p => p.id === who) || {}).staffId || (d.settings.people.some(p => p.id === who) ? "" : who));
  let n = 0;
  for (const [list, kind] of [[r.remind, "clockReminder"], [r.closed, "clockAuto"]]) for (const x of list) {
    const id = pushId(x.who); if (!id) continue;
    const m = buildAlert(d.settings.notify, kind, { who: "", shift: fT(x.out) });
    if (m && await sendPush([id], m.title, m.body)) n++;
  }
  return n;
}
export default async () => { try { const n = await watchNow(); if (n) console.log("Clock alerts sent:", n); } catch (e) { console.error("clock watch", e); } };
export const config = { schedule: "*/15 * * * *" };
