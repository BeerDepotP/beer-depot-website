// Back Office storage helpers (shared by office.mjs and office-job-background.mjs).
// POS data keys are saved as text in Blobs "beer-depot-office", cut into 3 MB pieces so big lists fit in one request.
import { getStore } from "@netlify/blobs";

export const CHUNK = 3 * 1024 * 1024;
export const officeStore = () => getStore({ name: "beer-depot-office", consistency: "strong" });
export const pinStore = () => getStore({ name: "beer-depot", consistency: "strong" });
const safe = k => String(k || "").replace(/[^A-Za-z0-9_.\-]/g, "_").slice(0, 120);

export async function readIdx(st) { return (await st.get("_idx", { type: "json" })) || {}; }

export async function putChunk(st, key, i, n, text, len) {
  key = safe(key); i = Number(i) || 0; n = Math.max(1, Number(n) || 1);
  await st.set(`d/${key}/${i}`, String(text));
  if (i === n - 1) {
    const idx = await readIdx(st), old = idx[key] ? idx[key].n : 0;
    idx[key] = { n, len: Number(len) || 0, at: Date.now() };
    await st.setJSON("_idx", idx);
    for (let j = n; j < old; j++) await st.delete(`d/${key}/${j}`);
  }
}
export async function getChunk(st, key, i) { return (await st.get(`d/${safe(key)}/${Number(i) || 0}`)) || ""; }
export async function delKey(st, key) {
  key = safe(key); const idx = await readIdx(st), n = idx[key] ? idx[key].n : 0;
  for (let j = 0; j < n; j++) await st.delete(`d/${key}/${j}`);
  delete idx[key]; await st.setJSON("_idx", idx);
}

// Jobs: long work (reading a photo, syncing KORONA) runs in a background function. Input and result are cut into pieces too.
export async function putJobPiece(st, id, part, i, text) { await st.set(`job/${safe(id)}/${part}/${Number(i) || 0}`, String(text)); }
export async function getJobPiece(st, id, part, i) { return (await st.get(`job/${safe(id)}/${part}/${Number(i) || 0}`)) || ""; }
export async function setJobMeta(st, id, meta) { await st.setJSON(`job/${safe(id)}/meta`, Object.assign({ at: Date.now() }, meta)); }
export async function getJobMeta(st, id) { return await st.get(`job/${safe(id)}/meta`, { type: "json" }); }
export async function putJobResult(st, id, text) {
  const n = Math.max(1, Math.ceil(text.length / CHUNK));
  for (let i = 0; i < n; i++) await putJobPiece(st, id, "out", i, text.slice(i * CHUNK, (i + 1) * CHUNK));
  return n;
}
export async function dropJob(st, id) {
  const meta = await getJobMeta(st, id); id = safe(id);
  for (let i = 0; i < ((meta && meta.n) || 0); i++) await st.delete(`job/${id}/out/${i}`);
  for (let i = 0; i < ((meta && meta.inN) || 0); i++) await st.delete(`job/${id}/in/${i}`);
  await st.delete(`job/${id}/meta`);
}
export const okId = id => /^[A-Za-z0-9_-]{8,60}$/.test(String(id || ""));
