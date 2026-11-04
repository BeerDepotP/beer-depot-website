// Bourbon Club email: builds and sends the weekly "what's in" email through Resend.
// Needs RESEND_API_KEY in Netlify. Optional: CLUB_FROM (default bourbon@beerdepotpewaukee.com).
const SITE = "https://beerdepotpewaukee.com";
const FROM = () => process.env.CLUB_FROM || "The Beer Depot <bourbon@beerdepotpewaukee.com>";
const ADDRESS = "N27 W26 N26980 Prospect Ave, Pewaukee, WI 53072";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function clubEmail(bottles, token) {
  const unsub = `${SITE}/api/bourbon-club?unsub=${token}`;
  const list = bottles.map(n => `<li style="padding:8px 0;border-bottom:1px solid #4E3626;font-size:17px;color:#fff">${esc(n)}</li>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#F3EBE2;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px">
 <div style="background:#2B1B12;border-radius:14px;padding:22px 22px 14px;color:#E8D9CC">
  <h1 style="margin:0 0 6px;color:#F26B1D;font-size:28px">This Week's Allocated Bourbon</h1>
  <p style="margin:0 0 12px;color:#fff;font-weight:bold">Hard-to-Find Bottles. Once They're Gone, They're Gone.</p>
  <ul style="list-style:none;margin:0;padding:0">${list}</ul>
  <p style="margin:16px 0 6px">In stock as of Thursday 5 PM. First come, first served, in store only.</p>
  <p style="margin:0 0 14px"><a href="${SITE}/#allocated" style="color:#fff;font-weight:bold">See What's Still In Stock</a> &nbsp;·&nbsp; <a href="tel:+12626964602" style="color:#fff;font-weight:bold">262-696-4602</a></p>
 </div>
 <p style="font-size:12px;color:#7A6B60;line-height:1.5;margin:14px 4px">The Beer Depot · ${ADDRESS}<br>
 You're getting this because you joined the Bourbon Club at beerdepotpewaukee.com. Must be 21 or older.<br>
 <a href="${unsub}" style="color:#7A6B60">Unsubscribe</a></p>
</div></body></html>`;
  const text = `This Week's Allocated Bourbon at The Beer Depot\n\n${bottles.map(n => "- " + n).join("\n")}\n\nIn stock as of Thursday 5 PM. First come, first served, in store only.\n${SITE}/#allocated · 262-696-4602\n\nThe Beer Depot · ${ADDRESS}\nUnsubscribe: ${unsub}`;
  return { html, text, unsub };
}

// Sends one email per member (so each gets their own unsubscribe link), 100 per request.
export async function sendClub(members, bottles) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY isn't set in Netlify yet.");
  let sent = 0;
  for (let i = 0; i < members.length; i += 100) {
    const batch = members.slice(i, i + 100).map(([email, m]) => {
      const { html, text, unsub } = clubEmail(bottles, m.token);
      return { from: FROM(), to: [email], subject: "This Week's Allocated Bourbon at The Beer Depot", html, text,
               headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
    });
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(batch) });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
    sent += batch.length;
  }
  return sent;
}
