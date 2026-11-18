// Local test server for the Back Office: serves public/, runs the REAL office functions, fakes KORONA and Anthropic.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.FOOD_PIN = '1234'; process.env.KORONA_ACCOUNT_ID = 'acc1'; process.env.KORONA_USER = 'u'; process.env.KORONA_PASSWORD = 'p';
process.env.KORONA_EDIT_USER = 'eu'; process.env.KORONA_EDIT_PASSWORD = 'ep'; process.env.ANTHROPIC_API_KEY = 'sk-test';
const log = globalThis.__log = [];
const realFetch = globalThis.fetch;
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const recs = []; let rcvN = 0; const rcv = {};
globalThis.fetch = async (u, o = {}) => {
  u = String(u); const m = (o.method || 'GET').toUpperCase();
  if (u.includes('api.anthropic.com')) { log.push('anthropic'); return J({ content: [{ text: JSON.stringify({ supplier: 'Frito Lay', invoiceNumber: '555', invoiceDate: '2026-11-17', deliveryFee: 0, invoiceTotal: 7.8, lines: [{ itemCode: '00046167', upc: '', description: 'X', cases: 4, unitsPerCase: 1, lineTotal: 7.8, stdName: 'X' }], returns: [] }) }], usage: {} }); }
  if (!u.includes('koronacloud.com')) return realFetch(u, o);
  const p = new URL(u).pathname.replace('/web/api/v3', '');
  log.push(m + ' ' + p + ' ' + (o.headers && o.headers.Authorization ? Buffer.from(o.headers.Authorization.slice(6), 'base64').toString().split(':')[0] : ''));
  const page = (a) => J({ results: a, pagesTotal: 1 });
  if (p.endsWith('/commodityGroups')) return page([{ id: 'g1', name: 'BEER' }]);
  if (p.endsWith('/suppliers') && process.env.FAKE_N) return page(Array.from({length:20},(_, i)=>({id:'s'+i,name:'SUPPLIER '+i})));
  if (p.endsWith('/tags') || p.endsWith('/suppliers')) return page([]);
  if (p.endsWith('/organizationalUnits')) return page([{ id: 'ou1' }]);
  if (p.endsWith('/productStocks')) return page([{ product: { id: 'p1' }, amount: { actual: 5 } }]);
  if (p.endsWith('/products') && m === 'GET' && process.env.FAKE_N) { const n = +process.env.FAKE_N, a = []; for (let i = 0; i < n; i++) a.push({ id: 'p' + i, number: String(1000 + i), name: 'PRODUCT NUMBER ' + i + ' 12PK CAN', codes: [{ productCode: String(100000000000 + i) }], commodityGroup: { id: 'g1' }, prices: [{ value: 3.99 }], supplierPrices: [{ orderCode: 'C' + i, containerSize: 12, value: 1.95, supplier: { id: 's' + (i % 20) } }], revision: 7 + i }); return page(a); }
  if (p.endsWith('/products') && m === 'GET') return page([{ id: 'p1', number: '100', name: 'FRITO TEST', codes: [{ productCode: '028400769266' }], commodityGroup: { id: 'g1' }, prices: [{ value: 3.99 }], supplierPrices: [{ orderCode: '00046167', containerSize: 1, value: 1.95 }], revision: 7 }]);
  if (p.endsWith('/receipts') || p.endsWith('/giftCards') || p.endsWith('/vouchers') || p.endsWith('/promotions') || p.endsWith('/discounts')) return page([]);
  if (p.endsWith('/stockReceipts') && m === 'POST') { const id = 'r' + (++rcvN); rcv[id] = { id, number: '1000' + rcvN, status: 'IN_PROGRESS', body: JSON.parse(o.body)[0] }; return J([{ id }], 201); }
  if (/\/stockReceipts\/[^/]+\/items$/.test(p) && m === 'POST') { return J([{}], 201); }
  if (/\/stockReceipts\/[^/]+$/.test(p) && m === 'GET') { const id = p.split('/').pop(); return J({ id, number: rcv[id].number, status: 'IN_PROGRESS' }); }
  if (p.endsWith('/accounts')) return page([{ id: 'acc1' }]);
  return J({ error: 'fake: not handled ' + m + ' ' + p }, 404);
};
const office = (await import(root + '/netlify/functions/office.mjs')).default;
const bg = (await import(root + '/netlify/functions/office-job-background.mjs')).default;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
http.createServer(async (rq, rs) => {
  const url = new URL(rq.url, 'http://x'); const chunks = []; for await (const c of rq) chunks.push(c); const body = Buffer.concat(chunks);
  const mk = () => new Request('http://x' + rq.url, { method: rq.method, headers: rq.headers, body: rq.method === 'GET' ? undefined : body });
  if (url.pathname === '/api/office') { const r = await office(mk()); rs.writeHead(r.status, { 'content-type': 'application/json' }); return rs.end(await r.text()); }
  if (url.pathname === '/.netlify/functions/office-job-background') { bg(mk()).catch((e) => console.error('BG', e)); rs.writeHead(202); return rs.end(); }
  if (url.pathname === '/__log') { rs.writeHead(200); return rs.end(JSON.stringify(log)); }
  let f = path.join(root, 'public', url.pathname); if (!f.startsWith(path.join(root, 'public'))) { rs.writeHead(403); return rs.end(); }
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('no'); }
  rs.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); rs.end(fs.readFileSync(f));
}).listen(8899, () => console.log('up'));
