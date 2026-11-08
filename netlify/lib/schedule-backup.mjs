// Nightly safety copy of the schedule (shifts, timecards, pay, settings) and the staff list. Kept 14 days in Blobs "schedule-backup-YYYY-MM-DD".
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const BACKUP_KEEP = 14;

export async function backupNow(store) {
  const schedule = await store.get("schedule", { type: "json" });
  if (!schedule) return null;   // nothing saved yet
  const staff = await store.get("staff", { type: "json" });
  const day = todayStr();
  await store.setJSON("schedule-backup-" + day, { day, at: new Date().toISOString(), schedule, staff: staff || null });
  if (store.list && store.delete) {
    const { blobs } = await store.list({ prefix: "schedule-backup-" });
    const keys = (blobs || []).map(x => x.key).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - BACKUP_KEEP))) await store.delete(k);
  }
  return day;
}

export async function lastBackup(store) {
  if (!store.list) return "";
  const { blobs } = await store.list({ prefix: "schedule-backup-" });
  const keys = (blobs || []).map(x => x.key).sort();
  return keys.length ? keys[keys.length - 1].replace("schedule-backup-", "") : "";
}

export async function listBackups(store) {   // newest first
  if (!store.list) return [];
  const { blobs } = await store.list({ prefix: "schedule-backup-" });
  return (blobs || []).map(x => x.key.replace("schedule-backup-", "")).sort().reverse();
}
