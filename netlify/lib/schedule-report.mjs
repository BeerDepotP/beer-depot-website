// Friday morning hours email to the owner: who gets paid today, their hours (Friday through Thursday), timecards still missing, and what waits.
const hrs = (a, b) => { if (a === b) return 0; const [h1, m1] = a.split(":").map(Number), [h2, m2] = b.split(":").map(Number); let h = (h2 * 60 + m2 - h1 * 60 - m1) / 60; if (h < 0) h += 24; return h; };
const r2 = h => Math.round(h * 100) / 100;
const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const fD = s => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const hesc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// names: { personId: "Name" }; pd = payday (today, a Friday)
export function buildReport(d, names, pd, t, hm, missingTimecards) {   // missingTimecards comes from schedule.mjs (passed in so the two files do not import each other)
  const ids = [...new Set([...Object.keys(names), ...d.cards.map(c => c.who)])];
  const rows = [], waiting = [];
  for (const id of ids) {
    const v = d.settings.pay[id] || { mode: "weekly", req: "" }, name = names[id] || (d.cards.find(c => c.who === id) || {}).name || "Former Employee";
    const un = d.cards.filter(c => c.who === id && !c.paid), paying = v.mode === "weekly" || v.req === pd;
    const cut = v.req || pd, now = un.filter(c => c.date < cut), later = un.filter(c => c.date >= cut);
    const miss = paying ? missingTimecards(d, id, pd, t, hm) : [];
    if (paying && (now.length || miss.length)) rows.push({ name, hrs: r2(now.reduce((h, c) => h + hrs(c.in, c.out), 0)), days: now.length, miss: miss.map(m => fD(m.date)), later: r2(later.reduce((h, c) => h + hrs(c.in, c.out), 0)), asked: !!v.req });
    else if (!paying && un.length) waiting.push({ name, hrs: r2(un.reduce((h, c) => h + hrs(c.in, c.out), 0)) });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  const total = r2(rows.reduce((h, r) => h + r.hrs, 0)), period = `${fD(addDays(pd, -7))} – ${fD(addDays(pd, -1))}`;
  const subject = `Hours to pay today (${fD(pd)}): ${total} hrs`;
  const line = r => `${r.name}: ${r.hrs} hrs (${r.days} day${r.days === 1 ? "" : "s"})${r.asked ? " - asked to be paid" : ""}${r.miss.length ? " - TIMECARD MISSING: " + r.miss.join(" · ") : ""}${r.later ? " - " + r.later + " hrs worked later go on the next paycheck" : ""}`;
  const text = [`Paychecks go out today at 9 AM. This paycheck covers ${period} (Friday through Thursday).`, "", ...(rows.length ? rows.map(line) : ["Nobody has hours to pay today."]), "", `Total: ${total} hrs`, ...(waiting.length ? ["", "Not being paid today (paid when they ask):", ...waiting.map(w => `${w.name}: ${w.hrs} hrs saved up`)] : []), "", "Open Store Tools → Schedule → Timecards to mark them paid."].join("\n");
  const tr = r => `<tr><td style="padding:8px 6px;border-bottom:1px solid #eee"><b>${hesc(r.name)}</b>${r.asked ? `<br><span style="color:#8C7F74;font-size:13px">Asked to be paid</span>` : ""}${r.miss.length ? `<br><span style="color:#C8102E;font-size:13px"><b>Timecard missing:</b> ${hesc(r.miss.join(" · "))}</span>` : ""}${r.later ? `<br><span style="color:#8C7F74;font-size:13px">${r.later} hrs worked later go on the next paycheck</span>` : ""}</td><td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap"><b>${r.hrs} hrs</b><br><span style="color:#8C7F74;font-size:13px">${r.days} day${r.days === 1 ? "" : "s"}</span></td></tr>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:16px;color:#22160F"><h2 style="margin:0 0 6px">Hours to pay today</h2><p style="margin:0 0 12px;color:#5b4a3d">Paychecks go out today at 9 AM. This paycheck covers ${hesc(period)} (Friday through Thursday).</p>${rows.length ? `<table style="width:100%;border-collapse:collapse">${rows.map(tr).join("")}<tr><td style="padding:10px 6px"><b>Total</b></td><td style="padding:10px 6px;text-align:right"><b>${total} hrs</b></td></tr></table>` : `<p>Nobody has hours to pay today.</p>`}${waiting.length ? `<p style="margin-top:14px;color:#5b4a3d"><b>Not paid today (they get paid when they ask):</b><br>${waiting.map(w => `${hesc(w.name)}: ${w.hrs} hrs saved up`).join("<br>")}</p>` : ""}<p style="color:#8C7F74;font-size:13px;margin-top:16px">Open Store Tools → Schedule → Timecards to mark them paid.</p></div>`;
  return { subject, html, text, total, count: rows.length };
}
