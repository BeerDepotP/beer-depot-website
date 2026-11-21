/* Beer Depot Back Office on the web. Loaded first on every page: asks for the owner PIN, loads the POS data from the server,
   then stands in for the Mac app's bridge (BDDisk, BDKorona, BDInvoice) so the very same screens run in a browser. */
(function () {
  'use strict';
  var PIN_KEY = 'bdo-pin', URL_API = '/api/office', BG = '/.netlify/functions/office-job-background', CHUNK = 3 * 1024 * 1024;
  var pin = ''; try { pin = localStorage.getItem(PIN_KEY) || ''; var seen = parseInt(localStorage.getItem(PIN_KEY + '-at') || '0', 10); /* the saved PIN is forgotten after 7 days of not opening the Back Office */ if (pin && (!seen || Date.now() - seen > 7 * 86400000)) { localStorage.removeItem(PIN_KEY); pin = ''; } if (pin) localStorage.setItem(PIN_KEY + '-at', String(Date.now())); } catch (e) { /* none */ }

  function login(msg) {
    document.write('<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">' +
      '<style>body{margin:0;background:#F5F3EE;font-family:Inter,system-ui,sans-serif;color:#1D1B16}.bdo-l{max-width:360px;margin:12vh auto 0;padding:24px;background:#fff;border-radius:16px;box-shadow:0 2px 14px rgba(0,0,0,.08)}' +
      '.bdo-l h1{font-size:22px;margin:0 0 6px}.bdo-l p{margin:0 0 14px;color:#6B6558;font-size:14px}.bdo-l input{width:100%;box-sizing:border-box;font:inherit;font-size:22px;text-align:center;letter-spacing:.2em;padding:12px;border:1px solid #CFC7B4;border-radius:10px}' +
      '.bdo-l button{margin-top:12px;width:100%;min-height:50px;font:inherit;font-size:17px;font-weight:700;border:0;border-radius:10px;background:#F26B1D;color:#fff;cursor:pointer}.bdo-e{color:#8C1D14;font-size:14px;margin-top:10px;min-height:18px}</style>' +
      '<form class="bdo-l" onsubmit="try{localStorage.setItem(\'' + PIN_KEY + '\',this.p.value.trim());localStorage.setItem(\'' + PIN_KEY + '-at\',String(Date.now()))}catch(e){};location.reload();return false"><h1>The Beer Depot</h1><p>Back Office. Enter the owner PIN.</p>' +
      '<input name="p" type="password" inputmode="numeric" autocomplete="current-password" autofocus><button type="submit">Open</button><div class="bdo-e">' + (msg || '') + '</div></form><!--');
  }
  if (!pin) { login(''); return; }

  function post(body, async_) {
    body.pin = pin;
    if (!async_) {
      var x = new XMLHttpRequest(); x.open('POST', URL_API, false); x.setRequestHeader('Content-Type', 'application/json');
      try { x.send(JSON.stringify(body)); } catch (e) { return { status: 0, data: { error: 'No connection.' } }; }
      var d = null; try { d = JSON.parse(x.responseText); } catch (e) { d = { error: 'The server answered with something unreadable (' + x.status + ').' }; }
      return { status: x.status, data: d };
    }
    return fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }, function () { return { status: r.status, data: { error: 'Unreadable answer (' + r.status + ').' } }; }); });
  }

  // ---- load the POS data (blocks, so the screens start with everything in place) ----
  var first = post({ action: 'load' });
  if (first.status === 401 || first.status === 403 || first.status === 429) { try { localStorage.removeItem(PIN_KEY); } catch (e) { /* none */ } login(first.data.error || 'Wrong PIN.'); return; }
  if (first.status !== 200) { login('Could not load: ' + (first.data.error || first.status)); return; }
  var cache = first.data.keys || {}, ver = first.data.at || {}, loadFailed = '';
  var lazy = {}, isSalesKey = function (k) { return /^sales:\d{4}-\d{2}$/.test(k); };
  (first.data.rest || []).forEach(function (r) {
    if (isSalesKey(r.key)) { lazy[r.key] = r.n; return; } /* sales months are big: fetched only when a screen asks for them */
    var t = ''; for (var i = 0; i < r.n; i++) {
      var g = null; for (var tries = 0; tries < 4; tries++) { g = post({ action: 'get', key: r.key, i: i }); if (g.status === 200 && g.data && typeof g.data.text === 'string') break; }
      if (!(g.status === 200 && g.data && typeof g.data.text === 'string')) { loadFailed = 'Part ' + (i + 1) + ' of ' + r.n + ' of "' + r.key + '" would not load (' + ((g.data && g.data.error) || g.status) + ').'; break; }
      t += g.data.text;
    } cache[r.key] = t;
  });
  if (loadFailed) { login('Your data did not finish loading, so nothing was opened (this keeps your saved data safe). ' + loadFailed + ' Refresh to try again.'); return; }

  try { var note0 = sessionStorage.getItem('bdo-note'); if (note0) { sessionStorage.removeItem('bdo-note'); var cnt = ''; try { cnt = ' After reopening: ' + Object.keys(JSON.parse(cache.products || '{}')).length + ' products loaded.'; } catch (e) { cnt = ' After reopening the products could not be read.'; } document.addEventListener('DOMContentLoaded', function () { var d = document.createElement('div'); d.className = 'noprint'; d.textContent = note0 + cnt; d.style.cssText = 'position:fixed;left:10px;right:10px;top:10px;z-index:99999;font:600 14px Inter,system-ui,sans-serif;padding:10px 14px;border-radius:10px;background:#12264E;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.3)'; d.onclick = function () { d.remove(); }; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 20000); }); } } catch (e) { /* none */ }
  // ---- saving: every change is kept in memory at once and sent to the server a moment later ----
  var pending = {}, busy = false, timer = null, failed = false, pill = null, forced = {}, conflicts = {};
  function show(txt, bad) {
    if (!document.body) return;
    if (!pill) { pill = document.createElement('div'); pill.className = 'noprint'; pill.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:99999;font:600 12px Inter,system-ui,sans-serif;padding:6px 10px;border-radius:99px;box-shadow:0 1px 6px rgba(0,0,0,.2)'; document.body.appendChild(pill); }
    pill.textContent = txt; pill.style.background = bad ? '#8C1D14' : '#14572D'; pill.style.color = '#fff'; pill.style.display = txt ? 'block' : 'none';
  }
  function flush() {
    if (busy) return; var ks = Object.keys(pending); if (!ks.length) { if (!failed) { show('Saved', false); setTimeout(function () { if (!Object.keys(pending).length && !failed) show('', false); }, 1500); } return; }
    busy = true; show('Saving...', false);
    var k = ks[0], text = cache[k], gone = text == null; delete pending[k];
    var go;
    if (gone) go = post({ action: 'del', key: k }, true);
    else {
      var n = Math.max(1, Math.ceil(text.length / CHUNK)); go = Promise.resolve({ status: 200 });
      var step = function (i) { return post({ action: 'put', key: k, i: i, n: n, len: text.length, text: text.slice(i * CHUNK, (i + 1) * CHUNK), base: ver[k] || 0, force: !!forced[k] }, true).then(function (r) {
        if (r.status === 409) { var e = new Error('conflict'); e.conflict = true; throw e; }
        if (r.status !== 200) throw new Error(r.data.error || r.status);
        if (i + 1 < n) return step(i + 1);
        if (r.data && r.data.at) ver[k] = r.data.at; delete forced[k]; return r; }); };
      go = step(0);
    }
    go.then(function () { busy = false; failed = false; flush(); }).catch(function (e) {
      busy = false;
      if (e && e.conflict) { forced[k] = true; pending[k] = true; setTimeout(flush, 50); return; } /* no red bar: your change always goes through, and look() below pulls other devices' changes in */
      failed = true; pending[k] = true; show('Not saved yet. Trying again...', true); clearTimeout(timer); timer = setTimeout(flush, 5000); });
  }
  function conflictBar() {
    var ks = Object.keys(conflicts); if (!ks.length || !document.body) { if (!document.body) document.addEventListener('DOMContentLoaded', conflictBar); return; }
    var b = document.getElementById('bdo-conf');
    if (!b) { b = document.createElement('div'); b.id = 'bdo-conf'; b.className = 'noprint'; b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:100000;background:#8C1D14;color:#fff;font:600 14px Inter,system-ui,sans-serif;padding:12px 14px;display:flex;flex-wrap:wrap;gap:10px;align-items:center'; document.body.appendChild(b); }
    b.innerHTML = '<span style="flex:1 1 240px">This was changed on another device (the Mac or another phone). Your last change has not been saved.</span>' +
      '<button id="bdo-theirs" style="min-height:40px;padding:0 14px;font:700 14px Inter,system-ui,sans-serif;border:0;border-radius:8px;background:#fff;color:#1D1B16">Use Their Version</button>' +
      '<button id="bdo-mine" style="min-height:40px;padding:0 14px;font:700 14px Inter,system-ui,sans-serif;border:1px solid #fff;border-radius:8px;background:transparent;color:#fff">Keep Mine</button>';
    document.getElementById('bdo-theirs').onclick = function () { conflicts = {}; pending = {}; location.reload(); };
    document.getElementById('bdo-mine').onclick = function () { Object.keys(conflicts).forEach(function (k) { forced[k] = true; pending[k] = true; }); conflicts = {}; b.remove(); flush(); };
  }
  // ---- pick up changes made on another device (the Mac): look every 20 s and when this page comes back into view ----
  function fetchKey(k, n) { var t = '', p = Promise.resolve(); for (var i = 0; i < n; i++) (function (j) { p = p.then(function () { return post({ action: 'get', key: k, i: j }, true).then(function (r) { t += (r.data && r.data.text) || ''; }); }); })(i); return p.then(function () { return t; }); }
  var looking = false;
  function look() {
    if (looking || busy || Object.keys(pending).length || Object.keys(conflicts).length) return; looking = true;
    post({ action: 'versions' }, true).then(function (r) {
      if (r.status !== 200 || !r.data.v) return; var v = r.data.v, changed = [];
      Object.keys(v).forEach(function (k) { if ((ver[k] || 0) === v[k].at) return; if (isSalesKey(k)) { delete cache[k]; lazy[k] = v[k].n; ver[k] = v[k].at; return; } changed.push(k); });
      if (!changed.length || Object.keys(pending).length) return;
      return Promise.all(changed.map(function (k) { return fetchKey(k, v[k].n).then(function (t) { cache[k] = t; ver[k] = v[k].at; }); })).then(function () {
        var tryReload = function () { var ae = document.activeElement; if ((ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) || (window.__bdAct && Date.now() - window.__bdAct < 120000)) { setTimeout(tryReload, 15000); return; } location.reload(); };
        tryReload();
      });
    }).then(function () { looking = false; }, function () { looking = false; });
  }
  setInterval(look, 6000); document.addEventListener('visibilitychange', function () { if (!document.hidden) look(); });
  function queue(k) { pending[k] = true; clearTimeout(timer); timer = setTimeout(flush, 700); }
  window.addEventListener('beforeunload', function (e) { if (Object.keys(pending).length || busy) { e.preventDefault(); e.returnValue = 'Your last change is still being saved.'; } });

  // A fresh web copy starts LIVE and EMPTY (no sample products); the first Sync now fills it from KORONA.
  if (cache.live == null) { cache.live = JSON.stringify({ on: true, since: new Date().toISOString() }); queue('live'); }
  if (cache.products == null) { cache.products = '{}'; queue('products'); }

  if (cache['state:Receive:v1'] == null) { cache['state:Receive:v1'] = JSON.stringify({ promotions: [], invoices: [], counts: [], adjLog: [], lists: [], lines: [] }); queue('state:Receive:v1'); }

  // Waits until everything is saved to the server (used before a page reload so a sync is not thrown away)
  function whenSaved() { return new Promise(function (res) { var t0 = Date.now(); (function chk() { if (Object.keys(pending).length && !busy && !timer) flush(); if ((!Object.keys(pending).length && !busy) || Date.now() - t0 > 120000) return res(); setTimeout(chk, 250); })(); }); }
  window.BDPrintCall = { call: function (body) { var o = body || {}; if (!/^print-(add|status|clear)$/.test(String(o.action))) return Promise.resolve({ ok: false, error: 'Not allowed.' }); return post(o, true).then(function (r) { return r.status === 200 ? Object.assign({ ok: true }, r.data) : { ok: false, error: (r.data && r.data.error) || 'Could not reach the website.' }; }).catch(function () { return { ok: false, error: 'Could not reach the website.' }; }); } };
  window.BDWeb = { whenSaved: whenSaved, reloadWhenSaved: function () { clearTimeout(timer); timer = null; flush(); whenSaved().then(function () { var note = ''; try { var v = post({ action: 'versions' }); var m = v.data && v.data.v && v.data.v.products; note = m ? 'The website holds ' + (m.len / 1048576).toFixed(1) + ' MB of products (' + m.n + ' piece' + (m.n === 1 ? '' : 's') + ').' : 'The website holds NO products. The save did not reach the server.'; if (failed) note += ' Some saves failed.'; sessionStorage.setItem('bdo-note', note); } catch (e) { /* none */ } location.reload(); }); }, signOut: function () { try { localStorage.removeItem(PIN_KEY); } catch (e) { /* none */ } location.reload(); } };
  window.BDDisk = {
    get: function (k) {
      if (Object.prototype.hasOwnProperty.call(cache, k)) return cache[k];
      if (lazy[k]) { var t = '', ok = true; for (var i = 0; i < lazy[k]; i++) { var g = null; for (var tr = 0; tr < 3; tr++) { g = post({ action: 'get', key: k, i: i }); if (g.status === 200 && g.data && typeof g.data.text === 'string') break; } if (!(g.status === 200 && g.data && typeof g.data.text === 'string')) { ok = false; break; } t += g.data.text; } if (ok) { cache[k] = t; delete lazy[k]; return t; } }
      return null;
    },
    set: function (k, text) { text = String(text); if (cache[k] === text && !pending[k]) return true; /* nothing changed: do not save it again (that made other devices refresh) */ cache[k] = text; queue(k); return true; },
    keys: function () { var o = Object.keys(cache); Object.keys(lazy).forEach(function (k) { if (o.indexOf(k) < 0) o.push(k); }); return o; },
    del: function (k) { delete cache[k]; queue(k); }
  };

  // ---- KORONA and the invoice reader, run by the server ----
  function kor(fn, arg) { return post({ action: 'kor', fn: fn, arg: arg }, true).then(function (r) { if (r.status !== 200) return { ok: false, status: 0, body: null, error: r.data.error || ('Error ' + r.status) }; return r.data; }); }
  function newId() { var a = new Uint8Array(12); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function runJob(kind, arg, b64) {
    var id = newId(), inN = 0, started = Date.now();
    var up = Promise.resolve();
    if (b64) { inN = Math.max(1, Math.ceil(b64.length / CHUNK)); for (var i = 0; i < inN; i++) (function (j) { up = up.then(function () { return post({ action: 'job-in', id: id, i: j, text: b64.slice(j * CHUNK, (j + 1) * CHUNK) }, true).then(function (r) { if (r.status !== 200) throw new Error(r.data.error || 'Upload failed.'); }); }); })(i); }
    return up.then(function () { return fetch(BG, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: pin, id: id, kind: kind, arg: arg || {}, inN: inN }) }); })
      .then(function (r) { if (!r.ok && r.status !== 202) throw new Error('The server would not start the job (' + r.status + ').'); })
      .then(function () {
        return new Promise(function (res, rej) {
          (function poll() {
            post({ action: 'job-status', id: id }, true).then(function (r) {
              if (r.status !== 200) return rej(new Error(r.data.error || 'Lost contact with the server.'));
              var m = r.data;
              if (m.state === 'done') return res(m);
              if (m.state === 'queued' && Date.now() - started > 90000) return rej(new Error('The server never started the job. Check that the Back Office is published and the Netlify settings are in.'));
              if (Date.now() - started > 14 * 60000) return rej(new Error('This took too long.'));
              setTimeout(poll, 2000);
            }, function () { setTimeout(poll, 3000); });
          })();
        });
      })
      .then(function (m) {
        var t = '', p = Promise.resolve();
        for (var i = 0; i < m.n; i++) (function (j) { p = p.then(function () { return post({ action: 'job-get', id: id, i: j }, true).then(function (r) { t += (r.data && r.data.text) || ''; }); }); })(i);
        return p.then(function () { post({ action: 'job-drop', id: id }, true); return JSON.parse(t); });
      })
      .catch(function (e) { return { ok: false, error: String((e && e.message) || e) }; });
  }
  var isSet = function (s) { return Promise.resolve(s); };
  window.BDKorona = {
    info: function () { return kor('info'); }, editInfo: function () { return kor('editInfo'); },
    save: function () { return kor('info'); }, clear: function () { return kor('info'); }, editSave: function () { return kor('editInfo'); }, editClear: function () { return kor('editInfo'); },
    pull: function (o) { return runJob('kor-pull', o); }, receipts: function () { return Promise.resolve({ ok: true, data: { receipts: [], maxRevision: 0 } }); /* KORONA does not allow the website to read sales; the Mac app keeps the sales history up to date here */ }, gift: function () { return runJob('kor-gift', {}); },
    editReq: function (r) { return kor('editReq', r); }
  };
  window.BDPhoto = {
    put: function (id, b64) { return post({ action: 'photo-put', id: id, b64: b64 }, true).then(function (r) { return r.status === 200 ? { ok: true } : { ok: false, error: (r.data && r.data.error) || 'Could not save the photo.' }; }, function () { return { ok: false, error: 'No connection.' }; }); },
    get: function (id) { return post({ action: 'photo-get', id: id }, true).then(function (r) { return r.status === 200 && r.data && r.data.b64 ? { ok: true, b64: r.data.b64 } : { ok: false, error: (r.data && r.data.error) || 'Could not open the photo.' }; }, function () { return { ok: false, error: 'No connection.' }; }); }
  };
  window.BDInvoice = {
    info: function () { return post({ action: 'inv-info' }, true).then(function (r) { return r.data; }); },
    setKey: function () { return window.BDInvoice.info(); },
    read: function (b64, mt, extra) { if (!b64 || b64.length > 7 * 1024 * 1024) return Promise.resolve({ ok: false, error: 'That photo is too large. Try a smaller photo.' }); return runJob('inv-read', { mediaType: mt || 'image/jpeg', extra: extra || '' }, b64); }
  };
  document.write('<style>@media (max-width:820px){nav[aria-label="Back office"]{position:fixed !important;top:0;left:0;bottom:0;width:300px !important;max-width:86vw !important;height:100vh;height:100dvh;max-height:none !important;padding:18px 12px 40px !important;gap:2px !important;flex:none !important;z-index:3000;overflow-y:auto;transform:translateX(-105%);transition:transform .2s;box-shadow:2px 0 14px rgba(0,0,0,.3)}nav[aria-label="Back office"].bdo-open{transform:none}nav[aria-label="Back office"] a,nav[aria-label="Back office"] button{display:flex !important;align-items:center;box-sizing:border-box;width:100%;min-height:50px;padding:0 14px !important;font-size:17px !important;border-radius:10px !important}nav[aria-label="Back office"] div[style*="uppercase"]{font-size:13px !important;padding:18px 14px 6px !important}#bdo-back{display:none;position:fixed;inset:0;background:rgba(20,14,8,.5);z-index:2900}#bdo-back.on{display:block}main{flex:1 1 100% !important;padding:64px 12px 70px !important}main [style*="grid-template-columns: repeat(2, minmax"],main [style*="grid-template-columns: repeat(3, minmax"],main [style*="grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr)"],main [style*="grid-template-columns: minmax(0, 1fr) minmax(0, 1.7fr)"]{grid-template-columns:minmax(0,1fr) !important}main [style*="margin-top: 8px"][style*="display: flex; gap: 10px"]{flex-wrap:wrap !important}main [style*="margin-top: 8px"][style*="display: flex; gap: 10px"]>button{flex:1 1 44% !important;min-width:130px}.bdo-box{max-height:calc(100vh - 150px);max-height:calc(100dvh - 150px);overflow:auto !important;overscroll-behavior:contain}.bdo-scroll{max-width:100% !important;box-sizing:border-box;overflow-x:auto !important;-webkit-overflow-scrolling:touch}.bdo-scroll [style*="grid-template-columns: 2.9fr"],.bdo-scroll [style*="grid-template-columns: 2.4fr .7fr"],.bdo-scroll [style*="grid-template-columns: 2.6fr"]{min-width:820px}#bdo-menu{display:block !important}}#bdo-menu{display:none;position:fixed;top:10px;left:10px;z-index:2500;min-height:56px;min-width:56px;padding:0 20px;font:800 18px Inter,system-ui,sans-serif;border:0;border-radius:10px;background:#2A2118;color:#fff;box-shadow:0 1px 6px rgba(0,0,0,.3)}</style>');
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('button'); b.textContent = 'Sign out'; b.className = 'noprint';
    b.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99999;font:600 12px Inter,system-ui,sans-serif;padding:6px 12px;border-radius:99px;border:1px solid #CFC7B4;background:#fff;color:#1D1B16;cursor:pointer';
    b.onclick = function () { window.BDWeb.signOut(); }; document.body.appendChild(b);
    var m = document.createElement('button'); m.id = 'bdo-menu'; m.className = 'noprint'; m.textContent = '\u2630  Menu'; document.body.appendChild(m);
    var navEl = function () { return document.querySelector('nav[aria-label="Back office"]'); };
    var bk = document.createElement('div'); bk.id = 'bdo-back'; bk.className = 'noprint'; document.body.appendChild(bk);
    var sync = function () { var n = navEl(); bk.classList.toggle('on', !!(n && n.classList.contains('bdo-open'))); };
    bk.onclick = function () { var n = navEl(); if (n) n.classList.remove('bdo-open'); sync(); };
    m.onclick = function () { var n = navEl(); if (n) n.classList.toggle('bdo-open'); sync(); };
    setInterval(sync, 200);
    document.addEventListener('click', function (e) { var n = navEl(); if (n && n.classList.contains('bdo-open') && e.target !== m && n.contains(e.target)) setTimeout(function () { n.classList.remove('bdo-open'); }, 50); else if (n && n.classList.contains('bdo-open') && e.target !== m && !n.contains(e.target)) n.classList.remove('bdo-open'); });
  });
  // phones: wide tables scroll sideways inside their card instead of being cut off
  function markScroll() {
    if (window.innerWidth > 820) return;
    var q = '[style*="grid-template-columns: 2.9fr"],[style*="grid-template-columns: 2.4fr .7fr"],[style*="grid-template-columns: 2.6fr"],[style*="min-width: 1100px"]';
    document.querySelectorAll(q).forEach(function (el) { var c = el.parentElement; while (c && c.tagName !== 'MAIN') { var st = c.getAttribute('style') || ''; if (/border-radius/.test(st) && /border: 1px/.test(st)) break; c = c.parentElement; } if (c && c.tagName !== 'MAIN') { c.classList.add('bdo-scroll'); if (/min-width: 1100px/.test(el.getAttribute('style') || '')) c.classList.add('bdo-box'); } });
  }
  document.addEventListener('DOMContentLoaded', function () { markScroll(); setInterval(markScroll, 1000); });
  document.write('<script src="./support.js"><\/script>');
})();
