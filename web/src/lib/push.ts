// Web Push subscribing — the replacement for the mobile app's email-via-
// Resend workaround (see backend/lib/webPush.ts for the sending side). No
// accounts here either: a subscription is just another row keyed by this
// browser's deviceId, same pattern as watches.ts.

import { supabase } from "./supabase";
import { getDeviceId } from "./deviceId";

export type PushStatus = "unsupported" | "denied" | "unsubscribed" | "subscribed";

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// PushManager.subscribe wants the VAPID public key as a raw Uint8Array, but
// it's handed out (by `npx web-push generate-vapid-keys`) as a URL-safe
// base64 string — this is the standard conversion between the two.
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.getRegistration();
  const existing = await registration?.pushManager.getSubscription();
  return existing ? "subscribed" : "unsubscribed";
}

/** Registers the service worker (idempotent) and returns its registration. */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js");
}

/**
 * Requests notification permission, subscribes to push, and upserts the
 * subscription into Supabase keyed by this device's id. Throws if the user
 * declines the permission prompt or the browser doesn't support push at all
 * — callers should catch and show that as a normal "couldn't enable" state,
 * not a crash.
 */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error("This browser doesn't support push notifications.");

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    throw new Error(
      "Missing VITE_VAPID_PUBLIC_KEY. Generate a keypair with `npx web-push generate-vapid-keys` " +
        "and add the public half to web/.env (see web/.env.example).",
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");

  const registration = await ensureServiceWorker();
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast needed because TS's DOM lib types Uint8Array generically over
      // ArrayBufferLike while PushManager.subscribe's BufferSource wants a
      // plain ArrayBuffer-backed view — the value itself is fine at runtime.
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    }));

  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      device_id: getDeviceId(),
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "device_id" },
  );
  if (error) throw error;
}

/** Unsubscribes locally and removes the row so the backend stops trying to send to it. */
export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
  await supabase.from("push_subscriptions").delete().eq("device_id", getDeviceId());
}

/**
 * Best-effort nudge for people who never noticed the Settings toggle or
 * dismissed the NotificationPrompt banner: called right after a watch is
 * added, it triggers the real permission prompt on the very first watch
 * someone ever adds (the moment "get notified" first becomes concretely
 * relevant), and does nothing on every watch after that. Never throws —
 * this is a courtesy on top of adding the watch, not part of it, so a
 * decline or an unsupported browser must never surface as an error on the
 * primary action.
 */
export async function maybePromptAfterAddingWatch(hadNoWatchesBefore: boolean): Promise<void> {
  if (!hadNoWatchesBefore) return;
  try {
    if ((await getPushStatus()) === "unsubscribed") await enablePush();
  } catch {
    // Declined, unsupported, or failed silently — same as if this function
    // was never called. The Settings tab and NotificationPrompt banner
    // remain available for anyone who wants to try again later.
  }
}
