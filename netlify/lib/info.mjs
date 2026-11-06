// Store phone and address (edited in Store Tools → Banners & Text → Store Info; Blob "site".info).
export const DEFAULT_INFO = { phone: "262-696-4602", address: "N27 W26 N26980 Prospect Ave, Pewaukee, WI 53072" };
export const telOf = phone => "tel:+1" + String(phone).replace(/\D/g, "");
export async function storeInfo(store) {
  try { return { ...DEFAULT_INFO, ...(((await store.get("site", { type: "json" })) || {}).info || {}) }; } catch { return { ...DEFAULT_INFO }; }
}
export async function siteSettings(store) {
  try { return { newDays: 14, thcUntil: "2026-12-11", ...(((await store.get("site", { type: "json" })) || {}).settings || {}) }; } catch { return { newDays: 14 }; }
}
