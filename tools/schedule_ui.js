/* ---------- schedule ---------- */
// Everyone with a PIN sees the schedule. The owner (and staff given the "Schedule (Can Edit)" tab) can edit it.
// Employees can give a shift away, swap with a coworker, or take an open shift.
let sch = { data: null, start: "", view: "", draft: null, ed: null };
const SCH_DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], SCH_MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const SCH_COLORS = ["#F26B1D","#1F7A3A","#2F6DB5","#8A4FBF","#C8102E","#B8860B","#2B1A10"];
const p2 = n => String(n).padStart(2,"0");
const spd = s => new Date(s + "T12:00:00");
const siso = d => d.getFullYear() + "-" + p2(d.getMonth()+1) + "-" + p2(d.getDate());
const addD = (s, n) => { const d = spd(s); d.setDate(d.getDate() + n); return siso(d); };
const wkStart = s => addD(s, -spd(s).getDay());
const fDay = s => SCH_DOW[spd(s).getDay()] + ", " + SCH_MON[spd(s).getMonth()] + " " + spd(s).getDate();
const fDayS = s => SCH_DOW[spd(s).getDay()] + " " + SCH_MON[spd(s).getMonth()] + " " + spd(s).getDate();
function fT(t, short){ let [h,m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return h + (m ? ":" + p2(m) : "") + (short ? ap[0].toLowerCase() : " " + ap); }
const fR = (s, e) => fT(s) + " – " + fT(e), fRs = (s, e) => fT(s,1) + "–" + fT(e,1);
const hrs = (s, e) => { const [a,b] = s.split(":").map(Number), [c,d] = e.split(":").map(Number); return (c*60 + d - a*60 - b) / 60; };
const fHrs = h => (Math.round(h * 10) / 10) + " hrs";
const schToday = () => (sch.data && sch.data.today) || chicagoStamp().slice(0,10);
const schNow = () => chicagoStamp().slice(11,16);
const schIsMgr = () => !!(sch.data && sch.data.me.manager);
const schName = id => { const p = sch.data.team.find(x => x.id === id); return id === sch.data.me.id ? (p ? p.name : "You") : (p ? p.name : "Former Employee"); };
const schPreset = (s, e) => sch.data.presets.find(p => p.start === s && p.end === e);
const schColor = (s, e) => (schPreset(s, e) || {}).color || "#6F6259";
const schDays = () => Array.from({length:7}, (_, i) => addD(sch.start, i));
const schShifts = date => (sch.data.shifts[date] || []);

async function schCall(body){
  const t = schToday(), s = sch.start || wkStart(t), e = addD(s, 6);
  let from = s, to = e;
  if(Math.abs((spd(s) - spd(t)) / 86400000) <= 30){ from = s < t ? s : t; const far = addD(t, 27); to = e > far ? e : far; }
  const j = await api("/api/schedule", { from, to, ...body });
  sch.data = j; return j;
}
async function loadSchedule(){
  try{
    if(!sch.start) sch.start = wkStart(chicagoStamp().slice(0,10));
    await schCall({ action: "get" });
    if(!sch.view) sch.view = sch.data.me.manager ? "team" : "mine";
    if(sch.view === "setup" && !sch.data.me.manager) sch.view = "mine";
    renderSchedule();
  }catch(err){ if(err.status === 401 || err.status === 429) lockPage(err.message); else toast(err.message, true); }
}
function setSchBadge(n){ const el = document.querySelector('[data-badge="schedule"]'); if(!el) return; el.hidden = !n; el.textContent = n > 99 ? "99+" : n; el.setAttribute("aria-label", n ? n + " need you" : ""); }

/* requests in plain words */
const schActive = r => ["open","ask","approve"].includes(r.status);
function reqText(r){
  const a = `${fDayS(r.date)} ${fRs(r.a.start, r.a.end)}`;
  if(r.kind === "give") return r.taker ? `${schName(r.taker)} takes ${schName(r.by)}'s ${a}` : `${schName(r.by)} is giving away ${a}`;
  if(r.kind === "claim") return `${schName(r.taker)} asked for the open shift ${a}`;
  return `${schName(r.by)} wants to swap ${a} for ${schName(r.withWho)}'s ${fDayS(r.withDate)} ${fRs(r.b.start, r.b.end)}`;
}
function reqStatus(r){
  return ({ open: "Waiting for someone to take it", ask: "Waiting for " + schName(r.withWho), approve: "Waiting for the owner's OK", done: "Done", declined: "Said no", cancelled: "Cancelled" })[r.status] || r.status;
}

/* ---------- screens ---------- */
function renderSchedule(){
  const d = sch.data, mgr = schIsMgr();
  const s = sch.start, e = addD(s, 6), same = spd(s).getMonth() === spd(e).getMonth();
  $("#sch-range").textContent = `${SCH_MON[spd(s).getMonth()]} ${spd(s).getDate()} – ${same ? "" : SCH_MON[spd(e).getMonth()] + " "}${spd(e).getDate()}`;
  $("#sch-today").hidden = s === wkStart(schToday());
  const waiting = d.needs + d.offers;
  const pills = [["mine","My Shifts"],["team","Whole Team"],["swaps","Swaps" + (waiting ? " (" + waiting + ")" : "")]];
  if(mgr) pills.push(["setup","Setup"]);
  $("#sch-pills").innerHTML = pills.map(([k,n]) => `<button type="button" class="sch-pill" data-schview="${k}" aria-pressed="${sch.view === k}">${esc(n)}</button>`).join("");
  setSchBadge(waiting);
  $("#sch-body").innerHTML = ({ mine: viewMine, team: viewTeam, swaps: viewSwaps, setup: viewSetup })[sch.view]();
}

function nextShiftBanner(){
  const d = sch.data, me = d.me.id, t = schToday(), now = schNow();
  const dates = Object.keys(d.shifts).sort();
  for(const date of dates){
    if(date < t) continue;
    const s = d.shifts[date].find(x => x.who === me && (date > t || x.end > now));
    if(s) return `<div class="card sch-next"><span class="help" style="margin:0">Your Next Shift</span><b>${date === t ? "Today" : fDay(date)} · ${fR(s.start, s.end)}</b>${s.note ? `<span class="help" style="margin:0">${esc(s.note)}</span>` : ""}</div>`;
  }
  return `<div class="card sch-next"><span class="help" style="margin:0">Your Next Shift</span><b>Nothing coming up yet</b></div>`;
}
function pendingFor(shiftId){ return sch.data.requests.find(r => schActive(r) && (r.shiftId === shiftId || r.withShiftId === shiftId)); }

function viewMine(){
  const d = sch.data, me = d.me.id, t = schToday(); let total = 0;
  const rows = schDays().map(date => {
    const mine = schShifts(date).filter(x => x.who === me); mine.forEach(x => total += hrs(x.start, x.end));
    const past = date < t;
    return `<div class="sch-day${date === t ? " today" : ""}${past ? " past" : ""}"><div class="sch-dl"><b>${SCH_DOW[spd(date).getDay()]}</b><span>${SCH_MON[spd(date).getMonth()]} ${spd(date).getDate()}</span></div>
      <div class="sch-dr">${mine.length ? mine.map(x => { const pr = pendingFor(x.id);
        return `<div class="sch-mine" style="border-left-color:${schColor(x.start, x.end)}"><div><b>${fR(x.start, x.end)}</b>${x.note ? `<span class="help" style="margin:0">${esc(x.note)}</span>` : ""}${pr ? `<span class="sch-flag">Request waiting</span>` : ""}</div>
        ${past ? "" : `<button class="btn ghost sch-sm" type="button" data-schmine="${esc(date)}|${esc(x.id)}">${pr ? "See Request" : "Swap or Give Away"}</button>`}</div>`; }).join("") : `<span class="sch-off">Off</span>`}</div></div>`;
  }).join("");
  return nextShiftBanner() + `<p class="help" style="margin:8px 2px">This week you work <b>${fHrs(total)}</b>. Use the arrows above to look at other weeks.</p>` + rows;
}

function viewTeam(){
  const d = sch.data, mgr = schIsMgr(), me = d.me.id, t = schToday(), days = schDays();
  const known = new Set(d.team.map(p => p.id));
  const people = d.team.filter(p => !p.hidden || days.some(x => schShifts(x).some(s => s.who === p.id))).sort((a, b) => (b.id === me) - (a.id === me));
  const former = days.some(x => schShifts(x).some(s => s.who && !known.has(s.who)));
  const rows = people.map(p => ({ id: p.id, name: p.id === me ? p.name + " (You)" : p.name }));
  if(former) rows.push({ id: "__gone", name: "Former Employee" });
  const hasOpen = days.some(x => schShifts(x).some(s => !s.who));
  if(mgr || hasOpen) rows.push({ id: "", name: "Open Shifts", open: true });
  const head = days.map(x => `<th class="${x === t ? "today" : ""}">${SCH_DOW[spd(x).getDay()]}<small>${spd(x).getDate()}</small></th>`).join("");
  const body = rows.map(r => {
    let tot = 0;
    const cells = days.map(x => {
      const list = schShifts(x).filter(s => r.id === "__gone" ? (s.who && !known.has(s.who)) : s.who === r.id);
      list.forEach(s => tot += hrs(s.start, s.end));
      return `<td data-d="${x}" data-w="${esc(r.id)}" class="${x === t ? "today" : ""}${mgr ? " edit" : ""}">${list.map(s => `<span class="sch-chip${pendingFor(s.id) ? " pend" : ""}${s.who === me ? " me" : ""}" data-sid="${esc(s.id)}" style="background:${schColor(s.start, s.end)}">${fRs(s.start, s.end)}${s.note ? "<i>•</i>" : ""}</span>`).join("")}${mgr && !list.length ? `<span class="sch-plus">+</span>` : ""}</td>`;
    }).join("");
    return `<tr${r.id === me ? ' class="sch-me"' : ""}><th class="sch-nm" scope="row">${esc(r.name)}</th>${cells}<td class="sch-tot">${r.open ? "" : tot ? fHrs(tot) : "–"}</td></tr>`;
  }).join("");
  const legend = d.presets.map(p => `<span class="sch-key"><i style="background:${p.color}"></i>${esc(p.name || fRs(p.start, p.end))} ${fRs(p.start, p.end)}</span>`).join("");
  return `<p class="help" style="margin:4px 2px 8px">${mgr ? "Tap a day to add a shift. Tap a shift to change it, move it to someone else, or remove it." : "Tap your own shift to swap or give it away. Tap a coworker's shift to ask to swap. Tap an open shift to take it."}</p>
    <div class="sch-wrap"><table class="sch-tbl"><thead><tr><th class="sch-nm"></th>${head}<th class="sch-tot">Total</th></tr></thead><tbody>${body}</tbody></table></div>
    <div class="sch-legend">${legend}<span class="sch-key"><i style="background:#6F6259"></i>Custom Time</span><span class="sch-key"><i class="pendkey"></i>Request Waiting</span></div>`;
}

function reqCard(r, buttons){
  return `<div class="card sch-req" data-rid="${esc(r.id)}"><b>${esc(reqText(r))}</b>${r.note ? `<span class="help" style="margin:0">“${esc(r.note)}”</span>` : ""}<span class="help" style="margin:0">${esc(reqStatus(r))}${r.why ? " · " + esc(r.why) : ""}</span>${buttons ? `<div class="sch-btns">${buttons}</div>` : ""}</div>`;
}
function viewSwaps(){
  const d = sch.data, me = d.me.id, mgr = d.me.manager, t = schToday();
  const live = d.requests.filter(r => schActive(r) && r.date >= t);
  const B = (act, label, cls) => `<button type="button" class="btn ${cls || ""} sch-sm" data-schreq="${act}">${label}</button>`;
  const youAnswer = live.filter(r => r.status === "ask" && r.withWho === me);
  const okNeeded = mgr ? live.filter(r => r.status === "approve") : [];
  const offered = live.filter(r => r.status === "open" && r.by !== me);
  const openShifts = [];
  Object.keys(d.shifts).sort().forEach(date => { if(date >= t) d.shifts[date].filter(s => !s.who && !d.requests.some(r => schActive(r) && r.kind === "claim" && r.shiftId === s.id)).forEach(s => openShifts.push({ date, s })); });
  const mineR = live.filter(r => r.by === me || r.taker === me).filter(r => !youAnswer.includes(r) && !okNeeded.includes(r));
  const recent = d.requests.filter(r => !schActive(r)).slice(0, 8);
  const sec = (title, html, empty) => `<h3 class="grp">${title}</h3>${html || `<p class="help">${empty}</p>`}`;
  return sec("Waiting For Your Answer", youAnswer.map(r => reqCard(r, B("yes", "Yes, Swap", "") + B("no", "No Thanks", "ghost"))).join(""), "Nothing waiting on you.")
    + (mgr ? sec("Needs Your OK", okNeeded.map(r => reqCard(r, B("approve", "OK It", "") + B("deny", "Say No", "ghost"))).join(""), "Nothing to approve.") : "")
    + sec("Shifts Offered", offered.map(r => reqCard(r, B("take", "Take This Shift", ""))).join(""), "Nobody is giving a shift away right now.")
    + sec("Open Shifts", openShifts.map(({ date, s }) => `<div class="card sch-req"><b>${fDay(date)} · ${fR(s.start, s.end)}</b>${s.note ? `<span class="help" style="margin:0">${esc(s.note)}</span>` : ""}<div class="sch-btns"><button type="button" class="btn sch-sm" data-schopen="${esc(date)}|${esc(s.id)}">I'll Take It</button></div></div>`).join(""), "No open shifts.")
    + sec("Your Requests", mineR.map(r => reqCard(r, B("cancel", "Cancel Request", "ghost"))).join(""), "You haven't asked for anything.")
    + (recent.length ? sec("Recently Finished", recent.map(r => reqCard(r, "")).join("")) : "");
}

function viewSetup(){
  const d = sch.data;
  if(!sch.draft) sch.draft = d.presets.map(p => ({ ...p }));
  const presets = sch.draft.map((p, i) => `<div class="card sch-pr" data-pi="${i}"><div class="sch-prt"><input data-pf="name" value="${esc(p.name)}" maxlength="24" placeholder="Name (Example: Open)" aria-label="Shift name"><button type="button" class="sch-x" data-prm="${i}" aria-label="Remove preset">×</button></div>
      <div class="sch-prt"><label class="help" style="margin:0">From<input type="time" data-pf="start" value="${esc(p.start)}"></label><label class="help" style="margin:0">To<input type="time" data-pf="end" value="${esc(p.end)}"></label></div>
      <div class="sch-cols">${SCH_COLORS.map(c => `<button type="button" class="sch-col${c === p.color ? " on" : ""}" style="background:${c}" data-pcol="${c}" aria-label="Color"></button>`).join("")}</div></div>`).join("");
  const people = d.team.map(p => `<li><span><span class="nm">${esc(p.name)}</span><span class="st${p.hidden ? "" : " on"}">${p.hidden ? "Not on the schedule" : "On the schedule"}</span></span><button class="sw sch-sw" role="switch" aria-checked="${!p.hidden}" aria-label="${esc(p.name)} on the schedule" data-schhide="${esc(p.id)}"></button></li>`).join("");
  return `<h3 class="grp">Shift Presets</h3><p class="help">These are the one-tap buttons you use to add a shift. Change the times, rename them, pick a color, or add your own.</p>${presets}
    <button class="btn ghost" type="button" id="sch-padd">+ Add a Preset</button><button class="btn" type="button" id="sch-psave">Save Presets</button>
    <h3 class="grp">Swaps</h3>
    <ul class="sw-list"><li><span><span class="nm">I Approve Swaps First</span><span class="st${d.settings.approval ? " on" : ""}">${d.settings.approval ? "On: swaps wait for your OK" : "Off: swaps happen right away"}</span></span><button class="sw sch-sw" role="switch" aria-checked="${d.settings.approval}" aria-label="Approve swaps first" id="sch-appr"></button></li></ul>
    <h3 class="grp">Who Is on the Schedule</h3>
    <ul class="sw-list">${people}</ul>
    <p class="help" style="margin-top:8px">To add an employee, add them in the Staff tab with a PIN. Then they can look at the schedule and ask for swaps. Give a person the “Schedule (Can Edit)” tab if they should be able to edit it too.</p>
    <div class="card sp-card" style="margin-top:8px"><label class="help" for="sch-oname" style="margin:0">Your Name on the Schedule</label><input id="sch-oname" maxlength="30" value="${esc(d.settings.ownerName)}"><button class="btn ghost" type="button" id="sch-osave">Save Name</button></div>
    <h3 class="grp">This Week (${esc(fDayS(sch.start))})</h3>
    <button class="btn ghost" type="button" id="sch-copy">Copy Last Week Into This Week</button>
    <button class="btn ghost rm-site" type="button" id="sch-clear">Clear This Week</button>`;
}

/* ---------- pop-up ---------- */
const schBox = () => $("#sch-box");
function schOpen(html){ schBox().innerHTML = html; $("#sch-modal").hidden = false; const f = schBox().querySelector("button,input,select"); if(f) f.focus(); }
function schClose(){ $("#sch-modal").hidden = true; sch.ed = null; }
const presetBtns = (attr, small) => sch.data.presets.map(p => `<button type="button" class="sch-pbtn" style="background:${p.color}" ${attr}="${esc(p.id)}"><b>${esc(p.name || "Shift")}</b><span>${fRs(p.start, p.end)}</span></button>`).join("");

function schCell(date, who){            // owner: a day for one person
  const mine = schShifts(date).filter(s => s.who === who);
  const who2 = who ? schName(who) : "Open Shifts";
  sch.ed = { date, who, sid: null };
  schOpen(`<h3 class="sch-h">${esc(who2)} · ${esc(fDay(date))}</h3>
    ${mine.map(s => `<div class="sch-ex"><span class="sch-chip" style="background:${schColor(s.start, s.end)}">${fR(s.start, s.end)}</span><span class="help" style="margin:0">${esc(s.note || "")}</span><button type="button" class="btn ghost sch-sm" data-sched="${esc(s.id)}">Change</button></div>`).join("")}
    <p class="help" style="margin:10px 0 6px">Tap a shift to add it:</p><div class="sch-pgrid">${presetBtns("data-addp")}</div>
    <details class="sch-cust"><summary>Other Time</summary><div class="sch-prt"><label class="help" style="margin:0">From<input type="time" id="sch-c-s" value="09:00"></label><label class="help" style="margin:0">To<input type="time" id="sch-c-e" value="17:00"></label></div>
    <input id="sch-c-n" maxlength="60" placeholder="Note (Optional)" aria-label="Note"><button type="button" class="btn" id="sch-c-add">Add This Shift</button></details>
    <button type="button" class="btn ghost" data-schclose>Close</button>`);
}
function schEdit(date, sid){            // owner: change one shift
  const s = schShifts(date).find(x => x.id === sid); if(!s) return;
  sch.ed = { date, who: s.who, sid };
  const opts = [`<option value="">Open Shift (Nobody Yet)</option>`, ...sch.data.team.filter(p => !p.hidden || p.id === s.who).map(p => `<option value="${esc(p.id)}"${p.id === s.who ? " selected" : ""}>${esc(p.name)}</option>`)].join("");
  schOpen(`<h3 class="sch-h">${esc(fDay(date))}</h3>
    <label class="help" for="se-w" style="margin:0">Who Works It</label><select id="sch-e-w">${opts}</select>
    <p class="help" style="margin:10px 0 6px">Quick times:</p><div class="sch-pgrid">${presetBtns("data-usep")}</div>
    <div class="sch-prt"><label class="help" style="margin:0">From<input type="time" id="sch-e-s" value="${esc(s.start)}"></label><label class="help" style="margin:0">To<input type="time" id="sch-e-e" value="${esc(s.end)}"></label></div>
    <input id="sch-e-n" maxlength="60" value="${esc(s.note || "")}" placeholder="Note (Optional)" aria-label="Note">
    <button type="button" class="btn" id="sch-e-save">Save</button><button type="button" class="btn ghost rm-site" id="sch-e-del">Remove This Shift</button><button type="button" class="btn ghost" data-schclose>Close</button>`);
}
function myUpcoming(){
  const me = sch.data.me.id, t = schToday(), now = schNow(), out = [];
  Object.keys(sch.data.shifts).sort().forEach(date => { if(date >= t) sch.data.shifts[date].forEach(s => { if(s.who === me && (date > t || s.end > now) && !pendingFor(s.id)) out.push({ date, s }); }); });
  return out;
}
function schMine(date, sid){            // employee: one of my shifts
  const s = schShifts(date).find(x => x.id === sid); if(!s) return;
  const pr = pendingFor(sid);
  if(pr){ schOpen(`<h3 class="sch-h">${esc(fDay(date))} · ${esc(fR(s.start, s.end))}</h3>${reqCard(pr, "").replace('class="card sch-req"', 'class="sch-req"')}
    ${pr.by === sch.data.me.id || sch.data.me.manager ? `<button type="button" class="btn ghost rm-site" data-schcancel="${esc(pr.id)}">Cancel This Request</button>` : ""}<button type="button" class="btn ghost" data-schclose>Close</button>`); return; }
  const t = schToday(), now = schNow(), others = [];
  Object.keys(sch.data.shifts).sort().forEach(d => { if(d >= t) sch.data.shifts[d].forEach(x => { if(x.who && x.who !== sch.data.me.id && (d > t || x.end > now) && !pendingFor(x.id)) others.push({ d, x }); }); });
  sch.ed = { date, sid };
  schOpen(`<h3 class="sch-h">${esc(fDay(date))} · ${esc(fR(s.start, s.end))}</h3>
    <input id="sch-m-n" maxlength="80" placeholder="Note (Optional, Example: Doctor Appointment)" aria-label="Note">
    <button type="button" class="btn" id="sch-m-give">Give Away This Shift</button><p class="help" style="margin:4px 2px 0">Everyone can see it and anyone can take it.</p>
    <h3 class="grp" style="margin-top:14px">Or Swap With a Coworker</h3>
    <div class="sch-list">${others.length ? others.slice(0, 30).map(({ d, x }) => `<button type="button" class="btn ghost sch-row" data-doswap="${esc(d)}|${esc(x.id)}"><b>${esc(schName(x.who))}</b><span>${esc(fDayS(d))} · ${esc(fRs(x.start, x.end))}</span></button>`).join("") : `<p class="help">No coworker shifts to swap with yet.</p>`}</div>
    <button type="button" class="btn ghost" data-schclose>Close</button>`);
}
function schOther(date, sid){           // employee: a coworker's or an open shift
  const s = schShifts(date).find(x => x.id === sid); if(!s) return;
  if(!s.who){
    schOpen(`<h3 class="sch-h">Open Shift</h3><p class="sch-p"><b>${esc(fDay(date))}</b><br>${esc(fR(s.start, s.end))}${s.note ? "<br>" + esc(s.note) : ""}</p>
      <button type="button" class="btn" data-schopen="${esc(date)}|${esc(sid)}">I'll Take It</button>${sch.data.settings.approval ? `<p class="help" style="margin:4px 2px 0">The owner will need to OK it.</p>` : ""}<button type="button" class="btn ghost" data-schclose>Close</button>`); return; }
  const mine = myUpcoming();
  schOpen(`<h3 class="sch-h">${esc(schName(s.who))} Works This</h3><p class="sch-p"><b>${esc(fDay(date))}</b><br>${esc(fR(s.start, s.end))}</p>
    ${pendingFor(sid) ? `<p class="help">There is already a request waiting on this shift.</p>` : mine.length ? `<h3 class="grp" style="margin-top:6px">Ask to Swap — Pick Your Shift to Give</h3><div class="sch-list">${mine.map(({ date: md, s: ms }) => `<button type="button" class="btn ghost sch-row" data-doswap2="${esc(md)}|${esc(ms.id)}|${esc(date)}|${esc(sid)}"><b>${esc(fDayS(md))}</b><span>${esc(fRs(ms.start, ms.end))}</span></button>`).join("")}</div>` : `<p class="help">You don't have an upcoming shift to swap.</p>`}
    <button type="button" class="btn ghost" data-schclose>Close</button>`);
}

/* ---------- actions ---------- */
async function schDo(body, msg, keepOpen){
  try{ await schCall(body); if(!keepOpen) schClose(); renderSchedule(); if(msg) toast(msg); return true; }
  catch(err){ if(err.status === 401 || err.status === 429) { lockPage(err.message); return false; } toast(err.message, true); return false; }
}
$("#sch-prev").onclick = () => { sch.start = addD(sch.start, -7); loadSchedule(); };
$("#sch-next").onclick = () => { sch.start = addD(sch.start, 7); loadSchedule(); };
$("#sch-today").onclick = () => { sch.start = wkStart(schToday()); loadSchedule(); };
$("#sch-modal").addEventListener("click", e => { if(e.target.id === "sch-modal") schClose(); });
document.addEventListener("keydown", e => { if(e.key === "Escape" && !$("#sch-modal").hidden) schClose(); });

document.addEventListener("click", async e => {
  const el = e.target; if(!el.closest) return;
  const v = el.closest("[data-schview]"); if(v){ sch.view = v.dataset.schview; if(sch.view === "setup") sch.draft = null; renderSchedule(); return; }
  if(el.closest("[data-schclose]")){ schClose(); return; }
  const td = el.closest(".sch-tbl td[data-d]");
  if(td && sch.data && !el.closest("#sch-modal")){
    const date = td.dataset.d, who = td.dataset.w, chip = el.closest(".sch-chip"), sid = chip && chip.dataset.sid;
    if(schIsMgr()){ if(sid) schEdit(date, sid); else if(who !== "__gone") schCell(date, who); return; }
    if(!sid || date < schToday()) return;
    const s = schShifts(date).find(x => x.id === sid);
    if(s && s.who === sch.data.me.id) schMine(date, sid); else schOther(date, sid);
    return;
  }
  const mine = el.closest("[data-schmine]"); if(mine){ const [d, s] = mine.dataset.schmine.split("|"); schMine(d, s); return; }
  const ed = el.closest("[data-sched]"); if(ed){ schEdit(sch.ed.date, ed.dataset.sched); return; }
  const ap = el.closest("[data-addp]");
  if(ap && sch.ed){ const p = sch.data.presets.find(x => x.id === ap.dataset.addp); await schDo({ action: "save", date: sch.ed.date, who: sch.ed.who, start: p.start, end: p.end, note: "" }, `${p.name || "Shift"} added for ${sch.ed.who ? schName(sch.ed.who) : "Open Shift"}`); return; }
  if(el.closest("#sch-c-add") && sch.ed){ const s = $("#sch-c-s").value, en = $("#sch-c-e").value; await schDo({ action: "save", date: sch.ed.date, who: sch.ed.who, start: s, end: en, note: $("#sch-c-n").value }, "Shift added"); return; }
  const up = el.closest("[data-usep]"); if(up){ const p = sch.data.presets.find(x => x.id === up.dataset.usep); $("#sch-e-s").value = p.start; $("#sch-e-e").value = p.end; return; }
  if(el.closest("#sch-e-save") && sch.ed){ await schDo({ action: "save", id: sch.ed.sid, date: sch.ed.date, who: $("#sch-e-w").value, start: $("#sch-e-s").value, end: $("#sch-e-e").value, note: $("#sch-e-n").value }, "Saved"); return; }
  if(el.closest("#sch-e-del") && sch.ed){ const ed2 = sch.ed; schClose(); if(await askYes("Remove this shift?", "Remove It", true)) await schDo({ action: "delete", date: ed2.date, id: ed2.sid }, "Shift removed"); return; }
  if(el.closest("#sch-m-give") && sch.ed){ await schDo({ action: "give", date: sch.ed.date, shiftId: sch.ed.sid, note: $("#sch-m-n").value }, "Offered. Everyone can see it now."); return; }
  const sw1 = el.closest("[data-doswap]"); if(sw1 && sch.ed){ const [wd, ws] = sw1.dataset.doswap.split("|"); await schDo({ action: "swap", date: sch.ed.date, shiftId: sch.ed.sid, withDate: wd, withShiftId: ws, note: $("#sch-m-n").value }, "Swap request sent"); return; }
  const sw2 = el.closest("[data-doswap2]"); if(sw2){ const [md, ms, wd, ws] = sw2.dataset.doswap2.split("|"); await schDo({ action: "swap", date: md, shiftId: ms, withDate: wd, withShiftId: ws }, "Swap request sent"); return; }
  const cn = el.closest("[data-schcancel]"); if(cn){ await schDo({ action: "cancel", id: cn.dataset.schcancel }, "Cancelled"); return; }
  const ot = el.closest("[data-schopen]"); if(ot){ const [d, s] = ot.dataset.schopen.split("|"); await schDo({ action: "openTake", date: d, shiftId: s }, sch.data.settings.approval ? "Asked. The owner will OK it." : "It's yours!"); return; }
  const rq = el.closest("[data-schreq]");
  if(rq){ const id = rq.closest("[data-rid]").dataset.rid, a = rq.dataset.schreq;
    const m = ({ yes: [{ action: "answer", accept: true }, sch.data.settings.approval ? "Said yes. The owner will OK it." : "Swapped!"], no: [{ action: "answer", accept: false }, "Said no"],
      take: [{ action: "take" }, sch.data.settings.approval ? "Asked. The owner will OK it." : "It's yours!"], cancel: [{ action: "cancel" }, "Cancelled"],
      approve: [{ action: "resolve", approve: true }, "Done. The schedule is updated."], deny: [{ action: "resolve", approve: false }, "Said no"] })[a];
    await schDo({ id, ...m[0] }, m[1], true); return; }
  /* setup */
  const pc = el.closest("[data-pcol]"); if(pc){ sch.draft[+pc.closest("[data-pi]").dataset.pi].color = pc.dataset.pcol; renderSchedule(); return; }
  const pr = el.closest("[data-prm]"); if(pr){ sch.draft.splice(+pr.dataset.prm, 1); renderSchedule(); return; }
  if(el.closest("#sch-padd")){ sch.draft.push({ id: "", name: "", start: "09:00", end: "17:00", color: SCH_COLORS[sch.draft.length % SCH_COLORS.length] }); renderSchedule(); const ins = $$('.sch-pr input[data-pf=name]'); if(ins.length) ins[ins.length-1].focus(); return; }
  if(el.closest("#sch-psave")){ if(await schDo({ action: "presets", presets: sch.draft }, "Presets saved", true)) sch.draft = null, renderSchedule(); return; }
  if(el.closest("#sch-appr")){ await schDo({ action: "settings", approval: !sch.data.settings.approval }, null, true); return; }
  const hd = el.closest("[data-schhide]"); if(hd){ const id = hd.dataset.schhide, hide = new Set(sch.data.settings.hide); if(hide.has(id)) hide.delete(id); else hide.add(id); await schDo({ action: "settings", hide: [...hide] }, null, true); return; }
  if(el.closest("#sch-osave")){ await schDo({ action: "settings", ownerName: $("#sch-oname").value }, "Name saved", true); return; }
  if(el.closest("#sch-copy")){ if(await askYes("Copy last week's shifts into this week? Shifts already here stay.", "Copy")) await schDo({ action: "copyWeek", from: addD(sch.start, -7), to: sch.start }, "Copied last week", true); return; }
  if(el.closest("#sch-clear")){ if(await askYes("Clear every shift this week?", "Clear It", true)) await schDo({ action: "clearWeek", start: sch.start }, "Week cleared", true); return; }
});
document.addEventListener("input", e => {
  const r = e.target.closest && e.target.closest("[data-pi]"); if(!r || !sch.draft || !e.target.dataset.pf) return;
  sch.draft[+r.dataset.pi][e.target.dataset.pf] = e.target.value;
});
