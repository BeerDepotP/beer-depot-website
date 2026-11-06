import { SITE } from "./club-email.mjs";
import { DEFAULT_INFO, telOf } from "./info.mjs";
// Back in Stock emails: shared helpers.
// Blobs "notify"       = { wants: { key: { name, people: { email: { at } } } }, tokens: { email: token } }
// Blobs "notify-state" = { on, delayMin, inSince: { key: ms }, sent: [ { at, name, count } ] }
// Keys: "k:<product name>" = KORONA product, "f:<name>" = Made Here / Local Favorites switch (In Stock only when switched on),
//       "o:<name>" = Grilling & Outdoor switch (In Stock unless switched off).
export const DEFAULT_STATE = { on: true, delayMin: 60, inSince: {}, sent: [] };
export const loadState = async store => ({ ...DEFAULT_STATE, ...((await store.get("notify-state", { type: "json" })) || {}) });
export const loadWants = async store => (await store.get("notify", { type: "json" })) || { wants: {}, tokens: {} };

// true / false, or null when we can't tell right now
export async function isIn(store, key, stock) {
  const kind = key.slice(0, 2), name = key.slice(2);
  if (kind === "k:") {
    if (!stock) return null;
    const hits = stock.items.filter(i => i.name === name);
    return hits.length ? hits.some(i => i.inStock) : null;
  }
  const sw = ((await store.get("food-stock", { type: "json" })) || { items: {} }).items || {};
  return kind === "f:" ? sw[name] === true : sw[name] !== false;
}

// The words and extra boxes in the "Email Me When Back" pop-up (edited in Store Tools → Back in Stock), and the note in the email.
export const DEFAULT_FORM = {
  title: "Email Me When Back",
  intro: "We'll send you one email when it's back in stock.",
  button: "Email Me",
  thanks: "Got it! We'll email you when it's back.",
  emailSubject: "{item} Is Back in Stock at The Beer Depot",   // {item} = the item name
  emailHeading: "It's Back in Stock!",
  emailNote: "Stop in or give us a call to grab it.",
  emailLink: "See What's In Stock",
  fields: [],        // extra boxes: [{ id, label, type: "text" | "tel", required }]
};
const one = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
export function cleanForm(f = {}) {
  const pick = (k, n, keepEmpty) => { const v = typeof f[k] === "string" ? one(f[k], n) : DEFAULT_FORM[k]; return v || (keepEmpty ? "" : DEFAULT_FORM[k]); };
  const fields = (Array.isArray(f.fields) ? f.fields : []).slice(0, 5).map((x, i) => ({
    id: "f" + (i + 1), label: one(x && x.label, 40), type: x && x.type === "tel" ? "tel" : "text", required: !!(x && x.required),
  })).filter(x => x.label);
  return { title: pick("title", 60), intro: pick("intro", 300, true), button: pick("button", 30), thanks: pick("thanks", 160), emailSubject: pick("emailSubject", 120), emailHeading: pick("emailHeading", 60), emailNote: pick("emailNote", 300, true), emailLink: pick("emailLink", 40), fields };
}

const esc = x => String(x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// The Back in Stock email (same look every time; the words come from the form settings).
export function notifyEmail(name, token, form, info = DEFAULT_INFO) {
  const f = cleanForm(form), unsub = `${SITE}/api/notify?unsub=${token}`;
  const html = `<!doctype html><html><body style="margin:0;background:#F3EBE2;font-family:Arial,Helvetica,sans-serif"><div style="max-width:560px;margin:0 auto;padding:20px">
 <div style="background:#2B1B12;border-radius:14px;padding:22px;color:#E8D9CC">
  <h1 style="margin:0 0 8px;color:#F26B1D;font-size:26px">${esc(f.emailHeading)}</h1>
  <p style="margin:0 0 14px;color:#fff;font-size:20px;font-weight:bold">${esc(name)}</p>
  ${f.emailNote ? `<p style="margin:0 0 14px">${esc(f.emailNote).replace(/\n/g, "<br>")}</p>` : ""}
  <p style="margin:0"><a href="${SITE}" style="color:#fff;font-weight:bold">${esc(f.emailLink)}</a> &nbsp;·&nbsp; <a href="${telOf(info.phone)}" style="color:#fff;font-weight:bold">${esc(info.phone)}</a></p>
 </div>
 <p style="font-size:12px;color:#7A6B60;line-height:1.5;margin:14px 4px">The Beer Depot · ${info.address}<br>You asked us to email you when this item came back. This is the only email you'll get about it. Must be 21 or older for alcohol.<br>${info.footer ? esc(info.footer) + "<br>" : ""}<a href="${unsub}" style="color:#7A6B60">Unsubscribe</a></p>
</div></body></html>`;
  const text = `${f.emailHeading}\n${name}\n\n${f.emailNote ? f.emailNote + "\n\n" : ""}${SITE} · ${info.phone}\n\nThe Beer Depot · ${info.address}${info.footer ? "\n" + info.footer : ""}\nUnsubscribe: ${unsub}`;
  return { subject: f.emailSubject.replace(/\{item\}/gi, name), html, text, unsub };
}
