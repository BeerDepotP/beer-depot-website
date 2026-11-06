// Weekly restock: for each Local Favorites company with restock turned on (Store Tools → Food Stock → Edit Company),
// switch all its items back to In Stock on its day and time (store time). Grebe's defaults to Thursday 9 AM.
// Built-in items come from tools/menu.js via tools/build.py -> netlify/lib/restock.json; items added in Store Tools come from the blob.
import { getStore } from "@netlify/blobs";
import restock from "../lib/restock.json" with { type: "json" };

function chicagoNow(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = t => parts.find(p => p.type === t).value;
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday")), mins: +g("hour") * 60 + +g("minute"), date: `${g("year")}-${g("month")}-${g("day")}` };
}

// force: a company key to restock right now (ignores day and time)
export async function restockNow(force) {
  const store = getStore({ name: "beer-depot", consistency: "strong" });
  const data = (await store.get("food-stock", { type: "json" })) || { items: {} };
  const log = (await store.get("restock-log", { type: "json" })) || {};
  const now = chicagoNow(), makers = data.makers || {};
  const keys = [...new Set([...Object.keys(restock.makers || {}), ...(data.newMakers || []).map(m => m.id)])];
  let n = 0;
  for (const m of keys) {
    const r = (makers[m] && makers[m].restock) || (restock.defaults || {})[m];
    if (force ? force !== m : !(r && r.on)) continue;
    if (!force) {
      const [h, mm] = String(r.time || "09:00").split(":").map(Number), since = now.mins - (h * 60 + mm);
      if (r.day !== now.day || since < 0 || since > 60 || log[m] === now.date) continue;
    }
    const names = [...(restock.makers[m] || []), ...(data.custom || []).filter(c => c.maker === m).map(c => c.name)]
      .filter(x => !(data.removed || {})[x] && !(data.deleted || {})[x]);
    for (const x of names) { data.items[x] = true; n++; }
    log[m] = now.date;
  }
  if (n) { data.updated = new Date().toISOString(); await store.setJSON("food-stock", data); }
  await store.setJSON("restock-log", log);
  return n;
}

export default async () => {
  try { const n = await restockNow(); if (n) console.log("Restocked items:", n); } catch (e) { console.error("restock", e); }
};

export const config = { schedule: "*/15 * * * *" };
