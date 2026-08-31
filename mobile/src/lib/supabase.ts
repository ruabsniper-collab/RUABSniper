// Talks directly to Supabase with the anon key. Reads on courses/sections/
// professor_rmp_matches are public (RLS: "public read ..."); writes to
// watches/push_tokens are scoped only by convention (device_id filtering
// happens in our own queries, not enforced server-side — see the RLS notes
// in backend/supabase/migrations/0001_init.sql). Never put the
// service_role key here — only the anon key belongs in the app.

import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy mobile/.env.example to mobile/.env and fill in your Supabase project's values.",
  );
}

export const supabase = createClient(url, anonKey, {
  // No login flow in this app (see deviceId.ts), so session persistence/
  // refresh is irrelevant — AsyncStorage is passed only because the client
  // insists on a storage adapter in a React Native environment.
  auth: { storage: AsyncStorage, persistSession: false, autoRefreshToken: false },
});
