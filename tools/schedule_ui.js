/* ---------- schedule ---------- */
// Everyone with a PIN sees the schedule. The owner (and staff given the "Schedule (Can Edit)" tab) can edit it.
// Employees can give a shift away, swap with a coworker, or take an open shift.
let sch = { data: null, start: "", month: "", tmode: "month", view: "", draft: null, ed: null };
const SCH_DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], SCH_MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const SCH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
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
const SCH_PAL = ["#F26B1D","#1F7A3A","#2F6DB5","#8A4FBF","#C8102E","#B8860B","#0E8A8A","#D6336C","#5B6770","#7A4A1E"];
function empColor(id){ const d = sch.data; if(!id) return "#8C7F74"; const c = (d.settings.colors || {})[id]; if(c) return c; const i = d.team.findIndex(p => p.id === id); return SCH_PAL[(i < 0 ? 0 : i) % SCH_PAL.length]; }
const nightFrom = () => (sch.data.settings.nightFrom || "12:00");
const isNight = s => s.start >= nightFrom();
const myHours = (from, to) => { let h = 0; for(let d = from; d <= to; d = addD(d, 1)) schShifts(d).forEach(s => { if(s.who === sch.data.me.id) h += hrs(s.start, s.end); }); return h; };
const monthName = s => SCH_FULL[spd(s).getMonth()];
const firstName = n => String(n).split(" ")[0];
const schDays = () => Array.from({length:7}, (_, i) => addD(sch.start, i));
const schShifts = date => (sch.data.shifts[date] || []);

