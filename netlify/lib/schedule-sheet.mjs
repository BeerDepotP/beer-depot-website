// Spreadsheet (CSV, opens in Excel / Numbers / Google Sheets) of timecards + every scheduled shift, from the live schedule or a nightly safety copy.
const hrs = (a, b) => { if (!a || !b || a === b) return 0; const [h1, m1] = a.split(":").map(Number), [h2, m2] = b.split(":").map(Number); let h = (h2 * 60 + m2 - h1 * 60 - m1) / 60; if (h < 0) h += 24; return h; };
const r2 = h => Math.round(h * 100) / 100;
const dayName = s => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const dateNice = s => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const t12 = t => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return ((h % 12) || 12) + ":" + String(m).padStart(2, "0") + " " + (h < 12 ? "AM" : "PM"); };
const cell = v => { v = String(v ?? ""); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const row = a => a.map(cell).join(",");

export function namesOf(d, staff) {
  const n = { owner: (d.settings && d.settings.ownerName) || "Tyler" };
  for (const m of ((staff && staff.members) || [])) n[m.id] = m.name;
  for (const p of ((d.settings && d.settings.people) || [])) n[p.id] = p.name;
  return n;
}

export function buildSheet(d, names, title) {
  const nm = id => id === "" || id == null ? "Open Shift" : (names[id] || "Former Employee");
  const out = [row([title || "Beer Depot Schedule and Timecards"]), ""];
  // Timecards
  out.push(row(["TIMECARDS"]), row(["Person", "Date", "Day", "Clocked In", "Clocked Out", "Hours", "Paid?", "Paid On", "Check #", "Note"]));
  const cards = [...(d.cards || [])].sort((a, b) => nm(a.who).localeCompare(nm(b.who)) || a.date.localeCompare(b.date) || String(a.in).localeCompare(String(b.in)));
  let tot = 0;
  for (const c of cards) {
    const h = c.off ? 0 : r2(hrs(c.in, c.out)); tot += h;
    const note = [c.off ? "Did not work" : "", c.auto ? "Forgot to clock out (we clocked them out)" : "", c.extra ? "Extra hours (not on the schedule)" : "", c.edited && c.orig ? "Edited (was " + t12(c.orig.in) + " to " + t12(c.orig.out) + ")" : c.edited ? "Edited" : ""].filter(Boolean).join("; ");
    out.push(row([nm(c.who), dateNice(c.date), dayName(c.date), c.off ? "" : t12(c.in), c.off ? "" : t12(c.out), h, c.paid ? "Yes" : "No", c.paidAt ? String(c.paidAt).slice(0, 10) : "", c.check || "", note]));
  }
  out.push(row(["Total Hours", "", "", "", "", r2(tot)]), "");
  // Schedule
  out.push(row(["SCHEDULE (EVERY SHIFT)"]), row(["Date", "Day", "Person", "Start", "End", "Hours", "Note"]));
  for (const date of Object.keys(d.shifts || {}).sort()) {
    const list = [...d.shifts[date]].sort((a, b) => String(a.start).localeCompare(String(b.start)) || nm(a.who).localeCompare(nm(b.who)));
    for (const s of list) out.push(row([dateNice(date), dayName(date), nm(s.who), t12(s.start), t12(s.end), r2(hrs(s.start, s.end)), s.note || ""]));
  }
  return "﻿" + out.join("\r\n") + "\r\n";
}
