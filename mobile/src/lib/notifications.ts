import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { registerPushToken } from "./watches";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests permission and registers this device's Expo push token with our
 * backend, so the GitHub Actions poller (backend/scripts/poll-and-notify.ts)
 * can reach it. Safe to call repeatedly (e.g. on every app launch).
 */
export async function registerForPushNotificationsAsync(): Promise<{ ok: boolean; reason?: string }> {
  if (!Device.isDevice) {
    return { ok: false, reason: "Push notifications require a physical device, not a simulator." };
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") {
    return { ok: false, reason: "Notification permission was not granted." };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

  await registerPushToken(tokenResponse.data);
  return { ok: true };
}
