// Talks directly to Supabase with the anon key. Reads on courses/sections/
// professor_rmp_matches are public (RLS: "public read ..."); writes to
// watches/push_subscriptions are scoped only by convention (device_id
// filtering happens in our own queries, not enforced server-side — see the
// RLS notes in backend/supabase/migrations/0001_init.sql). Never put the
// service_role key here — only the anon key belongs in the browser.

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
      "Copy web/.env.example to web/.env and fill in your Supabase project's values.",
  );
}

export const supabase = createClient(url, anonKey, {
  // No login flow in this app (see deviceId.ts), so session persistence/
  // refresh is irrelevant.
  auth: { persistSession: false, autoRefreshToken: false },
});
