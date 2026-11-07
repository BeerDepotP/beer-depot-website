/* Employee Scheduler service worker.  Lives at /food-stock/sw.js, so it controls /food-stock/ only.
   - Installs and activates right away.
   - Shows a system notification for every push it receives.
   - Tapping a notification opens or focuses the scheduler.

   PUSH PROVIDER SWITCH
   - USE_ONESIGNAL = false : this file handles the push itself (Firebase Cloud Messaging or any standard Web Push).
   - USE_ONESIGNAL = true  : OneSignal's own worker code is loaded and shows the notifications for you.
     (Two workers cannot share one folder, so OneSignal is loaded INSIDE this file instead of a second file.) */
const USE_ONESIGNAL = true;

const APP_URL = "/food-stock/";
const ICON = "/img/icon-192.png";
const BADGE = "/img/notify-badge.png";

if (USE_ONESIGNAL) importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

if (!USE_ONESIGNAL) {
  self.addEventListener("push", event => {
    let d = {};
    try { d = event.data ? event.data.json() : {}; }
    catch (_) { d = { body: event.data ? event.data.text() : "" }; }
    const n = d.notification || d.data || d;                       // plain, FCM and wrapped payloads
    const title = n.title || "Employee Scheduler";
    event.waitUntil(self.registration.showNotification(title, {
      body: n.body || n.message || "Open the app to see what changed.",
      icon: n.icon || ICON,
      badge: BADGE,
      tag: n.tag || undefined,                                     // same tag = replaces the older one
      data: { url: n.url || n.click_action || APP_URL }
    }));
  });
}

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || APP_URL, self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).pathname.startsWith(APP_URL)) { await w.focus(); if ("navigate" in w && w.url !== url) { try { await w.navigate(url); } catch (_) {} } return; }
    }
    await self.clients.openWindow(url);
  })());
});
