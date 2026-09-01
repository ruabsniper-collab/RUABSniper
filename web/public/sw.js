// Service worker for Web Push. Deliberately plain JS, not built by Vite —
// this is registered as a static file at /sw.js (see src/lib/push.ts) so its
// URL never changes across deploys. Only handles push delivery + tapping a
// notification; no offline caching, since this app always wants fresh
// course/seat data over a stale cache.

// Without these, a browser's default service worker lifecycle leaves a new
// sw.js "waiting" until every open tab of the old one is fully closed
// before it activates -- meaning a fix shipped here might not actually take
// effect for someone with the PWA already open until they close and reopen
// it. skipWaiting + clients.claim make a newly-deployed worker take over
// immediately instead.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "RUAB Sniper", body: "A watched section changed.", url: "/watches" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload (shouldn't happen — backend/lib/webPush.ts always sends JSON) — fall back
    // to the defaults above rather than dropping the notification silently.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.png",
      badge: "/icon.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  // Just the one destination: the app's own Register page for this exact
  // section, where "Open WebReg" is right there ready to tap (see
  // SectionRow.tsx — it only shows that button once a section is open,
  // which this notification means it just became). Tried also opening
  // WebReg itself directly in a second tab; verified live on iOS that
  // Safari only honors one clients.openWindow() call per notification tap
  // and picked WebReg over this one, which isn't what was asked for.
  // Always a *fresh* window rather than trying to reuse/focus + postMessage
  // an already-open tab -- verified live, that path was unreliable too
  // (tapping the notification just resumed whatever page was already open).
  event.waitUntil(self.clients.openWindow(targetUrl));
});
