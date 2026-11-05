// Bourbon Club email: builds the weekly "what's in" email and sends it through Brevo.
// Needs BREVO_API_KEY in Netlify. Optional: CLUB_FROM_EMAIL (default bourbon@beerdepotpewaukee.com).
// The member list lives on our own site (Blobs "bourbon-club"), so switching email
// services only means changing sendOne() below and the key.
const SITE = "https://beerdepotpewaukee.com";
const FROM = () => ({ name: "The Beer Depot", email: process.env.CLUB_FROM_EMAIL || "bourbon@beerdepotpewaukee.com" });
// The words in the email. Store Tools → Bourbon Club → Email Wording can change any of these (Blobs "bourbon-club-email").
// The look stays the same; the bottle list is always filled in automatically.
export const DEFAULTS = {
  subject: "This Week's Allocated Bourbon at The Beer Depot",
  heading: "This Week's Allocated Bourbon",
  tagline: "Hard-to-Find Bottles. Once They're Gone, They're Gone.",
  top: "",
  info: "In stock as of Thursday 5 PM. First come, first served, in store only. No reservations.",
  bottom: "",
};
export const LIMITS = { subject: 120, heading: 80, tagline: 160, top: 1000, info: 400, bottom: 1000 };
export function cleanContent(c = {}) {
  const o = {};
  for (const k of Object.keys(DEFAULTS)) {
    const v = typeof c[k] === "string" ? c[k].replace(/\r/g, "").trim().slice(0, LIMITS[k]) : "";
    o[k] = v || (k === "top" || k === "bottom" ? "" : DEFAULTS[k]);
  }
  return o;
}
const para = (t, style) => t ? `<p style="${style}">${esc(t).replace(/\n/g, "<br>")}</p>` : "";
const ADDRESS = "N27 W26 N26980 Prospect Ave, Pewaukee, WI 53072";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function clubEmail(bottles, token, content) {
  const c = cleanContent(content);
  const unsub = `${SITE}/api/bourbon-club?unsub=${token}`;
  const list = bottles.map(n => `<li style="padding:8px 0;border-bottom:1px solid #4E3626;font-size:17px;color:#fff">${esc(n)}</li>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#F3EBE2;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px">
 <div style="background:#2B1B12;border-radius:14px;padding:22px 22px 14px;color:#E8D9CC">
  <h1 style="margin:0 0 6px;color:#F26B1D;font-size:28px">${esc(c.heading)}</h1>
  <p style="margin:0 0 12px;color:#fff;font-weight:bold">${esc(c.tagline)}</p>
  ${para(c.top, "margin:0 0 12px;color:#fff")}
  <ul style="list-style:none;margin:0;padding:0">${list}</ul>
  ${para(c.info, "margin:16px 0 6px")}
  ${para(c.bottom, "margin:6px 0 6px;color:#fff")}
  <p style="margin:0 0 14px"><a href="${SITE}/#allocated" style="color:#fff;font-weight:bold">See What's Still In Stock</a> &nbsp;·&nbsp; <a href="tel:+12626964602" style="color:#fff;font-weight:bold">262-696-4602</a></p>
 </div>
 <p style="font-size:12px;color:#7A6B60;line-height:1.5;margin:14px 4px">The Beer Depot · ${ADDRESS}<br>
 You're getting this because you joined the Bourbon Club at beerdepotpewaukee.com. Must be 21 or older.<br>
 <a href="${unsub}" style="color:#7A6B60">Unsubscribe</a></p>
</div></body></html>`;
  const text = `${c.heading}\n${c.tagline}\n\n${c.top ? c.top + "\n\n" : ""}${bottles.map(n => "- " + n).join("\n")}\n\n${c.info}\n${c.bottom ? "\n" + c.bottom + "\n\n" : ""}${SITE}/#allocated · 262-696-4602\n\nThe Beer Depot · ${ADDRESS}\nUnsubscribe: ${unsub}`;
  return { html, text, unsub, subject: c.subject };
}

async function sendOne(to, bottles, token, content) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error("BREVO_API_KEY isn't set in Netlify yet.");
  const { html, text, unsub, subject } = clubEmail(bottles, token, content);
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: FROM(), replyTo: FROM(), to: [{ email: to }], subject, htmlContent: html, textContent: text,
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

// One email per member (each has their own unsubscribe link), 10 at a time.
export async function sendClub(members, bottles, content) {
  let sent = 0; const failed = [];
  for (let i = 0; i < members.length; i += 10) {
    const res = await Promise.allSettled(members.slice(i, i + 10).map(([email, m]) => sendOne(email, bottles, m.token, content)));
    res.forEach((x, j) => x.status === "fulfilled" ? sent++ : failed.push(members[i + j][0] + ": " + x.reason.message));
    if (sent === 0 && failed.length && i === 0) throw new Error(failed[0]);    // key or sender problem: stop right away
  }
  if (failed.length) console.error("Bourbon Club failures:", failed.slice(0, 20));
  return sent;
}

// A test copy to the owner, from Store Tools.
export async function sendTest(to, bottles, content) {
  await sendOne(to, bottles, "test", content);
}
