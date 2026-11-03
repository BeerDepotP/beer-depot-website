// Rebuilds the saved stock list every 10 minutes from about 6 AM to 10 PM Central,
// so the first visitor after a quiet stretch still gets recent stock instantly.
import { refreshSaved } from "./stock.mjs";

export default async () => {
  try { await refreshSaved(); } catch (e) { console.error("scheduled refresh", e); }
};

// Cron is in UTC: 11:00–03:59 UTC is roughly 6 AM–10 PM Central.
export const config = { schedule: "*/10 11-23,0-3 * * *" };
