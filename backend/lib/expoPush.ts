// Minimal client for Expo's push notification HTTP API. Expo wraps APNs for
// us, so nothing Apple-specific (certs/keys) lives in this repo — those are
// managed by EAS on the mobile app side.
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type ExpoPushMessage = {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default";
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
  for (const batch of chunk(messages, 100)) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      console.error(`[expoPush] ${res.status} ${res.statusText}:`, await res.text());
      continue;
    }
    const json = await res.json();
    console.log(`[expoPush] sent batch of ${batch.length}:`, JSON.stringify(json));
  }
}
