// Every 10 minutes (about 6 AM-10 PM Central): email people whose item is back in stock.
// An item has to stay In Stock for the wait time (default 1 hour, Store Tools → Back in Stock) before anyone is emailed,
// so an accidental "In Stock" switch that gets fixed in time sends nothing.
import { getStore } from "@netlify/blobs";
import { refreshSaved } from "./stock.mjs";
import { sendMail, SITE } from "../lib/club-email.mjs";
import { loadState, loadWants, isIn } from "../lib/notify.mjs";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function message(name, token) {
  const unsub = `${SITE}/api/notify?unsub=${token}`;
  const html = `<!doctype html><html><body style="margin:0;background:#F3EBE2;font-family:Arial,Helvetica,sans-serif"><div style="max-width:560px;margin:0 auto;padding:20px">
 <div style="background:#2B1B12;border-radius:14px;padding:22px;color:#E8D9CC">
  <h1 style="margin:0 0 8px;color:#F26B1D;font-size:26px">It's Back in Stock!</h1>
  <p style="margin:0 0 14px;color:#fff;font-size:20px;font-weight:bold">${esc(name)}</p>
  <p style="margin:0 0 14px">First come, first served, in store only. We can't hold items.</p>
  <p style="margin:0"><a href="${SITE}" style="color:#fff;font-weight:bold">See What's In Stock</a> &nbsp;·&nbsp; <a href="tel:+12626964602" style="color:#fff;font-weight:bold">262-696-4602</a></p>
 </div>
 <p style="font-size:12px;color:#7A6B60;line-height:1.5;margin:14px 4px">The Beer Depot · N27 W26 N26980 Prospect Ave, Pewaukee, WI 53072<br>You asked us to email you when this item came back. This is the only email you'll get about it. Must be 21 or older for alcohol.<br><a href="${unsub}" style="color:#7A6B60">Unsubscribe</a></p>
</div></body></html>`;
  const text = `It's back in stock: ${name}\n\nFirst come, first served, in store only. We can't hold items.\n${SITE} · 262-696-4602\n\nThe Beer Depot · N27 W26 N26980 Prospect Ave, Pewaukee, WI 53072\nUnsubscribe: ${unsub}`;
  return { subject: `${name} Is Back in Stock at The Beer Depot`, html, text, unsub };
}

export async function checkNotify(store) {
  const state = await loadState(store);
  if (!state.on) return { skipped: "off" };
  const d = await loadWants(store);
  const keys = Object.keys(d.wants);
  if (!keys.length) { if (Object.keys(state.inSince).length) await store.setJSON("notify-state", { ...state, inSince: {} }); return { skipped: "nothing requested" }; }
  const stock = keys.some(k => k.startsWith("k:")) ? ((await refreshSaved(store).catch(() => null)) || (await store.get("stock-latest", { type: "json" }))) : null;
  const now = Date.now(), inSince = {}, sentLog = [...(state.sent || [])];
  let emails = 0;
  for (const key of keys) {
    const here = await isIn(store, key, stock);
    if (here === null) { if (state.inSince[key]) inSince[key] = state.inSince[key]; continue; }     // can't tell: change nothing
    if (!here) continue;                                                                                 // out of stock: the clock restarts
    const since = state.inSince[key] || now;
    if (now - since < state.delayMin * 60000) { inSince[key] = since; continue; }                       // not In Stock long enough yet
    const w = d.wants[key]; let n = 0;
    for (const email of Object.keys(w.people)) {
      try { const m = message(w.name, d.tokens[email]); await sendMail({ to: email, subject: m.subject, html: m.html, text: m.text, unsub: m.unsub }); n++; delete w.people[email]; }
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
