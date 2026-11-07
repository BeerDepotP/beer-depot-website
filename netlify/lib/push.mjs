// Push notifications for the Employee Scheduler, sent through OneSignal's REST API.
// Needs the Netlify variable ONESIGNAL_API_KEY (the REST API Key from OneSignal → Settings → API keys and IDs).
// Each person is matched by their OneSignal "external id": "owner" for the owner PIN, or the staff id for a staff PIN
// (the website calls OneSignal.login(...) with that id after sign-in). Best effort: a failed push never breaks the schedule.

export const ONESIGNAL_APP_ID = "e59380ac-42e7-46f8-97c7-7da768e2e8e2";
const LINK = "https://beerdepotpewaukee.com/food-stock/#schedule";
const ICON = "https://beerdepotpewaukee.com/img/icon-192.png";          // the Beer Depot logo (the picture on the right of an Android notification)
const BADGE = "https://beerdepotpewaukee.com/img/notify-badge.png";    // small white logo in the phone's top bar

// The alerts. {who} {shift} {other} {answer} are filled in; the owner can reword and switch each one off.
export const ALERTS = {
  swapAsk:      { label: "Swap request",        who: "The coworker asked to swap with",       title: "{who} wants to swap shifts", body: "They would work your {shift} and you would work their {other}. Open the app to say yes or no." },
  swapAnswer:   { label: "Swap answered",       who: "The person who asked for the swap",     title: "{who} said {answer} to your swap", body: "Your swap request for {shift} was answered." },
  giveOut:      { label: "Shift given away",    who: "Everyone else on the schedule",         title: "Shift up for grabs", body: "{who} is giving away {shift}. Open the app to take it." },
  needsOk:      { label: "Needs your OK",       who: "The owner and Managers",                title: "A shift change needs your OK", body: "{who} wants to take {shift}. Open the app to OK or deny it." },
  shiftChanged: { label: "Your shift changed",  who: "The person whose shift was changed",    title: "Your schedule changed", body: "{who} updated your shifts: {shift}." },
  monthReady:   { label: "Month schedule is done", who: "Everyone on the schedule",             title: "{month} schedule is ready", body: "The {month} schedule is done. Open the app to see your shifts." },
  timecardMissing: { label: "Timecard missing before payday", who: "Anyone being paid that Friday who has not sent a timecard", title: "Send your timecard", body: "You get paid {payday}, but you haven't sent your hours for {shift}. Open the app to enter them." },
  openShift:    { label: "Open shift posted",   who: "Everyone on the schedule",              title: "New open shift", body: "Open shift: {shift}. Open the app to take it." },
};

export function alertSettings(s) {
  const n = (s && typeof s === "object") ? s : {};
  const out = { on: n.on !== false, hold: n.hold !== false, kinds: {} };   // hold = manager schedule edits wait for "Confirm Schedule"
  for (const [k, def] of Object.entries(ALERTS)) {
    const c = (n.kinds && n.kinds[k]) || {};
    out.kinds[k] = {
      on: c.on !== false,
      title: String(c.title || "").replace(/\s+/g, " ").trim().slice(0, 80) || def.title,
      body: String(c.body || "").replace(/\s+/g, " ").trim().slice(0, 200) || def.body,
    };
  }
  return out;
}

const fill = (t, tokens) => String(t).replace(/\{(\w+)\}/g, (_, k) => (tokens[k] != null ? tokens[k] : ""));

// Build one message for a kind using the saved wording. Returns null when that alert (or all alerts) is switched off.
export function buildAlert(settings, kind, tokens) {
  const a = alertSettings(settings);
  if (!a.on || !a.kinds[kind] || !a.kinds[kind].on) return null;
  return { title: fill(a.kinds[kind].title, tokens), body: fill(a.kinds[kind].body, tokens) };
}

// to = array of external ids. Returns true when OneSignal accepted it.
export async function sendPush(to, title, body) {
  const key = (typeof process !== "undefined" && process.env && process.env.ONESIGNAL_API_KEY) || (typeof Netlify !== "undefined" && Netlify.env && Netlify.env.get("ONESIGNAL_API_KEY"));
  const ids = [...new Set((to || []).filter(Boolean).map(String))];
  if (!key || !ids.length) return false;
  try {
    const r = await fetch("https://api.onesignal.com/notifications?c=push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Key " + key },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        target_channel: "push",
        include_aliases: { external_id: ids },
        headings: { en: title },
        contents: { en: body },
        url: LINK,
        chrome_web_icon: ICON,
        chrome_web_badge: BADGE,
        firefox_icon: ICON,
      }),
    });
    if (!r.ok) console.error("onesignal", r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (e) { console.error("onesignal", e); return false; }
}
