import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars. " +
      "Backend scripts write with the service role key (bypasses RLS) — " +
      "never ship this key in the mobile app, only the anon key.",
  );
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
