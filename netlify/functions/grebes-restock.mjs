// Every Thursday at 9 AM Central, switch all Grebe's products back to In Stock.
// (The list comes from tools/menu.js via tools/build.py -> netlify/lib/restock.json.)
import { getStore } from "@netlify/blobs";
import restock from "../lib/restock.json" with { type: "json" };

function chicagoHourAndDay(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(d);
  return { day: parts.find(p => p.type === "weekday").value, hour: +parts.find(p => p.type === "hour").value };
}

export async function restockNow() {
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  const data = (await store.get("food-stock", { type: "json" })) || { items: {} };
  for (const name of restock.thursday9am) data.items[name] = true;
  data.updated = new Date().toISOString();
  await store.setJSON("food-stock", data);
  return restock.thursday9am.length;
}

export default async () => {
  const { day, hour } = chicagoHourAndDay();
  if (day !== "Thu" || hour !== 9) return;      // the schedule runs twice to cover daylight saving time
  try { console.log("Grebe's restocked:", await restockNow()); } catch (e) { console.error("restock", e); }
};

// 14:05 and 15:05 UTC on Thursdays = 9:05 AM Central in summer (CDT) or winter (CST).
export const config = { schedule: "5 14,15 * * 4" };
