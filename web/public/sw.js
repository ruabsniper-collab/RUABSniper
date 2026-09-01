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

  // The app's own Register page for this exact section is the one
  // destination -- "Open WebReg" is right there ready to tap (see
  // SectionRow.tsx, which only shows that button once a section is open,
  // which this notification means it just became). Also opening WebReg
  // itself directly was tried and dropped: verified live on iOS, Safari
  // only honors one clients.openWindow() call per notification tap and
  // picked WebReg over this one.
  //
  // openWindow() alone isn't enough either, though: verified live again,
  // when the app was already running in the background, tapping the
  // notification just resumed it showing whatever page it already had
  // open (Search) -- openWindow() doesn't force an existing same-scope
  // PWA instance to actually navigate anywhere on iOS, it just focuses it.
  // WindowClient.navigate() is the API actually meant for this: a service
  // worker pushing an *existing* window to a new URL directly, no
  // dependency on that page's own JS cooperating (unlike the postMessage
  // approach tried earlier, which needs the page to still be alive enough
  // to receive and act on a message -- also unreliable, likely for the
  // same "backgrounded/suspended" reason).
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = clientList.find((c) => "navigate" in c);
      if (existing) {
        await existing.navigate(targetUrl);
        await existing.focus();
      } else {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
