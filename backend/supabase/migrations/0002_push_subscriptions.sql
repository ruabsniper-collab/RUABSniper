-- Web Push subscriptions — replaces the fixed NOTIFY_EMAIL_TO email address
-- from 0001_init.sql with real per-device push, which is what makes
-- notifying more than one person (e.g. friends sharing this app) actually
-- work: each browser registers its own subscription here, keyed by the same
-- device_id already used for watches, and backend/lib/webPush.ts sends to
-- exactly the device whose watch fired instead of one hardcoded address.
--
-- One row per device_id (a browser re-subscribing just replaces its row).
-- Same permissive-RLS posture as watches — see the design notes in
-- 0001_init.sql for why that's an acceptable tradeoff here.

create table if not exists push_subscriptions (
  device_id text primary key,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  updated_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy "anon manage own push_subscriptions" on push_subscriptions for all using (true) with check (true);

-- Read only by the backend (service_role, bypasses RLS) in poll-and-notify.ts.
