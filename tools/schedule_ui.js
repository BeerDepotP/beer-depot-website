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
const SCH_PAL = ["#E6194B","#F58231","#D9A000","#6BA814","#1E8E3E","#008080","#0097B2","#4363D8","#1B1F6B","#911EB4","#8E7CC3","#D81FD1","#F06292","#800000","#8B5A2B","#808000","#5B6770","#222222","#3FA7E0","#5E2750"];
const colorsUsed = except => new Set(sch.data.team.filter(p => !except.includes(p.id)).map(p => empColor(p.id).toLowerCase()));
function newCol(){ const used = colorsUsed([]); if(sch.newCol && !used.has(sch.newCol.toLowerCase())) return sch.newCol; return SCH_PAL.find(c => !used.has(c.toLowerCase())) || SCH_PAL[0]; }
function empColor(id){ const d = sch.data; if(!id) return "#8C7F74"; const tm = d.team.find(p => p.id === id); if(tm && tm.color) return tm.color; const c = (d.settings.colors || {})[id]; if(c) return c; const i = d.team.findIndex(p => p.id === id); return SCH_PAL[(i < 0 ? 0 : i) % SCH_PAL.length]; }
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
  if(sch.view === "mine") return [wkStart(t), addD(t, 150)];   // everything from this week on (months not confirmed yet never come back for employees)
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
    if(window.pushLogin) pushLogin(sch.data.me.push);
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
  const nav = document.querySelector(".sch-nav"); if(nav) nav.style.display = sch.view === "mine" ? "none" : "";
  const waiting = d.needs + d.offers;
  const pills = [["mine","My Shifts"],["team","Whole Team"],["swaps","Swaps" + (waiting ? " (" + waiting + ")" : "")]];
  if(mgr) pills.push(["setup","Setup"]);
  $("#sch-pills").innerHTML = pills.map(([k,n]) => `<button type="button" class="sch-pill" data-schview="${k}" aria-pressed="${sch.view === k}">${esc(n)}</button>`).join("");
  setSchBadge(waiting);
  $("#sch-body").innerHTML = (mgr ? confirmBar() : "") + ({ mine: viewMine, team: viewTeam, swaps: viewSwaps, setup: viewSetup })[sch.view]();
  selPaint();
}

