// Notification delivery via the standard Web Push API, replacing the old
// Resend-email workaround (see git history for backend/lib/resendEmail.ts) —
// that workaround existed only because real APNs push needs a paid Apple
// Developer Program membership, which a web app never needs at all. Free,
// no account beyond generating a VAPID keypair yourself (`npx web-push
// generate-vapid-keys` — see README), and it sends straight to the specific
// device whose watch fired instead of one fixed address.

import webpush from "web-push";
import { supabaseAdmin } from "./supabaseAdmin.js";

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT;

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!publicKey || !privateKey || !subject) {
    console.warn(
      "[webPush] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT not set — skipping push send",
    );
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body: string; url?: string };

/** Sends one push message to whatever subscription (if any) this device_id has registered. */
export async function sendPushToDevice(deviceId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  const { data, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    console.error(`[webPush] failed to look up subscription for ${deviceId}:`, error);
    return;
  }
  if (!data) {
    console.log(`[webPush] no push subscription for device ${deviceId} — skipping (notifications are opt-in)`);
    return;
  }

  const subscription = {
    endpoint: data.endpoint as string,
    keys: { p256dh: data.p256dh as string, auth: data.auth as string },
  };

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    console.log(`[webPush] sent to device ${deviceId}: "${payload.title}"`);
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      // Subscription expired or was revoked by the browser — clean it up so
      // future runs stop trying it.
      console.warn(`[webPush] subscription for ${deviceId} is gone (${statusCode}), deleting it`);
      await supabaseAdmin.from("push_subscriptions").delete().eq("device_id", deviceId);
    } else {
      console.error(`[webPush] send failed for ${deviceId}:`, err);
    }
  }
}
