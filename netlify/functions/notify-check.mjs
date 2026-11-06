// Every 10 minutes (about 6 AM-10 PM Central): email people whose item is back in stock.
// An item has to stay In Stock for the wait time (default 1 hour, Store Tools → Back in Stock) before anyone is emailed,
// so an accidental "In Stock" switch that gets fixed in time sends nothing.
import { getStore } from "@netlify/blobs";
import { refreshSaved } from "./stock.mjs";
import { sendMail } from "../lib/club-email.mjs";
import { storeInfo } from "../lib/info.mjs";
import { loadState, loadWants, isIn, cleanForm, notifyEmail } from "../lib/notify.mjs";

export async function checkNotify(store) {
  const state = await loadState(store);
  if (!state.on) return { skipped: "off" };
  const d = await loadWants(store);
  const keys = Object.keys(d.wants);
  if (!keys.length) { if (Object.keys(state.inSince).length) await store.setJSON("notify-state", { ...state, inSince: {} }); return { skipped: "nothing requested" }; }
  const stock = keys.some(k => k.startsWith("k:")) ? ((await refreshSaved(store).catch(() => null)) || (await store.get("stock-latest", { type: "json" }))) : null;
  const info = await storeInfo(store), form = cleanForm(state.form), now = Date.now(), inSince = {}, sentLog = [...(state.sent || [])];
  let emails = 0;
  for (const key of keys) {
    const here = await isIn(store, key, stock);
    if (here === null) { if (state.inSince[key]) inSince[key] = state.inSince[key]; continue; }     // can't tell: change nothing
    if (!here) continue;                                                                                 // out of stock: the clock restarts
    const since = state.inSince[key] || now;
    if (now - since < state.delayMin * 60000) { inSince[key] = since; continue; }                       // not In Stock long enough yet
    const w = d.wants[key]; let n = 0;
    for (const email of Object.keys(w.people)) {
      try { const m = notifyEmail(w.name, d.tokens[email], form, info); await sendMail({ to: email, subject: m.subject, html: m.html, text: m.text, unsub: m.unsub, info }); n++; delete w.people[email]; }
      catch (e) { console.error("Back in stock email failed", email, e.message); if (n === 0 && /BREVO_API_KEY|Brevo 40/.test(e.message)) break; }
    }
    if (n) { sentLog.push({ at: new Date().toISOString(), name: w.name, count: n }); emails += n; }
    if (!Object.keys(w.people).length) delete d.wants[key]; else inSince[key] = since;
  }
  await store.setJSON("notify", d);
  await store.setJSON("notify-state", { ...state, inSince, sent: sentLog.slice(-60) });
  return { emails };
}

export default async () => {
  try { console.log("Back in stock:", JSON.stringify(await checkNotify(getStore({ name: "beer-depot", consistency: "strong" })))); }
  catch (e) { console.error("Back in stock check failed", e); }
};

export const config = { schedule: "*/10 11-23,0-3 * * *" };
