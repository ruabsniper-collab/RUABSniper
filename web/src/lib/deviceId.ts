// A random per-browser identifier — the only "account" concept in this app.
// No login, no NetID, nothing that ties a watch or push subscription back to
// a real person beyond "whoever has this browser." See backend/supabase/
// migrations for how this is used server-side. (Ported from the mobile app's
// AsyncStorage + expo-crypto version — same idea, browser-native storage.)

import { randomUUID } from "./uuid";

const STORAGE_KEY = "ruabsniper:deviceId";

let cached: string | null = null;

export function getDeviceId(): string {
  if (cached) return cached;

  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) {
    cached = existing;
    return existing;
  }

  const fresh = randomUUID();
  localStorage.setItem(STORAGE_KEY, fresh);
  cached = fresh;
  return fresh;
}
