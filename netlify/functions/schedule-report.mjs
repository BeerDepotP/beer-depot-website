// Friday 7:30 AM store time: email the owner who is being paid today and their hours. Once per Friday (Blob "schedule-report-sent").
import { getStore } from "@netlify/blobs";
import { clean, missingTimecards } from "./schedule.mjs";
import { buildReport } from "../lib/schedule-report.mjs";
import { sendMail } from "../lib/club-email.mjs";
import { storeInfo } from "../lib/info.mjs";

const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const hm = () => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(/^24:/, "00:");

export async function namesOf(store, d) {
  const staff = (((await store.get("staff", { type: "json" })) || { members: [] }).members || []).filter(m => m.on !== false);
  const linked = new Set(d.settings.people.map(p => p.staffId).filter(Boolean));
  const names = { owner: d.settings.ownerName };
  d.settings.people.forEach(p => { names[p.id] = p.name; });
  staff.filter(m => !linked.has(m.id)).forEach(m => { names[m.id] = m.name; });
  return names;
}
export async function sendReport(store, d, force) {
  const to = d.settings.report.email; if (!to) return false;
  const rep = buildReport(d, await namesOf(store, d), force || todayStr(), todayStr(), hm(), missingTimecards);
  await sendMail({ to, subject: rep.subject, html: rep.html, text: rep.text, info: await storeInfo(store) });
  return true;
}
export default async () => {
  try {
    const t = todayStr(), now = hm();
    if (new Date(t + "T12:00:00Z").getUTCDay() !== 5 || now < "07:30" || now >= "09:00") return;
    const store = getStore({ name: "beer-depot", consistency: "strong" });
    const raw = await store.get("schedule", { type: "json" }); if (!raw) return;
    const d = clean(raw); if (d.settings.report.on === false) return;
    const log = (await store.get("schedule-report-sent", { type: "json" })) || {};
    if (log[t]) return;
    if (await sendReport(store, d)) { const out = {}; Object.keys(log).sort().slice(-8).forEach(k => { out[k] = true; }); out[t] = true; await store.setJSON("schedule-report-sent", out); }
  } catch (e) { console.error("schedule report", e); }
};
export const config = { schedule: "*/15 * * * *" };
