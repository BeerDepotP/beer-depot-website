// Every Thursday at 5 PM Central: email the Bourbon Club every Allocated Bourbon bottle in stock.
// Skips the week if nothing tagged Allocated Bourbon is in stock. Never sends twice on the same day.
import { getStore } from "@netlify/blobs";
import { refreshSaved } from "./stock.mjs";
import { sendClub } from "../lib/club-email.mjs";

function chicago(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = t => parts.find(p => p.type === t).value;
  return { day: g("weekday"), hour: +g("hour"), date: `${g("year")}-${g("month")}-${g("day")}` };
}

export async function sendWeekly(store, { force = false } = {}) {
  const { date } = chicago();
  const settings = (await store.get("bourbon-club-settings", { type: "json" })) || {};
  if (settings.sending === false) return { skipped: "Thursday emails are switched off in Store Tools" };
  const last = await store.get("bourbon-club-sent", { type: "json" });
  if (!force && last && last.date === date) return { skipped: "already sent today" };
  const stock = (await refreshSaved(store).catch(() => null)) || (await store.get("stock-latest", { type: "json" }));
  const bottles = [...new Set((stock?.items || []).filter(it => it.allocated && it.inStock).map(it => it.name))].sort((a, b) => a.localeCompare(b));
  if (!bottles.length) return { skipped: "no allocated bourbon in stock" };
  const members = Object.entries((await store.get("bourbon-club", { type: "json" })) || {});
  if (!members.length) return { skipped: "no members yet" };
  const sent = await sendClub(members, bottles, await store.get("bourbon-club-email", { type: "json" }));
  await store.setJSON("bourbon-club-sent", { date, at: new Date().toISOString(), sent, bottles });
  return { sent, bottles: bottles.length };
}

export default async () => {
  const { day, hour } = chicago();
  if (day !== "Thu" || hour !== 17) return;      // runs twice to cover daylight saving time
  try { console.log("Bourbon Club:", JSON.stringify(await sendWeekly(getStore({ name: "beer-depot", consistency: "strong" })))); }
  catch (e) { console.error("Bourbon Club send failed", e); }
};

// 22:02 and 23:02 UTC on Thursdays = 5:02 PM Central in summer (CDT) or winter (CST).
export const config = { schedule: "2 22,23 * * 4" };
