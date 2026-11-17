// Push delivery and exact-section navigation. Cache Storage holds only a
// short-lived notification-tap intent, never cached course/seat responses.
const NAV_CACHE = "ruab-notification-navigation-v1";
const NAV_KEY = new URL("/__ruab_notification_navigation__", self.location.origin).href;
const NAV_TTL_MS = 120_000;
const NAV_VERSION = "2026.11.17.2";
let navigationWork = Promise.resolve();
let latestClickId;
function navigationStore(work) {
  const result = navigationWork.then(async () => work(await caches.open(NAV_CACHE)));
  navigationWork = result.catch(() => {});
  return result;
}
function targetUrl(value) {
  try {
    const url = new URL(value || "/watches", self.location.origin);
    if (url.origin !== self.location.origin) return new URL("/watches", self.location.origin);
    if (url.pathname === "/register" && !/^\d{1,6}$/.test(url.searchParams.get("index") || "")) return new URL("/watches", self.location.origin);
    return url;
  } catch { return new URL("/watches", self.location.origin); }
}
function traceTest(event, target) {
  const trace = target.searchParams.get("notificationTest");
  if (!trace || !/^[a-f0-9-]{36}$/.test(trace) || typeof fetch !== "function") return Promise.resolve();
  const query = new URLSearchParams({ event, trace, index: target.searchParams.get("index") || "", version: NAV_VERSION });
  return fetch(new URL(`/api/notification-events?${query}`, self.location.origin), { cache: "no-store" }).catch(() => {});
}
async function pendingNavigation(cache) {
  const response = await cache.match(NAV_KEY);
  if (!response) return null;
  const intent = await response.json();
  const age = Date.now() - intent.clickedAt;
  if (!Number.isFinite(age) || age < 0 || age > NAV_TTL_MS) {
    await cache.delete(NAV_KEY);
    return null;
  }
  return intent;
}
// A late acknowledgement must not erase a newer notification tap.
self.addEventListener("message", (event) => {
  if (event.data?.type === "RUAB_NOTIFICATION_GET") {
    event.waitUntil(navigationStore(pendingNavigation)
      .then((intent) => event.ports[0]?.postMessage({ intent }))
      .catch(() => event.ports[0]?.postMessage({ intent: null })));
  } else if (event.data?.type === "RUAB_NOTIFICATION_ACK") {
    event.waitUntil(navigationStore(async (cache) => {
      const intent = await pendingNavigation(cache);
      if (intent?.id === event.data.id) await cache.delete(NAV_KEY);
    }));
  }
});
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  let data = { title: "RUAB Sniper", body: "A watched section changed.", url: "/watches" };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch {}
  const target = targetUrl(data.url);
  const title = target.searchParams.has("notificationTest") ? `${data.title} · updated` : data.title;
  event.waitUntil(traceTest("sw-push", target));
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body, icon: "/icon.png", badge: "/icon.png",
    data: { url: target.href }, tag: `ruab:${target.href}`,
  }));
});
function navigateInApp(client, intent) {
  const channel = new MessageChannel();
  return new Promise((resolve) => {
    const finish = (handled) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(handled);
    };
    const timer = setTimeout(() => finish(false), 200);
    channel.port1.onmessage = (event) => finish(event.data?.handled === true && event.data.id === intent.id);
    try {
      client.postMessage({ type: "RUAB_NOTIFICATION_NAVIGATE", intent }, [channel.port2]);
      void client.focus().catch(() => {});
    } catch { finish(false); }
  });
}
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const tagUrl = event.notification.tag?.startsWith("ruab:") ? event.notification.tag.slice(5) : undefined;
  const target = targetUrl(event.notification.data?.url || tagUrl);
  const traces = [traceTest(event.notification.data?.url ? "sw-click-data" : "sw-click-tag", target)];
  const record = (step) => { traces.push(traceTest(step, target)); };
  const intent = { id: crypto.randomUUID(), url: target.href, clickedAt: Date.now() };
  latestClickId = intent.id;
  event.waitUntil((async () => {
    try {
      // Some installed-app launches resume at the manifest's home URL.
      // Save the section so bootstrap/foreground handling can recover it.
      const [, windows] = await Promise.all([
        target.pathname === "/register"
          ? navigationStore((cache) => cache.put(NAV_KEY, new Response(JSON.stringify(intent))))
            .then(() => { record("sw-stored"); }).catch(() => {})
          : Promise.resolve(),
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).catch(() => []),
      ]);
      if (latestClickId !== intent.id) return;
      const existing = windows.find((client) => client.focused) || windows.find((client) => "navigate" in client);
      if (existing) {
        record("sw-client");
        if (target.pathname === "/register" && await navigateInApp(existing, intent)) return;
        if (latestClickId !== intent.id) return;
        try {
          const navigated = await existing.navigate(target.href);
          if (navigated) { record("sw-navigated"); await navigated.focus(); return; }
        } catch { record("sw-navigation-failed"); }
      }
      if (latestClickId === intent.id) {
        await self.clients.openWindow(target.href);
        record("sw-opened");
      }
    } finally { await Promise.allSettled(traces); }
  })());
});
