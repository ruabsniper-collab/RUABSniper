import { traceNotification } from "./notificationTrace";

const NAV_CACHE = "ruab-notification-navigation-v1";
const NAV_PATH = "/__ruab_notification_navigation__";
const NAV_TTL_MS = 120_000;

type NavigationIntent = { id: string; url: string; clickedAt: number };

async function readPendingIntent(): Promise<unknown> {
  const cache = await caches.open(NAV_CACHE);
  return (await cache.match(new URL(NAV_PATH, window.location.origin).href))?.json();
}

function validIntent(value: unknown): NavigationIntent | null {
  if (!value || typeof value !== "object") return null;
  const intent = value as Partial<NavigationIntent>;
  if (typeof intent.id !== "string" || typeof intent.url !== "string" || typeof intent.clickedAt !== "number") return null;
  const age = Date.now() - intent.clickedAt;
  if (!Number.isFinite(age) || age < 0 || age > NAV_TTL_MS) return null;
  try {
    const url = new URL(intent.url, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== "/register" || !/^\d{1,6}$/.test(url.searchParams.get("index") ?? "")) return null;
    return { id: intent.id, url: url.pathname + url.search, clickedAt: intent.clickedAt };
  } catch { return null; }
}

// Recover before mounting tabs if the installed app launches at home.
export async function restoreNotificationOnLaunch(): Promise<void> {
  if (!("caches" in window)) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = readPendingIntent().catch(() => null);
    const intent = validIntent(await Promise.race([
      read,
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 150); }),
    ]));
    if (intent) window.history.replaceState(null, "", intent.url);
  } catch {
    // Storage restrictions must never prevent the app from rendering.
  } finally { clearTimeout(timer); }
}

export function installNotificationNavigation(navigate: (url: string) => void): () => void {
  if (!("serviceWorker" in navigator)) return () => {};
  let disposed = false;
  let latestId: string | null = null;
  let latestClickedAt = -Infinity;
  const handled = new Set<string>();
  let reading = false;
  const cleanups = new Set<() => void>();
  const acknowledge = (intent: NavigationIntent, worker: ServiceWorker | null, reply?: MessagePort) => {
    const message = { type: "RUAB_NOTIFICATION_ACK", id: intent.id };
    let posted = false;
    try { if (worker) { worker.postMessage(message); posted = true; } } catch {}
    if (!posted) void navigator.serviceWorker.getRegistration().then((registration) => registration?.active?.postMessage(message)).catch(() => {});
    reply?.postMessage({ handled: true, id: intent.id });
    traceNotification("app-ack", intent.url);
  };
  const receive = (value: unknown, worker: ServiceWorker | null, reply?: MessagePort, recovery = false) => {
    const intent = validIntent(value);
    if (disposed || !intent) return;
    if (handled.has(intent.id)) { acknowledge(intent, worker, reply); return; }
    if (intent.clickedAt < latestClickedAt ||
        (recovery && intent.clickedAt === latestClickedAt && latestId !== null && latestId !== intent.id)) return;
    latestId = intent.id;
    latestClickedAt = intent.clickedAt;
    traceNotification("app-inbox", intent.url);
    if (window.location.pathname + window.location.search !== intent.url) navigate(intent.url);
    // Let the router render the section before acknowledging the tap.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (disposed || latestId !== intent.id) return;
      handled.add(intent.id);
      acknowledge(intent, worker, reply);
    }));
  };
  const onMessage = (event: MessageEvent) => {
    if (event.data?.type === "RUAB_NOTIFICATION_NAVIGATE") {
      receive(event.data.intent, event.source as ServiceWorker | null, event.ports[0]);
    }
  };
  const recoverLocal = () => {
    if (disposed || reading) return;
    reading = true;
    void readPendingIntent().then((value) => receive(value, navigator.serviceWorker.controller, undefined, true))
      .catch(() => {}).finally(() => { reading = false; });
  };
  const recover = () => {
    if (disposed || document.visibilityState !== "visible") return;
    recoverLocal();
    void navigator.serviceWorker.ready.then((registration) => {
      if (disposed) return;
      const worker = registration.active ?? navigator.serviceWorker.controller;
      if (!worker) return;
      const channel = new MessageChannel();
      const finish = () => { clearTimeout(timer); channel.port1.close(); cleanups.delete(finish); };
      const timer = setTimeout(finish, 1_500);
      cleanups.add(finish);
      channel.port1.onmessage = (event) => {
        receive(event.data?.intent, worker, undefined, true);
        finish();
      };
      worker.postMessage({ type: "RUAB_NOTIFICATION_GET" }, [channel.port2]);
    }).catch(() => {});
  };
  navigator.serviceWorker.addEventListener("message", onMessage);
  navigator.serviceWorker.addEventListener("controllerchange", recover);
  document.addEventListener("visibilitychange", recover);
  window.addEventListener("focus", recover);
  window.addEventListener("pageshow", recover);
  // A resumed installed app can miss events or retain stale visibility.
  // This is only a local inbox read; background tabs naturally throttle it.
  const inboxInterval = setInterval(recoverLocal, 1_000);
  recover();
  return () => {
    disposed = true;
    navigator.serviceWorker.removeEventListener("message", onMessage);
    navigator.serviceWorker.removeEventListener("controllerchange", recover);
    document.removeEventListener("visibilitychange", recover);
    window.removeEventListener("focus", recover);
    window.removeEventListener("pageshow", recover);
    clearInterval(inboxInterval);
    cleanups.forEach((finish) => finish());
    cleanups.clear();
  };
}
