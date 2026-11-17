// Long Back Office jobs (reading an invoice photo, syncing from KORONA). Netlify answers at once and lets this run up to 15 minutes;
// the page asks /api/office job-status until the result is saved.
// POST /.netlify/functions/office-job-background { pin, id, kind:"inv-read"|"kor-pull"|"kor-receipts"|"kor-gift", arg }
import { checkPin } from "../lib/pin.mjs";
import { makeKorona } from "../lib/office-kor.mjs";
import { makeInvoice } from "../lib/office-inv.mjs";
import { officeStore, pinStore, setJobMeta, getJobPiece, putJobResult, okId } from "../lib/office-store.mjs";

export default async (req) => {
  let b; try { b = await req.json(); } catch { return; }
  const bad = await checkPin(pinStore(), b.pin, "owner");
  if (bad || !okId(b.id)) return;
  const st = officeStore(), id = b.id;
  await setJobMeta(st, id, { state: "running", inN: b.inN || 0 });
  try {
    let out;
    const k = makeKorona({ fetch });
    if (b.kind === "inv-read") {
      let b64 = ""; for (let i = 0; i < (b.inN || 1); i++) b64 += await getJobPiece(st, id, "in", i);
      const arg = b.arg || {};
      out = { ok: true, data: await makeInvoice({ fetch }).read(b64, arg.mediaType, arg.extra) };
    } else if (b.kind === "kor-pull") out = { ok: true, data: await k.pull(b.arg || {}) };
    else if (b.kind === "kor-receipts") out = { ok: true, data: await k.pullReceipts(b.arg || {}) };
    else if (b.kind === "kor-gift") out = { ok: true, data: await k.pullGiftCards() };
    else throw new Error("Unknown job.");
    const n = await putJobResult(st, id, JSON.stringify(out));
    await setJobMeta(st, id, { state: "done", n, inN: b.inN || 0 });
  } catch (e) {
    const n = await putJobResult(st, id, JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
    await setJobMeta(st, id, { state: "done", n, inN: b.inN || 0 });
  }
};
