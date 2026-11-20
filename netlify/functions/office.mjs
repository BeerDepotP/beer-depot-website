// Back Office (office.beerdepotpewaukee.com): the same Receive and Order screens as the Mac POS, running in a browser.
// Owner PIN only. POST /api/office { pin, action, ... }
//   load                      -> { keys:{name:text}, rest:[{key,n}] }       POS data (small keys inline, big ones fetched in pieces)
//   get {key,i} / put {key,i,n,len,text} / del {key}
//   kor {fn:"info"|"editInfo"|"editReq", arg}   KORONA calls that finish fast (editReq can only touch stock receipts and products, never book)
//   photo-put {id,b64} / photo-get {id}       invoice photos (own store, one small JPEG each)
//   inv-info                                    is the Anthropic key set up
//   job-in {id,i,text} / job-status {id} / job-get {id,i} / job-drop {id}   long jobs (run by office-job-background)
import { getStore } from "@netlify/blobs";
import { checkPin, json } from "../lib/pin.mjs";
import { makeKorona } from "../lib/office-kor.mjs";
import { makeInvoice } from "../lib/office-inv.mjs";
import { officeStore, pinStore, keyName, readIdx, putChunk, getChunk, delKey, putJobPiece, getJobPiece, getJobMeta, dropJob, okId } from "../lib/office-store.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const bad = await checkPin(pinStore(), b.pin, "owner");
  if (bad) return json({ error: bad.error }, bad.status);
  const st = officeStore(), a = b.action;
  try {
    if (a === "ping") return json({ ok: true });
    if (a === "versions") { const idx = await readIdx(st), v = {}; for (const k of Object.keys(idx)) v[k] = { at: idx[k].at || 0, n: idx[k].n, len: idx[k].len }; return json({ v }); }
    if (a === "load") {
      const idx = await readIdx(st), keys = {}, rest = []; let used = 0;
      for (const k of Object.keys(idx)) {
        const m = idx[k];
        if (m.n === 1 && used + m.len <= 4 * 1024 * 1024) { keys[k] = await getChunk(st, k, 0); used += m.len; }
        else rest.push({ key: k, n: m.n });
      }
      const at = {}; for (const k of Object.keys(idx)) at[k] = idx[k].at || 0;
      return json({ keys, rest, at });
    }
    if (a === "get") return json({ text: await getChunk(st, b.key, b.i) });
    if (a === "put") {
      // b.base = the version this device last saw. If someone else saved since, refuse (unless b.force) so nothing is overwritten quietly.
      if ((Number(b.i) || 0) === 0 && b.base != null && !b.force) {
        const idx = await readIdx(st), cur = (idx[keyName(b.key)] || {}).at || 0;
        if (cur !== Number(b.base)) return json({ conflict: true, at: cur, error: "Changed on another device." }, 409);
      }
      const at = await putChunk(st, b.key, b.i, b.n, b.text, b.len);
      return json({ ok: true, at });
    }
    if (a === "del") { await delKey(st, b.key); return json({ ok: true }); }
    if (a === "kor") {
      const k = makeKorona({ fetch });
      if (b.fn === "info") return json(k.info());
      if (b.fn === "editInfo") return json(k.editInfo());
      if (b.fn === "editReq") {
        try { return json(Object.assign({ error: "" }, await k.editRequest(b.arg))); }
        catch (e) { return json({ ok: false, status: 0, body: null, error: String(e.message || e) }); }
      }
      return json({ error: "Unknown." }, 400);
    }
    if (a === "photo-put") { // invoice photos: one small JPEG each, kept apart from the shared records
      if (!okId(b.id) || typeof b.b64 !== "string" || b.b64.length > 3 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(b.b64)) return json({ error: "Bad photo." }, 400);
      await getStore({ name: "beer-depot-photos", consistency: "strong" }).set(b.id, b.b64); return json({ ok: true });
    }
    if (a === "photo-get") {
      if (!okId(b.id)) return json({ error: "Bad photo." }, 400);
      const t = await getStore({ name: "beer-depot-photos", consistency: "strong" }).get(b.id); return t ? json({ b64: t }) : json({ error: "That photo is not on the website." }, 404);
    }
    if (a === "inv-info") return json(makeInvoice({ fetch }).info());
    if (a === "job-in") { if (!okId(b.id)) return json({ error: "Bad job." }, 400); await putJobPiece(st, b.id, "in", b.i, b.text); return json({ ok: true }); }
    if (a === "job-status") { if (!okId(b.id)) return json({ error: "Bad job." }, 400); return json((await getJobMeta(st, b.id)) || { state: "queued" }); }
    if (a === "job-get") { if (!okId(b.id)) return json({ error: "Bad job." }, 400); return json({ text: await getJobPiece(st, b.id, "out", b.i) }); }
    if (a === "job-drop") { if (okId(b.id)) await dropJob(st, b.id); return json({ ok: true }); }
    return json({ error: "Unknown." }, 400);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
};
export const config = { path: "/api/office" };
