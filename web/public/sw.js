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

// Every notification this app sends means "a seat just opened, go register"
// (see backend/scripts/poll-and-notify.ts — it's the only sender), so
// tapping it opens WebReg directly too, not just the app's own Register
// page — no extra tap on that page's "Open WebReg" button needed. A page
// can't pop a window open on its own (popup blockers everywhere, Safari
// especially), but a service worker responding to an actual notification
// tap is explicitly allowed to via clients.openWindow(), which is why this
// happens here rather than as a useEffect on the Register page itself.
const WEBREG_URL = "https://sims.rutgers.edu/webreg/";

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  // Always open a fresh window at the target URL rather than trying to
  // reuse/focus + postMessage an already-open tab -- verified live, that
  // path was unreliable (reported: tapping the notification just resumed
  // whatever page was already open instead of navigating to the sniped
  // course). Almost certainly iOS suspending a backgrounded PWA tab and
  // never actually delivering the postMessage to it. clients.openWindow()
  // is a plain, well-supported "make this URL appear," so this trades a
  // possible extra tab for navigation that's guaranteed to actually happen.
  event.waitUntil(
    (async () => {
      await self.clients.openWindow(targetUrl);
      // Opened last so it ends up front-and-center — the actual next step
      // is on WebReg's side, not ours.
      await self.clients.openWindow(WEBREG_URL);
    })(),
  );
});
