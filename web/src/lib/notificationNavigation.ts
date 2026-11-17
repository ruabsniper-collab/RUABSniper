const NAV_CACHE = "ruab-notification-navigation-v1";
const NAV_PATH = "/__ruab_notification_navigation__";
const NAV_TTL_MS = 120_000;

type NavigationIntent = { id: string; url: string; clickedAt: number };

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
    const read = caches.open(NAV_CACHE)
      .then((cache) => cache.match(new URL(NAV_PATH, window.location.origin).href))
      .then((response) => response?.json()).catch(() => null);
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
  const cleanups = new Set<() => void>();
  const receive = (value: unknown, worker: ServiceWorker | null, reply?: MessagePort, recovery = false) => {
    const intent = validIntent(value);
    if (disposed || !intent) return;
    if (intent.clickedAt < latestClickedAt ||
        (recovery && intent.clickedAt === latestClickedAt && latestId !== null && latestId !== intent.id)) return;
    latestId = intent.id;
    latestClickedAt = intent.clickedAt;
    if (window.location.pathname + window.location.search !== intent.url) navigate(intent.url);
    // Let the router render the section before acknowledging the tap.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (disposed || latestId !== intent.id) return;
      worker?.postMessage({ type: "RUAB_NOTIFICATION_ACK", id: intent.id });
      reply?.postMessage({ handled: true, id: intent.id });
    }));
  };
  const onMessage = (event: MessageEvent) => {
    if (event.data?.type === "RUAB_NOTIFICATION_NAVIGATE") {
      receive(event.data.intent, event.source as ServiceWorker | null, event.ports[0]);
    }
  };
  const recover = () => {
    if (disposed || document.visibilityState !== "visible") return;
    void navigator.serviceWorker.ready.then((registration) => {
      if (disposed) return;
      const worker = navigator.serviceWorker.controller ?? registration.active;
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
  recover();
  return () => {
    disposed = true;
    navigator.serviceWorker.removeEventListener("message", onMessage);
    navigator.serviceWorker.removeEventListener("controllerchange", recover);
    document.removeEventListener("visibilitychange", recover);
    window.removeEventListener("focus", recover);
    cleanups.forEach((finish) => finish());
    cleanups.clear();
  };
}
