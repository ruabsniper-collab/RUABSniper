// Service worker for Web Push. Deliberately plain JS, not built by Vite —
// this is registered as a static file at /sw.js (see src/lib/push.ts) so its
// URL never changes across deploys. Only handles push delivery + tapping a
// notification; no offline caching, since this app always wants fresh
// course/seat data over a stale cache.

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

// Focus an already-open tab if there is one, otherwise open a new one — this
// is why the app's origin matters, not the specific path baked into `url`,
// since most useful landings (Watches) are a single-page-app route anyway.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.postMessage({ type: "navigate", url: targetUrl });
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