function pendingInfo(){
  const pe = (sch.data.settings || {}).pending || { who: {}, open: [] }, t = schToday();
  const people = Object.values(pe.who).filter(a => a.some(x => x >= t)).length, open = (pe.open || []).filter(x => x >= t).length;
  return { people, open };
}
const viewMonthOf = () => (sch.view === "team" && sch.tmode === "month" ? sch.month : sch.start).slice(0, 7);
const monthLabel = m => SCH_FULL[spd(m + "-01").getMonth()];
function confirmBar(){
  const { people, open } = pendingInfo(), m = viewMonthOf(), mn = monthLabel(m), now = schToday().slice(0, 7);
  const future = m > now, pub = ((sch.data.settings || {}).published || []).includes(m), hidden = future && !pub;
  const hideBtn = future && pub ? `<button class="btn ghost" type="button" id="sch-hidemonth" data-month="${m}">Hide ${esc(mn)} From Employees</button>` : "";
  const bits = [people ? people + (people === 1 ? " person" : " people") : "", open ? open + (open === 1 ? " open day" : " open days") : ""].filter(Boolean).join(" and ");
  const box = inner => `<div class="card sp-card sch-confirm" style="border:2px solid #F26B1D;margin-bottom:10px">${inner}</div>`;
  if(hidden) return box(`<b>${esc(mn)} Is Hidden From Employees</b><span class="help" style="margin:0">Employees can't see ${esc(mn)} yet and nobody gets alerts while you build it. When it's done, tap Confirm Schedule. ${esc(mn)} shows up for everyone and they all get a "${esc(mn)} schedule is done" alert.${bits ? " Waiting changes in months they can already see (" + bits + ") are sent at the same time." : ""}</span><button class="btn" type="button" id="sch-confirm" data-month="${m}">Confirm ${esc(mn)} Schedule</button>${bits ? `<button class="btn ghost" type="button" id="sch-confirm-no">Don't Send Waiting Alerts</button>` : ""}`);
  if(people || open) return box(`<b>Alerts Are On Hold</b><span class="help" style="margin:0">Nobody has been told yet about your changes (${bits}). Tap Confirm Schedule when you're done and everyone affected gets one alert.</span><button class="btn" type="button" id="sch-confirm" data-month="">Confirm Schedule</button><button class="btn ghost" type="button" id="sch-confirm-no">Don't Send Alerts</button>${hideBtn}`);
  if(sch.view === "team") return `<div class="card sp-card" style="margin-bottom:10px"><b>Everything Is Confirmed</b><span class="help" style="margin:0">Employees can see ${esc(mn)}. Anything you change will wait here for your Confirm Schedule button.</span>${hideBtn}</div>`;
  return "";
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

function viewMine(){   // every shift of mine from the start of this week on, for every month employees can see (confirmed months)
  const d = sch.data, me = d.me.id, t = schToday(), w0 = wkStart(t), m0 = monthFirst(t);
  const dates = Object.keys(d.shifts).sort().filter(date => date >= w0 && d.shifts[date].some(x => x.who === me));
  let last = "";
  const rows = dates.map(date => {
    const mine = schShifts(date).filter(x => x.who === me), past = date < t, mo = date.slice(0, 7);
    const head = mo !== last ? `<h3 class="grp" style="margin:14px 2px 4px">${monthName(date)} ${spd(date).getFullYear()}</h3>` : ""; last = mo;
    return head + `<div class="sch-day${date === t ? " today" : ""}${past ? " past" : ""}"><div class="sch-dl"><b>${SCH_DOW[spd(date).getDay()]}</b><span>${SCH_MON[spd(date).getMonth()]} ${spd(date).getDate()}</span></div>
      <div class="sch-dr">${mine.map(x => { const pr = pendingFor(x.id);
        return `<div class="sch-mine" style="border-left-color:${empColor(me)}"><div><b>${fR(x.start, x.end)}</b>${x.note ? `<span class="help" style="margin:0">${esc(x.note)}</span>` : ""}${pr ? `<span class="sch-flag">Request waiting</span>` : ""}</div>
        ${past ? "" : `<button class="btn ghost sch-sm" type="button" data-schmine="${esc(date)}|${esc(x.id)}">${pr ? "See Request" : "Swap or Give Away"}</button>`}</div>`; }).join("")}</div></div>`;
  }).join("");
  return nextShiftBanner() + `<p class="help" style="margin:8px 2px">Your hours: <b>${fHrs(myHours(w0, addD(w0, 6)))}</b> this week · <b>${fHrs(myHours(m0, addD(shiftMonth(m0, 1), -1)))}</b> in ${monthName(m0)}. Only you can see your hours.</p>`
    + (rows || `<p class="help" style="margin:10px 2px">You have no shifts on the schedule yet. Shifts show up here once the owner confirms the month.</p>`)
    + `<p class="help" style="margin:12px 2px 0">This list shows every month the owner has confirmed.</p>`;
}

function viewTeam(){
  const tg = `<div class="sch-tog"><button type="button" data-tmode="month" aria-pressed="${sch.tmode === "month"}">Month</button><button type="button" data-tmode="week" aria-pressed="${sch.tmode === "week"}">Week</button></div>`;
  const sel = schIsMgr() && sch.tmode === "month" ? `<div class="sch-tog sch-seltog"><button type="button" data-seltog aria-pressed="${selS().mode}">${selS().mode ? "Done Selecting" : "Select Days"}</button></div>` : "";
  return `<div class="sch-togrow">${tg}${sel}</div>` + (sch.tmode === "month" ? monthCal() : weekCal());
}
function monthCal(){
  const d = sch.data, mgr = schIsMgr(), me = d.me.id, t = schToday(), first = sch.month, mi = spd(first).getMonth();
  const start = wkStart(first), last = addD(shiftMonth(first, 1), -1), weeks = Math.ceil(((spd(last) - spd(start)) / 86400000 + 1) / 7);
  const bub = s => `<span class="sch-bub m${pendingFor(s.id) ? " pend" : ""}${s.who === me ? " me" : ""}${!s.who ? " open" : ""}" data-sid="${esc(s.id)}" style="background:${empColor(s.who)}"><b>${esc(firstName(s.who ? schName(s.who) : "Open"))}</b><span>${fRs(s.start, s.end)}</span></span>`;
  const SEL = selS(); if(SEL.forMonth !== sch.month){ SEL.dates.clear(); SEL.forMonth = sch.month; }
  const cells = []; const tot = {};
  for(let i = 0; i < weeks * 7; i++){
    const date = addD(start, i), inM = spd(date).getMonth() === mi, list = schShifts(date), dayL = list.filter(s => !isNight(s)), nightL = list.filter(isNight);
    if(inM) list.forEach(s => { if(s.who) tot[s.who] = (tot[s.who] || 0) + hrs(s.start, s.end); });
    cells.push(`<div class="sm-cell${SEL.dates.has(date) ? " picked" : ""}${inM ? "" : " other"}${date === t ? " today" : ""}${date < t ? " past" : ""}${mgr ? " edit" : ""}" data-d="${date}"><span class="sm-n">${spd(date).getDate()}</span>${mgr && !SEL.mode ? `<button type="button" class="sm-plus" data-addday="${date}" aria-label="Add a shift">+</button>` : ""}${dayL.map(bub).join("")}${dayL.length && nightL.length ? '<i class="sm-div"></i>' : ""}${nightL.map(bub).join("")}</div>`);
  }
  const people = d.team.filter(p => !p.hidden || tot[p.id]).sort((a, b) => (b.id === me) - (a.id === me));
  const legend = people.map(p => `<span class="sch-key"><i style="background:${empColor(p.id)}"></i>${esc(p.name)}${p.id === me ? " (You)" : ""}</span>`).join("")
    + `<span class="sch-key"><i style="background:${empColor("")}"></i>Open Shift</span><span class="sch-key"><i class="pendkey"></i>Request Waiting</span>`;
  const selHelp = mgr ? (SEL.mode ? `<p class="help" style="margin:0 2px 8px"><b>Select Days is on.</b> Tap days one at a time, or touch and hold a day, then drag across the days you want (side to side and up and down). A quick swipe still scrolls the page. When you let go after dragging, pick who and the shift. On a computer you can also click a day, then hold Shift and click another day.</p>` : `<p class="help" style="margin:0 2px 8px">Tap a day to add a shift. Tap a shift to change it, give it to someone else, or remove it. To do many days at once, tap Select Days (on a computer, click a day then Shift+click another).</p>`) : "";
  return `${selHelp}${mgr ? "" : `<p class="help" style="margin:4px 2px 8px">Tap your own shift to swap or give it away. Tap a coworker's shift to ask to swap. Tap an open shift to take it.</p>`}
    <div class="sm-head">${SCH_DOW.map(x => `<span>${x}</span>`).join("")}</div><div class="sm-grid${SEL.mode ? " selmode" : ""}">${cells.join("")}</div>
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
  const okNeeded = d.me.owner ? live.filter(r => r.status === "approve") : [];
  const offered = live.filter(r => r.status === "open" && r.by !== me);
  const openShifts = [];
  Object.keys(d.shifts).sort().forEach(date => { if(date >= t) d.shifts[date].filter(s => !s.who && !d.requests.some(r => schActive(r) && r.kind === "claim" && r.shiftId === s.id)).forEach(s => openShifts.push({ date, s })); });
  const mineR = live.filter(r => r.by === me || r.taker === me).filter(r => !youAnswer.includes(r) && !okNeeded.includes(r));
  const recent = d.requests.filter(r => !schActive(r)).slice(0, 8);
  const sec = (title, html, empty) => `<h3 class="grp">${title}</h3>${html || `<p class="help">${empty}</p>`}`;
  return sec("Waiting For Your Answer", youAnswer.map(r => reqCard(r, B("yes", "Yes, Swap", "") + B("no", "No Thanks", "ghost"))).join(""), "Nothing waiting on you.")
    + (d.me.owner ? sec("Needs Your OK", okNeeded.map(r => reqCard(r, B("approve", "OK It", "") + B("deny", "Say No", "ghost"))).join(""), "Nothing to approve.") : "")
    + sec("Shifts Offered", offered.map(r => reqCard(r, B("take", "Take This Shift", ""))).join(""), "Nobody is giving a shift away right now.")
    + sec("Open Shifts", openShifts.map(({ date, s }) => `<div class="card sch-req"><b>${fDay(date)} · ${fR(s.start, s.end)}</b>${s.note ? `<span class="help" style="margin:0">${esc(s.note)}</span>` : ""}<div class="sch-btns"><button type="button" class="btn sch-sm" data-schopen="${esc(date)}|${esc(s.id)}">I'll Take It</button></div></div>`).join(""), "No open shifts.")
    + sec("Your Requests", mineR.map(r => reqCard(r, B("cancel", "Cancel Request", "ghost"))).join(""), "You haven't asked for anything.")
    + (recent.length ? sec("Recently Finished", recent.map(r => reqCard(r, "")).join("")) : "");
}

function alertsBlock(){
  const d = sch.data, n = d.settings.notify, meta = d.alerts || {};
  if(!n) return "";
  const rows = Object.keys(meta).map(k => { const m = meta[k], c = n.kinds[k] || {}; return `<div class="card sch-pr sch-al" data-alk="${k}"><div class="sch-prt"><span><b>${esc(m.label)}</b><br><span class="help" style="margin:0">Goes to: ${esc(m.who)}</span></span><button type="button" class="sw sch-sw" role="switch" aria-checked="${c.on !== false}" aria-label="${esc(m.label)} alert" data-alsw="${k}"></button></div>
      <label class="help" style="margin:0;display:grid;gap:4px">Title<input style="width:100%;box-sizing:border-box;border:1.5px solid #E0D4C8;border-radius:10px;padding:10px;font:inherit;background:#fff;color:#22160F" data-alf="title" maxlength="80" value="${esc(c.title || m.title)}"></label>
      <label class="help" style="margin:0;display:grid;gap:4px">Message<input style="width:100%;box-sizing:border-box;border:1.5px solid #E0D4C8;border-radius:10px;padding:10px;font:inherit;background:#fff;color:#22160F" data-alf="body" maxlength="200" value="${esc(c.body || m.body)}"></label></div>`; }).join("");
  return `<h3 class="grp">Phone Alerts</h3>
    <p class="help">Alerts pop up on an employee's phone once they tap Turn On Notifications at the top of this tab. Switch any alert off, or change its wording. You can use {who} (the person), {shift} (the day and time), {other} (the other shift in a swap) and {answer} (yes or no).</p>
    <div class="card sp-card"><div class="sch-prt"><span><b>Hold Schedule Alerts Until I Confirm</b><br><span class="help" style="margin:0">When you add, change or remove shifts, nobody is told until you tap Confirm Schedule. Swaps and give-aways still alert right away.</span></span><button type="button" class="sw sch-sw" role="switch" aria-checked="${n.hold !== false}" aria-label="Hold schedule alerts until I confirm" data-alsw="hold"></button></div></div>
    <div class="card sp-card"><div class="sch-prt"><b>All Phone Alerts</b><button type="button" class="sw sch-sw" role="switch" aria-checked="${n.on !== false}" aria-label="All phone alerts" data-alsw="all"></button></div></div>
    ${rows}
    <button class="btn" type="button" id="sch-alsave">Save Alert Wording</button>
    <button class="btn ghost" type="button" id="sch-alreset">Back to Standard Wording</button>
    <button class="btn ghost" type="button" id="sch-altest">Send Me a Test Alert</button>`;
}
function alertsRead(){
  const hs = document.querySelector('[data-alsw=hold]');
  const out = { hold: hs ? hs.getAttribute("aria-checked") === "true" : true, on: (document.querySelector('[data-alsw=all]') || {}).getAttribute ? document.querySelector('[data-alsw=all]').getAttribute("aria-checked") === "true" : true, kinds: {} };
  document.querySelectorAll(".sch-al").forEach(card => { const k = card.dataset.alk; out.kinds[k] = { on: card.querySelector("[data-alsw]").getAttribute("aria-checked") === "true", title: card.querySelector("[data-alf=title]").value, body: card.querySelector("[data-alf=body]").value }; });
  return out;
}
function viewSetup(){
  const d = sch.data;
  if(!sch.draft) sch.draft = d.presets.map(p => ({ ...p }));
  const presets = sch.draft.map((p, i) => `<div class="card sch-pr" data-pi="${i}"><div class="sch-prt"><input data-pf="name" value="${esc(p.name)}" maxlength="24" placeholder="Name (Example: Open)" aria-label="Shift name"><button type="button" class="btn ghost rm-site sch-sm" data-prm="${i}">Remove</button></div>
      <div class="sch-prt"><label class="help" style="margin:0">From<input type="time" data-pf="start" value="${esc(p.start)}"></label><label class="help" style="margin:0">To<input type="time" data-pf="end" value="${esc(p.end)}"></label></div>
      <div class="sch-cols">${SCH_COLORS.map(c => `<button type="button" class="sch-col${c === p.color ? " on" : ""}" style="background:${c}" data-pcol="${c}" aria-label="Color"></button>`).join("")}</div></div>`).join("");
  const people = d.team.map(p => `<li><span><span class="nm">${esc(p.name)}</span><span class="st${p.hidden ? "" : " on"}">${p.hidden ? "Not on the schedule" : "On the schedule"}</span></span><button class="sw sch-sw" role="switch" aria-checked="${!p.hidden}" aria-label="${esc(p.name)} on the schedule" data-schhide="${esc(p.id)}"></button></li>`).join("");
  const ownerP = d.me.owner;
  return `<h3 class="grp">Shift Presets</h3>${!ownerP ? `<p class="help">Only the owner can add or remove shift presets.</p>` : `<p class="help">These are the one-tap buttons you use to add a shift. Tap Remove to delete one, tap + Add a Preset for a new one, or change a name or time and tap Save Presets. Shifts already on the calendar are not changed.</p>${presets}
    <button class="btn ghost" type="button" id="sch-padd">+ Add a Preset</button><button class="btn" type="button" id="sch-psave">Save Presets</button>`}
    <h3 class="grp">Swaps</h3>
    <p class="help">Swaps happen as soon as both people agree, and anyone can take an Open Shift. If an employee gives a shift away and a coworker takes it, that waits for your OK (only the owner can OK it).</p>
    ${alertsBlock()}
    <h3 class="grp">People on the Schedule</h3><p class="help">Everyone on your paper calendar goes here. They don't need a PIN to be on the schedule. To let someone look at their own shifts and ask for swaps, add them in the Staff tab with a PIN, then pick their login here.</p>
    ${d.settings.people.map(pe => `<div class="card sch-pr sch-pp" data-pid="${esc(pe.id)}"><div class="sch-prt"><input data-ppf="name" value="${esc(pe.name)}" maxlength="30" aria-label="Name"><button type="button" class="btn ghost rm-site sch-sm" data-pdel="${esc(pe.id)}">Remove</button></div>
      <label class="help" style="margin:0">Email (Optional, For Swap Alerts)<input type="email" data-ppf="email" value="${esc(pe.email || "")}" maxlength="80" placeholder="name@example.com"></label>
      <label class="help" style="margin:0">Their Login<select data-ppf="staffId"><option value="">No Login Yet</option>${(d.staff || []).map(m => `<option value="${esc(m.id)}"${m.id === pe.staffId ? " selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label>
      <button type="button" class="btn ghost sch-sm" data-ppsave="${esc(pe.id)}" style="justify-self:start">Save</button></div>`).join("")}
    <div class="card sp-card"><input id="sch-pnew" maxlength="30" placeholder="New Person's Name (Example: Gayle)" aria-label="New person's name"><p class="help" style="margin:6px 0">Pick a color:</p><div class="sch-cols">${SCH_PAL.map(c => `<button type="button" class="sch-col${c === newCol() ? " on" : ""}${colorsUsed([]).has(c.toLowerCase()) ? " off" : ""}"${colorsUsed([]).has(c.toLowerCase()) ? " disabled" : ""} style="background:${c}" data-ncol="${c}" aria-label="Color"></button>`).join("")}</div><button class="btn" type="button" id="sch-pnadd">+ Add a Person</button></div>
    <h3 class="grp">Employee Colors</h3><p class="help">Each person's shifts show in their color on the calendar.</p>
    ${d.team.map(p => `<div class="card sch-pr"><b>${esc(p.name)}</b>${p.color ? `<span class="help" style="margin:0">Color is set in the Staff tab (owner).</span>` : ""}<div class="sch-cols"${p.color ? " hidden" : ""}>${SCH_PAL.map(c => `<button type="button" class="sch-col${c === empColor(p.id) ? " on" : ""}${colorsUsed([p.id]).has(c.toLowerCase()) ? " off" : ""}"${colorsUsed([p.id]).has(c.toLowerCase()) ? " disabled" : ""} style="background:${c}" data-ecol="${esc(p.id)}|${c}" aria-label="Color"></button>`).join("")}</div></div>`).join("")}
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
      ${sch.data.me.owner ? `<input id="sch-c-pn" maxlength="24" placeholder="Preset Name (To Save This Time)" aria-label="Preset name"><button type="button" class="btn ghost" id="sch-c-sp">Save This Time as a Preset</button>` : ""}</details>
    ${sch.data.me.owner ? `<button type="button" class="btn ghost" data-gosetup>Add or Remove Presets</button>` : ""}
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
  sch.ed = { date, sid };
  schOpen(`<h3 class="sch-h">${esc(fDay(date))} · ${esc(fR(s.start, s.end))}</h3>
    <input id="sch-m-n" maxlength="80" placeholder="Note (Optional, Example: Doctor Appointment)" aria-label="Note">
    <button type="button" class="btn" id="sch-m-swap">Swap With a Coworker</button><p class="help" style="margin:4px 2px 0">You pick their shift on the calendar. They get a message to say yes or no.</p>
    <button type="button" class="btn ghost" id="sch-m-give">Give Away This Shift</button><p class="help" style="margin:4px 2px 0">Everyone can see it and anyone can take it.</p>
    <button type="button" class="btn ghost" data-schclose>Close</button>`);
}
/* the "pick their shift" calendar: this month and next month */
function pickCanTap(s, date){ const d = sch.data, me = d.me.id, t = schToday(); return !!s.who && s.who !== me && (date > t || (date === t && s.end > schNow())) && !pendingFor(s.id); }
function pickMonth(first){
  const d = sch.data, me = d.me.id, mi = spd(first).getMonth(), start = wkStart(first), last = addD(shiftMonth(first, 1), -1), weeks = Math.ceil(((spd(last) - spd(start)) / 86400000 + 1) / 7), mine = sch.ed;
  let cells = "";
  for(let i = 0; i < weeks * 7; i++){
    const date = addD(start, i), inM = spd(date).getMonth() === mi;
    const list = inM ? schShifts(date) : [], dayL = list.filter(s => !isNight(s)), nightL = list.filter(isNight);
    const bub = s => { const ok = pickCanTap(s, date), isMine = mine && date === mine.date && s.id === mine.sid;
      return `<span class="sch-bub m${ok ? " pickable" : " dim"}${isMine ? " sel" : ""}${!s.who ? " open" : ""}" ${ok ? `data-pshift="${esc(date)}|${esc(s.id)}"` : ""} style="background:${empColor(s.who)}"><b>${esc(isMine ? "YOU" : firstName(s.who ? schName(s.who) : "Open"))}</b><span>${fRs(s.start, s.end)}</span></span>`; };
    cells += `<div class="sm-cell${inM ? "" : " other"}${date === schToday() ? " today" : ""}"><span class="sm-n">${inM ? spd(date).getDate() : ""}</span>${dayL.map(bub).join("")}${dayL.length && nightL.length ? '<i class="sm-div"></i>' : ""}${nightL.map(bub).join("")}</div>`;
  }
  return `<h3 class="sch-pm">${SCH_FULL[mi]} ${spd(first).getFullYear()}</h3><div class="sm-head">${SCH_DOW.map(x => `<span>${x}</span>`).join("")}</div><div class="sm-grid">${cells}</div>`;
}
async function schPick(){
  const ed = sch.ed; if(!ed || !ed.sid) return;
  const s = schShifts(ed.date).find(x => x.id === ed.sid); if(!s) return;
  sch.pick = { date: ed.date, sid: ed.sid, note: ($("#sch-m-n") || {}).value || "" };
  const t = schToday(), m1 = monthFirst(t), m2 = shiftMonth(m1, 1);
  try{ const j = await api("/api/schedule", { action: "get", from: m1, to: addD(shiftMonth(m2, 1), -1) }); Object.assign(sch.data.shifts, j.shifts); sch.data.requests = j.requests; }
  catch(err){ toast(err.message, true); return; }
  schClose(); sch.ed = { date: sch.pick.date, sid: sch.pick.sid };
  $("#sch-pick-sub").innerHTML = `Swapping your <b>${esc(fDay(sch.pick.date))} · ${esc(fR(s.start, s.end))}</b>.<br>Tap the shift you want. It must be another employee's shift.`;
  $("#sch-pick-body").innerHTML = pickMonth(m1) + pickMonth(m2) + `<p class="help" style="margin:10px 2px 0">Shifts that are faded can't be picked (your own, open shifts, shifts that already passed, or shifts with a request waiting).</p>`;
  $("#sch-pick").hidden = false; $("#sch-pick").scrollTop = 0;
}
function schPickClose(){ $("#sch-pick").hidden = true; sch.pick = null; }

function schOther(date, sid){           // employee: a coworker's or an open shift
  const s = schShifts(date).find(x => x.id === sid); if(!s) return;
  if(!s.who){
    schOpen(`<h3 class="sch-h">Open Shift</h3><p class="sch-p"><b>${esc(fDay(date))}</b><br>${esc(fR(s.start, s.end))}${s.note ? "<br>" + esc(s.note) : ""}</p>
      <button type="button" class="btn" data-schopen="${esc(date)}|${esc(sid)}">I'll Take It</button><button type="button" class="btn ghost" data-schclose>Close</button>`); return; }
  const mine = myUpcoming();
  schOpen(`<h3 class="sch-h">${esc(schName(s.who))} Works This</h3><p class="sch-p"><b>${esc(fDay(date))}</b><br>${esc(fR(s.start, s.end))}</p>
    ${pendingFor(sid) ? `<p class="help">There is already a request waiting on this shift.</p>` : mine.length ? `<h3 class="grp" style="margin-top:6px">Ask to Swap — Pick Your Shift to Give</h3><div class="sch-list">${mine.map(({ date: md, s: ms }) => `<button type="button" class="btn ghost sch-row" data-doswap2="${esc(md)}|${esc(ms.id)}|${esc(date)}|${esc(sid)}"><b>${esc(fDayS(md))}</b><span>${esc(fRs(ms.start, ms.end))}</span></button>`).join("")}</div>` : `<p class="help">You don't have an upcoming shift to swap.</p>`}
    <button type="button" class="btn ghost" data-schclose>Close</button>`);
}

/* ---------- select many days (manager, month view) ---------- */
function selS(){ if(!sch.sel) sch.sel = { mode: false, anchor: "", dates: new Set(), drag: null, skip: false, forMonth: "" }; return sch.sel; }
const selOn = () => !!(sch.data && schIsMgr() && sch.view === "team" && sch.tmode === "month");
const selIdx = date => Math.round((spd(date) - spd(wkStart(sch.month))) / 86400000);
function selRect(a, b){                       // every day inside the box from a to b (rows = weeks, columns = weekdays)
  const ia = selIdx(a), ib = selIdx(b), r1 = Math.min(ia, ib) / 7 | 0, r2 = Math.max(ia, ib) / 7 | 0, c1 = Math.min(ia % 7, ib % 7), c2 = Math.max(ia % 7, ib % 7), out = [], f = wkStart(sch.month);
  for(let r = r1; r <= r2; r++) for(let c = c1; c <= c2; c++) out.push(addD(f, r * 7 + c));
  return out;
}
function selReset(){ const S = selS(); S.mode = false; S.dates.clear(); S.anchor = ""; S.drag = null; }
function selPaint(){
  const S = selS(), n = S.dates.size;
  $$("#sch-body .sm-cell[data-d]").forEach(c => c.classList.toggle("picked", S.dates.has(c.dataset.d)));
  let bar = $("#sch-selbar");
  if(!bar){ bar = document.createElement("div"); bar.id = "sch-selbar"; bar.className = "sch-selbar"; bar.hidden = true; document.body.appendChild(bar); }
  const show = selOn() && (n > 0 || S.mode) && !$("#p-schedule").hidden;
  bar.hidden = !show;
  if(show) bar.innerHTML = (n ? `<b>${n} Day${n === 1 ? "" : "s"} Selected</b><button type="button" class="btn" data-selgo>Edit</button><button type="button" class="btn ghost" data-selclear>Clear</button>` : `<b>Select Days Is On</b>`) + (S.mode ? `<button type="button" class="btn ghost" data-seltog>Done</button>` : "");
}
const selCell = el => el && el.closest ? el.closest("#sch-body .sm-cell[data-d]") : null;
function selSkip(){ const S = selS(); S.skip = true; setTimeout(() => { S.skip = false; }, 120); }
document.addEventListener("pointerdown", e => {
  if(!selOn() || (e.pointerType === "mouse" && e.button !== 0)) return;
  const c = selCell(e.target); if(!c) return;
  const S = selS(), date = c.dataset.d;
  if(e.shiftKey){                              // computer: Shift+click a second day
    e.preventDefault(); selSkip();
    const a = S.anchor || date; S.anchor = a;
    S.dates = new Set(selRect(a, date)); selPaint();
    if(S.dates.size > 1) schBatch();
    return;
  }
  S.anchor = date;
  if(!S.mode){ if(S.dates.size){ S.dates.clear(); selPaint(); } return; }
  const touch = e.pointerType !== "mouse";
  const d = S.drag = { start: date, last: date, moved: false, live: !touch, x: e.clientX, y: e.clientY, timer: 0 };
  if(touch) d.timer = setTimeout(() => { if(S.drag === d){ d.live = d.held = true; if(navigator.vibrate) navigator.vibrate(15); S.dates.add(d.start); selPaint(); } }, 260);   // finger: touch and hold to start dragging, a quick swipe just scrolls the page
});
document.addEventListener("touchmove", e => { const d = selS().drag; if(d && d.live && e.cancelable) e.preventDefault(); }, { passive: false });
document.addEventListener("contextmenu", e => { if(selS().mode && selCell(e.target)) e.preventDefault(); });
document.addEventListener("pointermove", e => {
  const S = selS(); if(!S.drag) return;
  if(!S.drag.live){ if(Math.abs(e.clientX - S.drag.x) + Math.abs(e.clientY - S.drag.y) > 8){ clearTimeout(S.drag.timer); S.drag = null; } return; }   // moved before the hold: it is a scroll
  const c = selCell(document.elementFromPoint(e.clientX, e.clientY)); if(!c || c.dataset.d === S.drag.last) return;
  S.drag.last = c.dataset.d; S.drag.moved = true;
  S.dates = new Set(selRect(S.drag.start, c.dataset.d)); selPaint();
});
document.addEventListener("pointerup", e => {
  const S = selS(); const d = S.drag; if(!d) return;
  clearTimeout(d.timer); S.drag = null; selSkip();
  if(!d.moved){ if(!d.held){ if(S.dates.has(d.start)) S.dates.delete(d.start); else S.dates.add(d.start); } selPaint(); return; }
  selPaint(); if(S.dates.size > 1) schBatch();
});
document.addEventListener("pointercancel", () => { const S = selS(); if(S.drag){ clearTimeout(S.drag.timer); S.drag = null; selPaint(); } });
function schBatch(){
  const S = selS(), dates = [...S.dates].sort(); if(!dates.length) return;
  const people = sch.data.team.filter(p => !p.hidden), n = dates.length;
  sch.ed = { batch: true, who: sch.lastWho !== undefined && people.some(p => p.id === sch.lastWho) ? sch.lastWho : null };
  schOpen(`<h3 class="sch-h">${n} Day${n === 1 ? "" : "s"} Selected</h3>
    <p class="help" style="margin:0 0 4px">${esc(fDayS(dates[0]))}${n > 1 ? " to " + esc(fDayS(dates[n - 1])) : ""}</p>
    <p class="help" style="margin:10px 0 6px">1. Tap who works:</p><div class="sch-people">${people.map(p => `<button type="button" class="sch-pick" data-pick="${esc(p.id)}" style="--c:${empColor(p.id)}">${esc(firstName(p.name))}</button>`).join("")}<button type="button" class="sch-pick" data-pick="" style="--c:${empColor("")}">Open Shift</button></div>
    <p class="help" style="margin:10px 0 6px">2. Tap the shift (it is added to every selected day):</p><div class="sch-pgrid">${presetBtns("data-bp")}</div>
    <details class="sch-cust"><summary>Other Time</summary><div class="sch-prt"><label class="help" style="margin:0">From<input type="time" id="sch-b-s" value="09:00"></label><label class="help" style="margin:0">To<input type="time" id="sch-b-e" value="17:00"></label></div>
    <input id="sch-b-n" maxlength="60" placeholder="Note (Optional)" aria-label="Note"><button type="button" class="btn" id="sch-b-add">Add This Shift to These Days</button></details>
    <button type="button" class="btn ghost rm-site" id="sch-b-rm">Remove Their Shifts From These Days</button>
    <button type="button" class="btn ghost rm-site" id="sch-b-clr">Clear Every Shift on These Days</button>
    <button type="button" class="btn ghost" data-schclose>Close</button>`);
  schPaint();
}
async function batchCall(body, msg){
  try{ const j = await schCall(body); schClose(); const S = selS(); S.dates.clear(); S.anchor = ""; renderSchedule(); toast(msg(j)); }
  catch(err){ if(err.status === 401 || err.status === 429){ lockPage(err.message); return; } toast(err.message, true); }
}
const batchAddMsg = j => { const n = (j.added || 0), c = (j.changed || 0), parts = []; if(n) parts.push(`Added to ${n} day${n === 1 ? "" : "s"}`); if(c) parts.push(`${n ? "changed" : "Changed"} ${c} day${c === 1 ? "" : "s"} to the new hours`); if(j.skipped) parts.push(`${j.skipped} already there`); return parts.join(", ") || "Nothing to change"; };
const batchDates = () => [...selS().dates].sort();

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
document.addEventListener("keydown", e => { if(e.key === "Escape"){ if(!$("#sch-modal").hidden) schClose(); else if(!$("#sch-pick").hidden) schPickClose(); else if(selS().dates.size){ selS().dates.clear(); selPaint(); } } });

document.addEventListener("click", async e => {
  const el = e.target; if(!el.closest) return;
  if(el.closest("[data-selclear]")){ selS().dates.clear(); selS().anchor = ""; selPaint(); return; }
  if(el.closest("[data-selgo]")){ schBatch(); return; }
  const st = el.closest("[data-seltog]"); if(st){ const S = selS(), m = !S.mode; selReset(); S.mode = m; renderSchedule(); return; }
  const v = el.closest("[data-schview]"); if(v){ selReset(); sch.view = v.dataset.schview; if(sch.view === "setup") sch.draft = null; loadSchedule(); return; }
  const tm = el.closest("[data-tmode]"); if(tm){ selReset(); sch.tmode = tm.dataset.tmode; if(sch.tmode === "week"){ const t = schToday(); sch.start = monthFirst(t) === sch.month ? wkStart(t) : wkStart(sch.month); } else sch.month = monthFirst(sch.start); loadSchedule(); return; }
  if(el.closest("[data-gosetup]")){ schClose(); sch.view = "setup"; sch.draft = null; loadSchedule(); return; }
  if(el.closest("[data-schclose]")){ schClose(); return; }
  const ad = el.closest("[data-addday]"); if(ad && sch.data && schIsMgr() && !selS().skip){ schCell(ad.dataset.addday, null); return; }
  const td = el.closest(".sch-tbl td[data-d], .sm-cell[data-d]");
  if(td && sch.data && !el.closest("#sch-modal")){
    if(selS().skip || (selS().mode && selOn())) return;
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
  const bp = el.closest("[data-bp]");
  if(bp && sch.ed && sch.ed.batch){ if(sch.ed.who === null){ toast("Tap who works first.", true); return; } const p = sch.data.presets.find(x => x.id === bp.dataset.bp); await batchCall({ action: "batch", dates: batchDates(), who: sch.ed.who, start: p.start, end: p.end, note: "" }, batchAddMsg); return; }
  if(el.closest("#sch-b-add") && sch.ed && sch.ed.batch){ if(sch.ed.who === null){ toast("Tap who works first.", true); return; } await batchCall({ action: "batch", dates: batchDates(), who: sch.ed.who, start: $("#sch-b-s").value, end: $("#sch-b-e").value, note: $("#sch-b-n").value }, batchAddMsg); return; }
  if(el.closest("#sch-b-rm") && sch.ed && sch.ed.batch){ if(sch.ed.who === null){ toast("Tap who first.", true); return; } const who = sch.ed.who; schClose(); if(await askYes(`Remove ${who ? schName(who) : "the Open Shifts"} from these days?`, "Remove", true)) await batchCall({ action: "batchRemove", dates: batchDates(), who }, j => `Removed ${j.removed} shift${j.removed === 1 ? "" : "s"}`); else schBatch(); return; }
  if(el.closest("#sch-b-clr") && sch.ed && sch.ed.batch){ schClose(); if(await askYes("Clear every shift on these days?", "Clear Them", true)) await batchCall({ action: "batchRemove", dates: batchDates() }, j => `Removed ${j.removed} shift${j.removed === 1 ? "" : "s"}`); else schBatch(); return; }
  const ap = el.closest("[data-addp]");
  if(ap && sch.ed){ if(sch.ed.who === null){ toast("Tap who works first.", true); return; } const p = sch.data.presets.find(x => x.id === ap.dataset.addp); await schDo({ action: "save", date: sch.ed.date, who: sch.ed.who, start: p.start, end: p.end, note: "" }, `${p.name || "Shift"} added for ${sch.ed.who ? schName(sch.ed.who) : "Open Shift"}`); return; }
  if(el.closest("#sch-c-add") && sch.ed){ if(sch.ed.who === null){ toast("Tap who works first.", true); return; } const s = $("#sch-c-s").value, en = $("#sch-c-e").value; await schDo({ action: "save", date: sch.ed.date, who: sch.ed.who, start: s, end: en, note: $("#sch-c-n").value }, "Shift added"); return; }
  const up = el.closest("[data-usep]"); if(up){ const p = sch.data.presets.find(x => x.id === up.dataset.usep); $("#sch-e-s").value = p.start; $("#sch-e-e").value = p.end; return; }
  if(el.closest("#sch-e-save") && sch.ed){ await schDo({ action: "save", id: sch.ed.sid, date: sch.ed.date, who: $("#sch-e-w").value, start: $("#sch-e-s").value, end: $("#sch-e-e").value, note: $("#sch-e-n").value }, "Saved"); return; }
  if(el.closest("#sch-e-del") && sch.ed){ const ed2 = sch.ed; schClose(); if(await askYes("Remove this shift?", "Remove It", true)) await schDo({ action: "delete", date: ed2.date, id: ed2.sid }, "Shift removed"); return; }
  if(el.closest("#sch-m-give") && sch.ed){ await schDo({ action: "give", date: sch.ed.date, shiftId: sch.ed.sid, note: $("#sch-m-n").value }, "Offered. Everyone can see it now."); return; }
  if(el.closest("#sch-m-swap")){ await schPick(); return; }
  if(el.closest("[data-pickclose]")){ schPickClose(); return; }
  const ps = el.closest("[data-pshift]");
  if(ps && sch.pick){ const [wd, ws] = ps.dataset.pshift.split("|"), o = schShifts(wd).find(x => x.id === ws), mine = schShifts(sch.pick.date).find(x => x.id === sch.pick.sid); if(!o || !mine) return;
    const who = schName(o.who);
    if(!(await askYes(`Ask ${who} to swap?\n\nYou give: ${fDayS(sch.pick.date)} ${fRs(mine.start, mine.end)}\nYou get: ${fDayS(wd)} ${fRs(o.start, o.end)}`, "Send Request"))) return;
    const pk = sch.pick; if(await schDo({ action: "swap", date: pk.date, shiftId: pk.sid, withDate: wd, withShiftId: ws, note: pk.note }, null, true)){
      schPickClose(); schClose(); toast(sch.data.notified === "email" ? `Sent to ${who}. They also got an email.` : `Sent to ${who}. They'll see it when they open Store Tools.`); }
    return; }
  const sw2 = el.closest("[data-doswap2]"); if(sw2){ const [md, ms, wd, ws] = sw2.dataset.doswap2.split("|"); await schDo({ action: "swap", date: md, shiftId: ms, withDate: wd, withShiftId: ws }, "Swap request sent"); return; }
  const cn = el.closest("[data-schcancel]"); if(cn){ await schDo({ action: "cancel", id: cn.dataset.schcancel }, "Cancelled"); return; }
  const ot = el.closest("[data-schopen]"); if(ot){ const [d, s] = ot.dataset.schopen.split("|"); await schDo({ action: "openTake", date: d, shiftId: s }, "It's yours!"); return; }
  const rq = el.closest("[data-schreq]");
  if(rq){ const id = rq.closest("[data-rid]").dataset.rid, a = rq.dataset.schreq;
    const m = ({ yes: [{ action: "answer", accept: true }, "Swapped!"], no: [{ action: "answer", accept: false }, "Said no"],
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
  if(pps){ const card = pps.closest(".sch-pp"); await schDo({ action: "updatePerson", id: pps.dataset.ppsave, name: card.querySelector('[data-ppf=name]').value, staffId: card.querySelector('[data-ppf=staffId]').value, email: card.querySelector('[data-ppf=email]').value }, "Saved", true); return; }
  const pdl = el.closest("[data-pdel]");
  if(pdl){ const nm = (sch.data.team.find(x => x.id === pdl.dataset.pdel) || {}).name || "this person"; if(await askYes(`Remove ${nm} from the schedule? Their shifts become Open Shifts.`, "Remove", true)) await schDo({ action: "removePerson", id: pdl.dataset.pdel }, "Removed", true); return; }
  if(el.closest("#sch-pnadd")){ const nm = $("#sch-pnew").value.trim(); if(!nm){ toast("Type a name first.", true); return; } const nc = newCol(); sch.newCol = ""; await schDo({ action: "addPerson", name: nm, color: nc }, nm + " added", true); return; }
  const nco = el.closest("[data-ncol]"); if(nco){ const keep = $("#sch-pnew") ? $("#sch-pnew").value : ""; sch.newCol = nco.dataset.ncol; renderSchedule(); if($("#sch-pnew")) $("#sch-pnew").value = keep; return; }
  const alsw = el.closest("[data-alsw]");
  if(alsw){ const o = alertsRead(), k = alsw.dataset.alsw; if(k === "all") o.on = !o.on; else if(k === "hold") o.hold = !o.hold; else o.kinds[k].on = !o.kinds[k].on; await schDo({ action: "settings", notify: o }, null, true); return; }
  const cf = el.closest("#sch-confirm");
  if(cf){ const m = cf.dataset.month || "", pi = pendingInfo(), mn = m ? monthLabel(m) : ""; const msg = m ? `Show ${mn} to everyone and tell them the ${mn} schedule is done?` : `Send alerts now to ${pi.people} ${pi.people === 1 ? "person" : "people"}${pi.open ? " and tell everyone about the open days" : ""}?`;
    if(await askYes(msg, "Confirm")){ try{ await schCall({ action: "confirm", month: m }); renderSchedule(); toast(m ? mn + " schedule confirmed. Everyone was told." : "Schedule confirmed. Alerts sent."); }catch(err){ toast(err.message, true); } } return; }
  const hm = el.closest("#sch-hidemonth");
  if(hm){ const mn = monthLabel(hm.dataset.month); if(await askYes(`Hide ${mn} from employees again? They won't see it until you confirm.`, "Hide It", true)) await schDo({ action: "hideMonth", month: hm.dataset.month }, mn + " hidden from employees", true); return; }
  if(el.closest("#sch-confirm-no")){ if(await askYes("Throw away the waiting alerts without sending them? The shifts stay as they are.", "Don't Send", true)){ await schDo({ action: "discardPending" }, "Alerts cleared, nothing sent", true); } return; }
  if(el.closest("#sch-alsave")){ await schDo({ action: "settings", notify: alertsRead() }, "Alert wording saved", true); return; }
  if(el.closest("#sch-alreset")){ if(await askYes("Put every alert back to the standard wording?", "Put Back")){ const o = alertsRead(); for(const k of Object.keys(o.kinds)){ o.kinds[k].title = ""; o.kinds[k].body = ""; } await schDo({ action: "settings", notify: o }, "Standard wording back", true); } return; }
  if(el.closest("#sch-altest")){ try{ const j = await api("/api/schedule", { action: "pushTest" }); toast(j.message); }catch(err){ toast(err.message, true); } return; }
  if(el.closest("#sch-osave")){ await schDo({ action: "settings", ownerName: $("#sch-oname").value }, "Name saved", true); return; }
  if(el.closest("#sch-copy")){ if(await askYes("Copy last week's shifts into this week? Shifts already here stay.", "Copy")) await schDo({ action: "copyWeek", from: addD(sch.start, -7), to: sch.start }, "Copied last week", true); return; }
  if(el.closest("#sch-clear")){ if(await askYes("Clear every shift this week?", "Clear It", true)) await schDo({ action: "clearWeek", start: sch.start }, "Week cleared", true); return; }
});
document.addEventListener("input", e => {
  const r = e.target.closest && e.target.closest("[data-pi]"); if(!r || !sch.draft || !e.target.dataset.pf) return;
  sch.draft[+r.dataset.pi][e.target.dataset.pf] = e.target.value;
});
