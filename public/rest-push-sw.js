/* Rest alerts for the Setstamp service worker. Loaded into the generated worker with
   workbox.importScripts (vite.config.ts), resolved next to sw.js, so it works under /setstamp/.
   Payload comes from convex/pushSend.ts: { type: "rest-over", title, body, endsAt }. */
/* eslint-env serviceworker */

const REST_TAG = "setstamp-rest"; // same tag as the in-page fallback (src/features/workout/restPush.ts)

// Apple's push services revoke subscriptions that receive pushes without a visible notification.
const MUST_SHOW = /iPhone|iPad|Macintosh/.test(self.navigator.userAgent) && !/Chrome|CriOS|Firefox|Edg/.test(self.navigator.userAgent);

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  if (data.type && data.type !== "rest-over") return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // The app is on screen: its own "Rest over" bar and chime already cover it.
      if (!MUST_SHOW && windows.some((c) => c.visibilityState === "visible")) return;
      await self.registration.showNotification(data.title || "Rest over", {
        body: data.body || "Time for your next set.",
        tag: REST_TAG,
        renotify: true,
        icon: new URL("icons/icon-192.png", self.registration.scope).href,
        vibrate: [220, 120, 220, 120, 220],
        timestamp: typeof data.endsAt === "number" ? data.endsAt : Date.now(),
        data: { url: self.registration.scope },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  if (event.notification.tag !== REST_TAG) return;
  event.notification.close();
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope;
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((c) => c.url.startsWith(scope));
      if (open) {
        await open.focus();
        return;
      }
      await self.clients.openWindow(`${scope}?source=pwa#/workout`);
    })(),
  );
});