function schRange(){
  const t = schToday();
  if(sch.view === "team" && sch.tmode === "month" && sch.month){ const f = wkStart(sch.month); return [f, addD(f, 41)]; }
  const s = sch.start || wkStart(t), e = addD(s, 6);
  if(sch.view === "mine"){ const m = monthFirst(addD(s, 3)), me2 = addD(shiftMonth(m, 1), -1), f = m < s ? m : s, far = addD(t, 27);
    let to2 = e > me2 ? e : me2; if(far > to2 && (spd(far) - spd(f)) / 86400000 <= 60) to2 = far; return [f < t && t < s ? f : f, to2]; }
  let from = s, to = e;
  if(Math.abs((spd(s) - spd(t)) / 86400000) <= 30){ from = s < t ? s : t; const far = addD(t, 27); to = e > far ? e : far; }
  return [from, to];
}
const monthFirst = s => { const d = spd(s); d.setDate(1); return siso(d); };
const shiftMonth = (s, n) => { const d = spd(s); d.setDate(1); d.setMonth(d.getMonth() + n); return siso(d); };
async function schCall(body){
  const [from, to] = schRange();
  const j = await api("/api/schedule", { from, to, ...body });
  sch.data = j; return j;
}
async function loadSchedule(){
  try{
    if(!sch.start) sch.start = wkStart(chicagoStamp().slice(0,10));
    if(!sch.month) sch.month = monthFirst(chicagoStamp().slice(0,10));
    if(!sch.view) sch.view = (sch.data ? sch.data.me.manager : true) ? "team" : "mine";
    await schCall({ action: "get" });
    if(!sch.data.me.manager && sch.view === "team" && !sch.viewSet){ sch.view = "mine"; await schCall({ action: "get" }); }
    sch.viewSet = true;
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
  const s = sch.start, e = addD(s, 6), same = spd(s).getMonth() === spd(e).getMonth(), inMonth = sch.view === "team" && sch.tmode === "month";
  if(inMonth){ $("#sch-range").textContent = SCH_FULL[spd(sch.month).getMonth()] + " " + spd(sch.month).getFullYear(); $("#sch-today").textContent = "This Month"; $("#sch-today").hidden = sch.month === monthFirst(schToday()); }
  else { $("#sch-range").textContent = `${SCH_MON[spd(s).getMonth()]} ${spd(s).getDate()} – ${same ? "" : SCH_MON[spd(e).getMonth()] + " "}${spd(e).getDate()}`; $("#sch-today").textContent = "This Week"; $("#sch-today").hidden = s === wkStart(schToday()); }
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
        return `<div class="sch-mine" style="border-left-color:${empColor(me)}"><div><b>${fR(x.start, x.end)}</b>${x.note ? `<span class="help" style="margin:0">${esc(x.note)}</span>` : ""}${pr ? `<span class="sch-flag">Request waiting</span>` : ""}</div>
        ${past ? "" : `<button class="btn ghost sch-sm" type="button" data-schmine="${esc(date)}|${esc(x.id)}">${pr ? "See Request" : "Swap or Give Away"}</button>`}</div>`; }).join("") : `<span class="sch-off">Off</span>`}</div></div>`;
  }).join("");
  return nextShiftBanner() + `<p class="help" style="margin:8px 2px">Your hours: <b>${fHrs(total)}</b> this week · <b>${fHrs(myHours(monthFirst(addD(sch.start, 3)), addD(shiftMonth(monthFirst(addD(sch.start, 3)), 1), -1)))}</b> in ${monthName(addD(sch.start, 3))}. Only you can see your hours. Use the arrows above to look at other weeks.</p>` + rows;
}

function viewTeam(){
  const tg = `<div class="sch-tog"><button type="button" data-tmode="month" aria-pressed="${sch.tmode === "month"}">Month</button><button type="button" data-tmode="week" aria-pressed="${sch.tmode === "week"}">Week</button></div>`;
  return tg + (sch.tmode === "month" ? monthCal() : weekCal());
}
function monthCal(){
  const d = sch.data, mgr = schIsMgr(), me = d.me.id, t = schToday(), first = sch.month, mi = spd(first).getMonth();
  const start = wkStart(first), last = addD(shiftMonth(first, 1), -1), weeks = Math.ceil(((spd(last) - spd(start)) / 86400000 + 1) / 7);
  const bub = s => `<span class="sch-bub m${pendingFor(s.id) ? " pend" : ""}${s.who === me ? " me" : ""}${!s.who ? " open" : ""}" data-sid="${esc(s.id)}" style="background:${empColor(s.who)}"><b>${esc(firstName(s.who ? schName(s.who) : "Open"))}</b><span>${fRs(s.start, s.end)}</span></span>`;
  const cells = []; const tot = {};
  for(let i = 0; i < weeks * 7; i++){
    const date = addD(start, i), inM = spd(date).getMonth() === mi, list = schShifts(date), dayL = list.filter(s => !isNight(s)), nightL = list.filter(isNight);
    if(inM) list.forEach(s => { if(s.who) tot[s.who] = (tot[s.who] || 0) + hrs(s.start, s.end); });
    cells.push(`<div class="sm-cell${inM ? "" : " other"}${date === t ? " today" : ""}${date < t ? " past" : ""}${mgr ? " edit" : ""}" data-d="${date}"><span class="sm-n">${spd(date).getDate()}</span>${dayL.map(bub).join("")}${dayL.length && nightL.length ? '<i class="sm-div"></i>' : ""}${nightL.map(bub).join("")}</div>`);
  }
  const people = d.team.filter(p => !p.hidden || tot[p.id]).sort((a, b) => (b.id === me) - (a.id === me));
  const legend = people.map(p => `<span class="sch-key"><i style="background:${empColor(p.id)}"></i>${esc(p.name)}${p.id === me ? " (You)" : ""}</span>`).join("")
    + `<span class="sch-key"><i style="background:${empColor("")}"></i>Open Shift</span><span class="sch-key"><i class="pendkey"></i>Request Waiting</span>`;
  return `<p class="help" style="margin:4px 2px 8px">${mgr ? "Tap a day to add a shift. Tap a shift to change it, give it to someone else, or remove it." : "Tap your own shift to swap or give it away. Tap a coworker's shift to ask to swap. Tap an open shift to take it."}</p>
    <div class="sm-head">${SCH_DOW.map(x => `<span>${x}</span>`).join("")}</div><div class="sm-grid">${cells.join("")}</div>
    <p class="help" style="margin:8px 2px 0">Your hours in ${monthName(first)}: <b>${fHrs(myHours(first, last))}</b>. Only you can see your own hours.</p>
    <p class="help" style="margin:4px 2px 0">In each day, day shifts are first and night shifts are below the line (night starts at ${esc(fT(nightFrom()))}).</p>
    <div class="sch-legend">${legend}</div>`;
}
function weekCal(){
  const d = sch.data, mgr = schIsMgr(), me = d.me.id, t = schToday(), days = schDays();
  const head = days.map(x => `<th class="${x === t ? "today" : ""}">${SCH_DOW[spd(x).getDay()]}<small>${spd(x).getDate()}</small></th>`).join("");
  const bubble = s => { const nm = s.who ? schName(s.who) : "Open";
    return `<span class="sch-bub${pendingFor(s.id) ? " pend" : ""}${s.who === me ? " me" : ""}${!s.who ? " open" : ""}" data-sid="${esc(s.id)}" style="background:${empColor(s.who)}"><b>${esc(firstName(nm))}</b><span>${fRs(s.start, s.end)}${s.note ? " •" : ""}</span></span>`; };
  const row = (half, label) => `<tr><th class="sch-nm sch-half">${label}</th>${days.map(x => {
    const list = schShifts(x).filter(s => (half === "night") === isNight(s));
    return `<td data-d="${x}" data-half="${half}" class="${x === t ? "today" : ""}${x < t ? " pastcol" : ""}${mgr ? " edit" : ""}">${list.map(bubble).join("")}${mgr ? `<span class="sch-plus">+</span>` : ""}</td>`; }).join("")}</tr>`;
  const tot = {}; days.forEach(x => schShifts(x).forEach(s => { if(s.who) tot[s.who] = (tot[s.who] || 0) + hrs(s.start, s.end); }));
  const known = new Set(d.team.map(p => p.id));
  const people = d.team.filter(p => !p.hidden || tot[p.id]).sort((a, b) => (b.id === me) - (a.id === me));
  const legend = people.map(p => `<span class="sch-key"><i style="background:${empColor(p.id)}"></i>${esc(p.name)}${p.id === me ? " (You)" : ""}</span>`).join("")
    + (days.some(x => schShifts(x).some(s => !s.who)) ? `<span class="sch-key"><i style="background:${empColor("")}"></i>Open Shift</span>` : "")
    + `<span class="sch-key"><i class="pendkey"></i>Request Waiting</span>`;
  return `<p class="help" style="margin:4px 2px 8px">${mgr ? "Tap a box to add a shift. Tap a shift to change it, give it to someone else, or remove it." : "Tap your own shift to swap or give it away. Tap a coworker's shift to ask to swap. Tap an open shift to take it."}</p>
    <div class="sch-wrap"><table class="sch-tbl sch-cal"><thead><tr><th class="sch-nm"></th>${head}</tr></thead><tbody>${row("day", "Day")}${row("night", "Night")}</tbody></table></div>
    <p class="help" style="margin:8px 2px 0">Your hours this week: <b>${fHrs(myHours(days[0], days[6]))}</b>. Only you can see your own hours.</p>
    <p class="help" style="margin:4px 2px 0">Day shifts start before ${esc(fT(nightFrom()))}. Night shifts start at ${esc(fT(nightFrom()))} or later.</p>
    <div class="sch-legend">${legend}</div>`;
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
  const presets = sch.draft.map((p, i) => `<div class="card sch-pr" data-pi="${i}"><div class="sch-prt"><input data-pf="name" value="${esc(p.name)}" maxlength="24" placeholder="Name (Example: Open)" aria-label="Shift name"><button type="button" class="btn ghost rm-site sch-sm" data-prm="${i}">Remove</button></div>
      <div class="sch-prt"><label class="help" style="margin:0">From<input type="time" data-pf="start" value="${esc(p.start)}"></label><label class="help" style="margin:0">To<input type="time" data-pf="end" value="${esc(p.end)}"></label></div>
      <div class="sch-cols">${SCH_COLORS.map(c => `<button type="button" class="sch-col${c === p.color ? " on" : ""}" style="background:${c}" data-pcol="${c}" aria-label="Color"></button>`).join("")}</div></div>`).join("");
  const people = d.team.map(p => `<li><span><span class="nm">${esc(p.name)}</span><span class="st${p.hidden ? "" : " on"}">${p.hidden ? "Not on the schedule" : "On the schedule"}</span></span><button class="sw sch-sw" role="switch" aria-checked="${!p.hidden}" aria-label="${esc(p.name)} on the schedule" data-schhide="${esc(p.id)}"></button></li>`).join("");
  return `<h3 class="grp">Shift Presets</h3><p class="help">These are the one-tap buttons you use to add a shift. Tap Remove to delete one, tap + Add a Preset for a new one, or change a name or time and tap Save Presets. Shifts already on the calendar are not changed.</p>${presets}
    <button class="btn ghost" type="button" id="sch-padd">+ Add a Preset</button><button class="btn" type="button" id="sch-psave">Save Presets</button>
    <h3 class="grp">Swaps</h3>
    <ul class="sw-list"><li><span><span class="nm">I Approve Swaps First</span><span class="st${d.settings.approval ? " on" : ""}">${d.settings.approval ? "On: swaps wait for your OK" : "Off: swaps happen right away"}</span></span><button class="sw sch-sw" role="switch" aria-checked="${d.settings.approval}" aria-label="Approve swaps first" id="sch-appr"></button></li></ul>
    <h3 class="grp">People on the Schedule</h3><p class="help">Everyone on your paper calendar goes here. They don't need a PIN to be on the schedule. To let someone look at their own shifts and ask for swaps, add them in the Staff tab with a PIN, then pick their login here.</p>
    ${d.settings.people.map(pe => `<div class="card sch-pr sch-pp" data-pid="${esc(pe.id)}"><div class="sch-prt"><input data-ppf="name" value="${esc(pe.name)}" maxlength="30" aria-label="Name"><button type="button" class="btn ghost rm-site sch-sm" data-pdel="${esc(pe.id)}">Remove</button></div>
      <label class="help" style="margin:0">Their Login<select data-ppf="staffId"><option value="">No Login Yet</option>${(d.staff || []).map(m => `<option value="${esc(m.id)}"${m.id === pe.staffId ? " selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label>
      <button type="button" class="btn ghost sch-sm" data-ppsave="${esc(pe.id)}" style="justify-self:start">Save</button></div>`).join("")}
    <div class="card sp-card"><input id="sch-pnew" maxlength="30" placeholder="New Person's Name (Example: Gayle)" aria-label="New person's name"><button class="btn" type="button" id="sch-pnadd">+ Add a Person</button></div>
    <h3 class="grp">Employee Colors</h3><p class="help">Each person's shifts show in their color on the calendar.</p>
    ${d.team.map(p => `<div class="card sch-pr"><b>${esc(p.name)}</b><div class="sch-cols">${SCH_PAL.map(c => `<button type="button" class="sch-col${c === empColor(p.id) ? " on" : ""}" style="background:${c}" data-ecol="${esc(p.id)}|${c}" aria-label="Color"></button>`).join("")}</div></div>`).join("")}
    <h3 class="grp">Day and Night</h3>
    <div class="card sp-card"><label class="help" for="sch-night" style="margin:0">Night Shifts Start At (Or Later)</label><input id="sch-night" type="time" value="${esc(nightFrom())}"><span class="help" style="margin:0">Shifts that start before this time show on the Day row of the calendar.</span><button class="btn ghost" type="button" id="sch-nsave">Save</button></div>
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
const presetBtns = (attr, small) => sch.data.presets.map(p => `<button type="button" class="sch-pbtn" ${attr}="${esc(p.id)}"><b>${esc(p.name || "Shift")}</b><span>${fRs(p.start, p.end)}</span></button>`).join("");

function schCell(date, half){           // owner: one half of a day
  const list = schShifts(date).filter(s => !half || (half === "night") === isNight(s));
  const people = sch.data.team.filter(p => !p.hidden);
  sch.ed = { date, half, who: sch.lastWho !== undefined && people.some(p => p.id === sch.lastWho) ? sch.lastWho : null };
  schOpen(`<h3 class="sch-h">${esc(fDay(date))}${half ? " · " + (half === "night" ? "Night" : "Day") : ""}</h3>
    ${list.map(s => `<div class="sch-ex"><span class="sch-chip" style="background:${empColor(s.who)}">${esc(firstName(s.who ? schName(s.who) : "Open"))} · ${fRs(s.start, s.end)}</span><span class="help" style="margin:0">${esc(s.note || "")}</span><button type="button" class="btn ghost sch-sm" data-sched="${esc(s.id)}">Change</button></div>`).join("")}
    <p class="help" style="margin:10px 0 6px">1. Tap who works:</p><div class="sch-people">${people.map(p => `<button type="button" class="sch-pick" data-pick="${esc(p.id)}" style="--c:${empColor(p.id)}">${esc(firstName(p.name))}</button>`).join("")}<button type="button" class="sch-pick" data-pick="" style="--c:${empColor("")}">Open Shift</button></div>
    <p class="help" style="margin:10px 0 6px">2. Tap the shift:</p><div class="sch-pgrid">${presetBtns("data-addp")}</div>
    <details class="sch-cust"><summary>Other Time</summary><div class="sch-prt"><label class="help" style="margin:0">From<input type="time" id="sch-c-s" value="09:00"></label><label class="help" style="margin:0">To<input type="time" id="sch-c-e" value="17:00"></label></div>
    <input id="sch-c-n" maxlength="60" placeholder="Note (Optional)" aria-label="Note"><button type="button" class="btn" id="sch-c-add">Add This Shift</button>
      <input id="sch-c-pn" maxlength="24" placeholder="Preset Name (To Save This Time)" aria-label="Preset name"><button type="button" class="btn ghost" id="sch-c-sp">Save This Time as a Preset</button></details>
    <button type="button" class="btn ghost" data-gosetup>Add or Remove Presets</button>
    <button type="button" class="btn ghost" data-schclose>Close</button>`);
  schPaint();
}
function schPaint(){ if(!sch.ed || sch.ed.who === undefined) return; const w = sch.ed.who;
  schBox().querySelectorAll("[data-pick]").forEach(b => b.classList.toggle("on", w !== null && b.dataset.pick === w));
  schBox().style.setProperty("--pc", w === null ? "#6F6259" : empColor(w)); }
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
const schNav = n => { if(sch.view === "team" && sch.tmode === "month") sch.month = shiftMonth(sch.month, n); else sch.start = addD(sch.start, 7 * n); loadSchedule(); };
$("#sch-prev").onclick = () => schNav(-1);
$("#sch-next").onclick = () => schNav(1);
$("#sch-today").onclick = () => { if(sch.view === "team" && sch.tmode === "month") sch.month = monthFirst(schToday()); else sch.start = wkStart(schToday()); loadSchedule(); };
$("#sch-modal").addEventListener("click", e => { if(e.target.id === "sch-modal") schClose(); });
document.addEventListener("keydown", e => { if(e.key === "Escape" && !$("#sch-modal").hidden) schClose(); });

document.addEventListener("click", async e => {
  const el = e.target; if(!el.closest) return;
  const v = el.closest("[data-schview]"); if(v){ sch.view = v.dataset.schview; if(sch.view === "setup") sch.draft = null; loadSchedule(); return; }
  const tm = el.closest("[data-tmode]"); if(tm){ sch.tmode = tm.dataset.tmode; if(sch.tmode === "week"){ const t = schToday(); sch.start = monthFirst(t) === sch.month ? wkStart(t) : wkStart(sch.month); } else sch.month = monthFirst(sch.start); loadSchedule(); return; }
  if(el.closest("[data-gosetup]")){ schClose(); sch.view = "setup"; sch.draft = null; loadSchedule(); return; }
  if(el.closest("[data-schclose]")){ schClose(); return; }
  const td = el.closest(".sch-tbl td[data-d], .sm-cell[data-d]");
  if(td && sch.data && !el.closest("#sch-modal")){
    const date = td.dataset.d, chip = el.closest(".sch-bub"), sid = chip && chip.dataset.sid;
    if(schIsMgr()){ if(sid) schEdit(date, sid); else schCell(date, td.dataset.half || null); return; }
    if(!sid || date < schToday()) return;
    const s = schShifts(date).find(x => x.id === sid);
    if(s && s.who === sch.data.me.id) schMine(date, sid); else schOther(date, sid);
    return;
  }
  const mine = el.closest("[data-schmine]"); if(mine){ const [d, s] = mine.dataset.schmine.split("|"); schMine(d, s); return; }
  const ed = el.closest("[data-sched]"); if(ed){ schEdit(sch.ed.date, ed.dataset.sched); return; }
  const pk = el.closest("[data-pick]"); if(pk && sch.ed){ sch.ed.who = pk.dataset.pick; sch.lastWho = sch.ed.who; schPaint(); return; }
  const ap = el.closest("[data-addp]");
  if(ap && sch.ed){ if(sch.ed.who === null){ toast("Tap who works first.", true); return; } const p = sch.data.presets.find(x => x.id === ap.dataset.addp); await schDo({ action: "save", date: sch.ed.date, who: sch.ed.who, start: p.start, end: p.end, note: "" }, `${p.name || "Shift"} added for ${sch.ed.who ? schName(sch.ed.who) : "Open Shift"}`); return; }
  if(el.closest("#sch-c-add") && sch.ed){ if(sch.ed.who === null){ toast("Tap who works first.", true); return; } const s = $("#sch-c-s").value, en = $("#sch-c-e").value; await schDo({ action: "save", date: sch.ed.date, who: sch.ed.who, start: s, end: en, note: $("#sch-c-n").value }, "Shift added"); return; }
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
  const pr = el.closest("[data-prm]");
  if(pr){ const i = +pr.dataset.prm, nm = sch.draft[i].name || "this"; if(!(await askYes(`Remove the "${nm}" preset? Shifts already on the calendar stay.`, "Remove It", true))) return;
    const list = sch.draft.filter((_, k) => k !== i); if(await schDo({ action: "presets", presets: list }, "Preset removed", true)){ sch.draft = null; renderSchedule(); } return; }
  if(el.closest("#sch-padd")){ const list = [...sch.draft, { id: "", name: "New Shift", start: "09:00", end: "17:00", color: SCH_COLORS[sch.draft.length % SCH_COLORS.length] }];
    if(await schDo({ action: "presets", presets: list }, "Preset added. Change its name and times, then tap Save Presets.", true)){ sch.draft = null; renderSchedule(); const ins = $$('.sch-pr input[data-pf=name]'); if(ins.length){ const l = ins[ins.length-1]; l.focus(); l.select(); l.scrollIntoView({ block: "center" }); } } return; }
  if(el.closest("#sch-c-sp") && sch.ed){ const ed = sch.ed, nm = $("#sch-c-pn").value.trim(), s = $("#sch-c-s").value, en = $("#sch-c-e").value;
    if(!nm){ toast("Type a name for the preset.", true); return; }
    const list = [...sch.data.presets, { id: "", name: nm, start: s, end: en, color: SCH_COLORS[sch.data.presets.length % SCH_COLORS.length] }];
    if(await schDo({ action: "presets", presets: list }, "Preset saved", true)){ const w = ed.who; schCell(ed.date, ed.half); sch.ed.who = w; schPaint(); } return; }
  if(el.closest("#sch-psave")){ if(await schDo({ action: "presets", presets: sch.draft }, "Presets saved", true)) sch.draft = null, renderSchedule(); return; }
  if(el.closest("#sch-appr")){ await schDo({ action: "settings", approval: !sch.data.settings.approval }, null, true); return; }
  const ec = el.closest("[data-ecol]"); if(ec){ const [id, c] = ec.dataset.ecol.split("|"); await schDo({ action: "settings", colors: { ...(sch.data.settings.colors || {}), [id]: c } }, null, true); return; }
  if(el.closest("#sch-nsave")){ await schDo({ action: "settings", nightFrom: $("#sch-night").value }, "Saved. Day and night updated.", true); return; }
  const hd = el.closest("[data-schhide]"); if(hd){ const id = hd.dataset.schhide, hide = new Set(sch.data.settings.hide); if(hide.has(id)) hide.delete(id); else hide.add(id); await schDo({ action: "settings", hide: [...hide] }, null, true); return; }
  const pps = el.closest("[data-ppsave]");
  if(pps){ const card = pps.closest(".sch-pp"); await schDo({ action: "updatePerson", id: pps.dataset.ppsave, name: card.querySelector('[data-ppf=name]').value, staffId: card.querySelector('[data-ppf=staffId]').value }, "Saved", true); return; }
  const pdl = el.closest("[data-pdel]");
  if(pdl){ const nm = (sch.data.team.find(x => x.id === pdl.dataset.pdel) || {}).name || "this person"; if(await askYes(`Remove ${nm} from the schedule? Their shifts become Open Shifts.`, "Remove", true)) await schDo({ action: "removePerson", id: pdl.dataset.pdel }, "Removed", true); return; }
  if(el.closest("#sch-pnadd")){ const nm = $("#sch-pnew").value.trim(); if(!nm){ toast("Type a name first.", true); return; } await schDo({ action: "addPerson", name: nm }, nm + " added", true); return; }
  if(el.closest("#sch-osave")){ await schDo({ action: "settings", ownerName: $("#sch-oname").value }, "Name saved", true); return; }
  if(el.closest("#sch-copy")){ if(await askYes("Copy last week's shifts into this week? Shifts already here stay.", "Copy")) await schDo({ action: "copyWeek", from: addD(sch.start, -7), to: sch.start }, "Copied last week", true); return; }
  if(el.closest("#sch-clear")){ if(await askYes("Clear every shift this week?", "Clear It", true)) await schDo({ action: "clearWeek", start: sch.start }, "Week cleared", true); return; }
});
document.addEventListener("input", e => {
  const r = e.target.closest && e.target.closest("[data-pi]"); if(!r || !sch.draft || !e.target.dataset.pf) return;
  sch.draft[+r.dataset.pi][e.target.dataset.pf] = e.target.value;
});
