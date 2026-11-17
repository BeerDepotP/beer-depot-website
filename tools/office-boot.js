/* Beer Depot Back Office on the web. Loaded first on every page: asks for the owner PIN, loads the POS data from the server,
   then stands in for the Mac app's bridge (BDDisk, BDKorona, BDInvoice) so the very same screens run in a browser. */
(function () {
  'use strict';
  var PIN_KEY = 'bdo-pin', URL_API = '/api/office', BG = '/.netlify/functions/office-job-background', CHUNK = 3 * 1024 * 1024;
  var pin = ''; try { pin = localStorage.getItem(PIN_KEY) || ''; } catch (e) { /* none */ }

  function login(msg) {
    document.write('<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">' +
      '<style>body{margin:0;background:#F5F3EE;font-family:Inter,system-ui,sans-serif;color:#1D1B16}.bdo-l{max-width:360px;margin:12vh auto 0;padding:24px;background:#fff;border-radius:16px;box-shadow:0 2px 14px rgba(0,0,0,.08)}' +
      '.bdo-l h1{font-size:22px;margin:0 0 6px}.bdo-l p{margin:0 0 14px;color:#6B6558;font-size:14px}.bdo-l input{width:100%;box-sizing:border-box;font:inherit;font-size:22px;text-align:center;letter-spacing:.2em;padding:12px;border:1px solid #CFC7B4;border-radius:10px}' +
      '.bdo-l button{margin-top:12px;width:100%;min-height:50px;font:inherit;font-size:17px;font-weight:700;border:0;border-radius:10px;background:#F26B1D;color:#fff;cursor:pointer}.bdo-e{color:#8C1D14;font-size:14px;margin-top:10px;min-height:18px}</style>' +
      '<form class="bdo-l" onsubmit="try{localStorage.setItem(\'' + PIN_KEY + '\',this.p.value.trim())}catch(e){};location.reload();return false"><h1>The Beer Depot</h1><p>Back Office. Enter the owner PIN.</p>' +
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
  var cache = first.data.keys || {};
  (first.data.rest || []).forEach(function (r) {
    var t = ''; for (var i = 0; i < r.n; i++) { var g = post({ action: 'get', key: r.key, i: i }); t += (g.data && g.data.text) || ''; } cache[r.key] = t;
  });

  // ---- saving: every change is kept in memory at once and sent to the server a moment later ----
  var pending = {}, busy = false, timer = null, failed = false, pill = null;
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
      var step = function (i) { return post({ action: 'put', key: k, i: i, n: n, len: text.length, text: text.slice(i * CHUNK, (i + 1) * CHUNK) }, true).then(function (r) { if (r.status !== 200) throw new Error(r.data.error || r.status); return i + 1 < n ? step(i + 1) : r; }); };
      go = step(0);
    }
    go.then(function () { busy = false; failed = false; flush(); }).catch(function () { busy = false; failed = true; pending[k] = true; show('Not saved yet. Trying again...', true); clearTimeout(timer); timer = setTimeout(flush, 5000); });
  }
  function queue(k) { pending[k] = true; clearTimeout(timer); timer = setTimeout(flush, 700); }
  window.addEventListener('beforeunload', function (e) { if (Object.keys(pending).length || busy) { e.preventDefault(); e.returnValue = 'Your last change is still being saved.'; } });

  // A fresh web copy starts LIVE and EMPTY (no sample products); the first Sync now fills it from KORONA.
  if (cache.live == null) { cache.live = JSON.stringify({ on: true, since: new Date().toISOString() }); queue('live'); }
  if (cache.products == null) { cache.products = '{}'; queue('products'); }

  if (cache['state:Receive:v1'] == null) { cache['state:Receive:v1'] = JSON.stringify({ promotions: [], invoices: [], counts: [], adjLog: [], lists: [], lines: [] }); queue('state:Receive:v1'); }

  window.BDWeb = { signOut: function () { try { localStorage.removeItem(PIN_KEY); } catch (e) { /* none */ } location.reload(); } };
  window.BDDisk = {
    get: function (k) { return Object.prototype.hasOwnProperty.call(cache, k) ? cache[k] : null; },
    set: function (k, text) { cache[k] = String(text); queue(k); return true; },
    keys: function () { return Object.keys(cache); },
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
    pull: function (o) { return runJob('kor-pull', o); }, receipts: function (o) { return runJob('kor-receipts', o); }, gift: function () { return runJob('kor-gift', {}); },
    editReq: function (r) { return kor('editReq', r); }
  };
  window.BDInvoice = {
    info: function () { return post({ action: 'inv-info' }, true).then(function (r) { return r.data; }); },
    setKey: function () { return window.BDInvoice.info(); },
    read: function (b64, mt, extra) { if (!b64 || b64.length > 7 * 1024 * 1024) return Promise.resolve({ ok: false, error: 'That photo is too large. Try a smaller photo.' }); return runJob('inv-read', { mediaType: mt || 'image/jpeg', extra: extra || '' }, b64); }
  };
  document.write('<style>@media (max-width:820px){nav[aria-label="Back office"]{position:fixed !important;top:0;left:0;bottom:0;width:270px !important;max-width:82vw !important;flex:none !important;z-index:3000;overflow-y:auto;transform:translateX(-105%);transition:transform .2s;box-shadow:2px 0 14px rgba(0,0,0,.3)}nav[aria-label="Back office"].bdo-open{transform:none}main{flex:1 1 100% !important;padding:64px 12px 70px !important}#bdo-menu{display:block !important}}#bdo-menu{display:none;position:fixed;top:10px;left:10px;z-index:2500;min-height:44px;padding:0 16px;font:700 15px Inter,system-ui,sans-serif;border:0;border-radius:10px;background:#2A2118;color:#fff;box-shadow:0 1px 6px rgba(0,0,0,.3)}</style>');
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('button'); b.textContent = 'Sign out'; b.className = 'noprint';
    b.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99999;font:600 12px Inter,system-ui,sans-serif;padding:6px 12px;border-radius:99px;border:1px solid #CFC7B4;background:#fff;color:#1D1B16;cursor:pointer';
    b.onclick = function () { window.BDWeb.signOut(); }; document.body.appendChild(b);
    var m = document.createElement('button'); m.id = 'bdo-menu'; m.className = 'noprint'; m.textContent = 'Menu'; document.body.appendChild(m);
    var navEl = function () { return document.querySelector('nav[aria-label="Back office"]'); };
    m.onclick = function () { var n = navEl(); if (n) n.classList.toggle('bdo-open'); };
    document.addEventListener('click', function (e) { var n = navEl(); if (n && n.classList.contains('bdo-open') && e.target !== m && n.contains(e.target)) setTimeout(function () { n.classList.remove('bdo-open'); }, 50); else if (n && n.classList.contains('bdo-open') && e.target !== m && !n.contains(e.target)) n.classList.remove('bdo-open'); });
  });
  document.write('<script src="./support.js"><\/script>');
})();
