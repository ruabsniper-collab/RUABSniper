// A random per-install identifier — the only "account" concept in this app.
// No login, no NetID, nothing that ties a watch or push token back to a
// real person beyond "whoever has this phone." See backend/supabase/migrations
// for how this is used server-side.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const STORAGE_KEY = "ruabsniper:deviceId";

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  const existing = await AsyncStorage.getItem(STORAGE_KEY);
  if (existing) {
    cached = existing;
    return existing;
  }

  const fresh = Crypto.randomUUID();
  await AsyncStorage.setItem(STORAGE_KEY, fresh);
  cached = fresh;
  return fresh;
}
