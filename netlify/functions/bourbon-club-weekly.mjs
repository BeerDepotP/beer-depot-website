// Every Thursday at 5 PM Central: email the Bourbon Club every Allocated Bourbon bottle in stock.
// Skips the week if nothing tagged Allocated Bourbon is in stock. Never sends twice on the same day.
import { getStore } from "@netlify/blobs";
import { refreshSaved } from "./stock.mjs";
import { sendClub } from "../lib/club-email.mjs";
import { storeInfo } from "../lib/info.mjs";

function chicago(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = t => parts.find(p => p.type === t).value;
  return { day: g("weekday"), hour: +g("hour"), min: +g("minute"), date: `${g("year")}-${g("month")}-${g("day")}` };
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
  const sent = await sendClub(members, bottles, await store.get("bourbon-club-email", { type: "json" }), await storeInfo(store));
  await store.setJSON("bourbon-club-sent", { date, at: new Date().toISOString(), sent, bottles });
  return { sent, bottles: bottles.length };
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Runs every 15 minutes and sends once, within an hour after the day and time chosen in Store Tools (default Thursday 5 PM).
export default async () => {
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  const settings = (await store.get("bourbon-club-settings", { type: "json" })) || {};
  const day = Number.isInteger(settings.day) ? settings.day : 4, time = /^\d\d:\d\d$/.test(settings.time || "") ? settings.time : "17:00";
  const { day: today, hour, min } = chicago();
  const [th, tm] = time.split(":").map(Number), since = (hour * 60 + min) - (th * 60 + tm);
  if (DAYS[day] !== today || since < 0 || since > 75) return;
  try { console.log("Bourbon Club:", JSON.stringify(await sendWeekly(store))); }
  catch (e) { console.error("Bourbon Club send failed", e); }
};

export const config = { schedule: "*/15 * * * *" };
