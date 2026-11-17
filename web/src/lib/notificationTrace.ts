import { APP_VERSION } from "./appVersion";

const reported = new Set<string>();

// Only explicitly labeled test links emit diagnostics. No subscription,
// device id, account information, or notification endpoint is transmitted.
export function traceNotification(event: string, destination: string): void {
  try {
    const target = new URL(destination, window.location.origin);
    const trace = target.searchParams.get("notificationTest");
    if (!trace || !/^[a-f0-9-]{36}$/.test(trace) || reported.has(`${event}:${trace}`)) return;
    reported.add(`${event}:${trace}`);
    const query = new URLSearchParams({ event, trace, index: target.searchParams.get("index") ?? "", version: APP_VERSION });
    void fetch(`/api/notification-events?${query}`, { cache: "no-store", keepalive: true }).catch(() => {});
  } catch { /* Diagnostics must never delay registration. */ }
}
