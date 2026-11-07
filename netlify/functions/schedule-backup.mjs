// Every night (about 3 AM store time): save a copy of the schedule + staff list, keep the last 14 days.
import { getStore } from "@netlify/blobs";
import { backupNow } from "../lib/schedule-backup.mjs";
export default async () => { try { const day = await backupNow(getStore({ name: "beer-depot", consistency: "strong" })); if (day) console.log("Schedule backup saved:", day); } catch (e) { console.error("schedule backup", e); } };
export const config = { schedule: "0 9 * * *" };
