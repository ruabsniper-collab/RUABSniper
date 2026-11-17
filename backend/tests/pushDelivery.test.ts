import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import webpush from "web-push";
import { PushRetryState } from "../../web/server/pushRetry.js";
import { CloseConfirmationState } from "../../web/server/closeConfirmation.js";

// All traffic is intercepted. These tests never read .env or send real pushes.
process.env.SUPABASE_URL = "https://example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.POLL_SECRET = "test-secret";
const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;
process.env.VAPID_SUBJECT = "mailto:test@example.test";

let clock = Date.now();
Date.now = () => clock;
type Watch = { id: string; device_id: string; term_year: number; term_code: number; index_number: string; last_status: boolean; notified_at: string | null };
let watches: Watch[] = [];
let subscriptions = new Set<string>();
let open = new Set<string>();
let failOnce = new Set<string>();
let expired = new Set<string>();
let sends: string[] = [];
let onConfirmationWait: (() => void) | undefined;
let beforeClose: (() => void) | undefined;

// Advance the confirmation window without waiting in wall-clock time.
// Other timers (including library timers) retain their real behavior.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
  if (ms !== 6_000) return realSetTimeout(callback, ms, ...args);
  clock += 6_000;
  onConfirmationWait?.();
  return realSetTimeout(callback, 0, ...args);
}) as typeof setTimeout;

function matches(row: Watch | { device_id: string }, url: URL): boolean {
  return [...url.searchParams].every(([key, value]) => {
    if (!["id", "device_id", "last_status", "notified_at"].includes(key)) return true;
    const actual = (row as unknown as Record<string, unknown>)[key];
    return value === "is.null" ? actual === null : String(actual) === value.slice(3);
  });
}

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
  if (url.hostname === "sis.rutgers.edu") return json([...open]);
  assert.equal(url.hostname, "example.test", "No real network requests allowed");
  const table = url.pathname.split("/").at(-1);
  const method = options.method ?? "GET";
  if (table === "watches" && method === "GET") return json(watches.filter(w => matches(w, url)));
  if (table === "watches" && method === "PATCH") {
    const update = JSON.parse(String(options.body));
    if (update.last_status === false) beforeClose?.();
    const matched = watches.filter(w => matches(w, url));
    for (const row of matched) Object.assign(row, update);
    return url.searchParams.has("select") ? json(matched.map(w => ({ id: w.id }))) : new Response(null, { status: 204 });
  }
  if (table === "push_subscriptions") {
    const devices = [...subscriptions].filter(device_id => matches({ device_id }, url));
    if (method === "DELETE") {
      devices.forEach(d => subscriptions.delete(d));
      return new Response(null, { status: 204 });
    }
    return json(devices.map(d => ({ endpoint: `https://push.example.test/${d}`, p256dh: "test", auth: "test" })));
  }
  if (table === "sections") return json([{ section_number: "04", courses: { subject_code: "160", course_number: "307", title: "ORGANIC CHEMISTRY" } }]);
  throw new Error(`Unhandled test request: ${method} ${table}`);
};

// Both installed copies of web-push must be intercepted for the two runtimes.
async function fakeSend(subscription: webpush.PushSubscription, payload?: string | Buffer | null, options?: webpush.RequestOptions) {
  const device = new URL(subscription.endpoint).pathname.slice(1);
  const message = JSON.parse(String(payload));
  const destination = new URL(message.url, "https://example.test");
  assert.equal(destination.pathname, "/register");
  assert.equal(destination.searchParams.get("index"), watches.find(w => w.device_id === device)?.index_number);
  assert.equal(destination.searchParams.get("year"), "2027");
  assert.equal(destination.searchParams.get("code"), "1");
  assert.equal(options?.urgency, "high");
  assert.equal(options?.timeout, 10_000);
  sends.push(device);
  if (expired.has(device)) throw Object.assign(new Error("Expired"), { statusCode: 410 });
  if (failOnce.delete(device)) throw Object.assign(new Error("Unavailable"), { statusCode: 503 });
  return { statusCode: 201, headers: {}, body: "" };
}
webpush.sendNotification = fakeSend;
const webPushCopy = createRequire(new URL("../../web/package.json", import.meta.url))("web-push") as typeof webpush;
webPushCopy.sendNotification = fakeSend;
const { pollOnce } = await import("../lib/pollOnce.js");
const { default: pollApi } = await import("../../web/api/poll.js");

async function run(mode: "worker" | "fallback") {
  if (mode === "worker") return pollOnce();
  let status = 0;
  let body: unknown;
  const response = { status(code: number) { status = code; return { json(value: unknown) { body = value; } }; } };
  await pollApi({ query: { secret: "test-secret" } }, response);
  assert.equal(status, 200, JSON.stringify(body));
}

function setup(prefix: string, count = 1) {
  watches = Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}`, device_id: `${prefix}-${i}`, term_year: 2027, term_code: 1, index_number: String(13913 + i), last_status: false, notified_at: null }));
  subscriptions = new Set(watches.map(w => w.device_id));
  open = new Set(watches.map(w => w.index_number));
  failOnce = new Set(); expired = new Set(); sends = [];
  onConfirmationWait = undefined; beforeClose = undefined;
}

async function closeSustained(mode: "worker" | "fallback") {
  await run(mode);
  if (mode === "worker") { clock += 6_000; await run(mode); }
}

for (const mode of ["worker", "fallback"] as const) {
  test(`${mode}: failed push stays open, retries once after backoff, and other devices still receive alerts`, async () => {
    setup(`${mode}-retry`, 2);
    const device = watches[0].device_id;
    failOnce.add(device);
    await run(mode);
    assert.equal(watches[0].last_status, true);
    assert.equal(watches[0].notified_at, null);
    assert.ok(watches[1].notified_at);
    assert.equal(sends.length, 2);
    await run(mode);
    assert.equal(sends.length, 2, "No immediate hammering after failure");
    clock += 5_001;
    await Promise.all([run(mode), run(mode)]);
    assert.equal(sends.filter(d => d === device).length, 2, "Only one concurrent retry claims delivery");
    assert.equal(sends.filter(d => d !== device).length, 1);
    assert.ok(watches[0].notified_at);
    await run(mode);
    assert.equal(sends.length, 3, "Accepted delivery is not sent again");
  });

  test(`${mode}: closing cancels a pending retry; reopening can notify again`, async () => {
    setup(`${mode}-close`);
    failOnce.add(watches[0].device_id);
    await run(mode);
    open.clear(); clock += 5_001;
    await closeSustained(mode);
    assert.equal(watches[0].last_status, false);
    assert.equal(watches[0].notified_at, null);
    assert.equal(sends.length, 1);
    open.add(watches[0].index_number);
    await run(mode);
    assert.equal(sends.length, 2);
    assert.ok(watches[0].notified_at);
  });

  test(`${mode}: expired subscriptions are removed without repeated pushes`, async () => {
    setup(`${mode}-expired`);
    expired.add(watches[0].device_id);
    await run(mode);
    clock += 120_000;
    await run(mode);
    assert.equal(subscriptions.size, 0);
    assert.equal(sends.length, 1);
  });

  test(`${mode}: adding a watch already open does not send an immediate alert`, async () => {
    setup(`${mode}-already-open`);
    watches[0].last_status = true;
    watches[0].notified_at = new Date(clock).toISOString();
    await run(mode);
    assert.equal(sends.length, 0);
  });

  test(`${mode}: brief closed/open flapping does not repeatedly alert; sustained closure re-arms immediately`, async () => {
    setup(`${mode}-flap`);
    await run(mode);
    for (let i = 0; i < 8; i++) {
      open.clear(); clock += 2_000;
      onConfirmationWait = () => open.add(watches[0].index_number);
      await run(mode);
      open.add(watches[0].index_number); clock += 2_000;
      await run(mode);
    }
    assert.equal(sends.length, 1, "One alert across repeated transient closures");
    onConfirmationWait = undefined;
    open.clear(); await closeSustained(mode);
    assert.equal(watches[0].last_status, false);
    open.add(watches[0].index_number);
    await run(mode);
    assert.equal(sends.length, 2, "The next confirmed reopening alerts without delay");
  });

  test(`${mode}: a stale closure cannot clear a newer opening's delivery claim`, async () => {
    setup(`${mode}-stale-close`);
    await run(mode);
    const newerClaim = "2099-01-01T00:00:00.000Z";
    beforeClose = () => { watches[0].notified_at = newerClaim; };
    open.clear(); await closeSustained(mode);
    assert.equal(watches[0].last_status, true);
    assert.equal(watches[0].notified_at, newerClaim);
    open.add(watches[0].index_number);
    await run(mode);
    assert.equal(sends.length, 1);
  });

  test(`${mode}: a watch paused during a check cannot be re-armed by that stale check`, async () => {
    setup(`${mode}-paused`);
    await run(mode);
    beforeClose = () => { watches[0].device_id = "paused-device"; };
    open.clear(); await closeSustained(mode);
    assert.equal(watches[0].last_status, true);
    assert.ok(watches[0].notified_at);
  });
}

test("worker and fallback racing on the same opening send only one push", async () => {
  setup("cross-runtime");
  await Promise.all([run("worker"), run("fallback")]);
  assert.equal(sends.length, 1);
});

test("worker and fallback racing on a pending retry send only one retry", async () => {
  setup("cross-runtime-retry");
  failOnce.add(watches[0].device_id);
  await run("worker");
  assert.equal(watches[0].notified_at, null);
  clock += 5_001;
  await Promise.all([run("worker"), run("fallback")]);
  assert.equal(sends.length, 2);
  assert.ok(watches[0].notified_at);
});

test("backoff caps at one minute and resets after success", () => {
  let now = 0;
  const retry = new PushRetryState(() => now);
  for (const delay of [5_000, 10_000, 20_000, 40_000, 60_000, 60_000]) {
    retry.failed("test");
    assert.equal(retry.canAttempt("other"), true);
    now += delay - 1;
    assert.equal(retry.canAttempt("test"), false);
    now++;
    assert.equal(retry.canAttempt("test"), true);
  }
  retry.reset("test");
  retry.failed("test");
  now += 5_000;
  assert.equal(retry.canAttempt("test"), true);
});

test("provider Retry-After takes priority over the normal backoff", () => {
  let now = 0;
  const retry = new PushRetryState(() => now);
  retry.failed("seconds", "120");
  now = 119_999;
  assert.equal(retry.canAttempt("seconds"), false);
  now++;
  assert.equal(retry.canAttempt("seconds"), true);
  retry.failed("date", new Date(now + 300_000).toUTCString());
  now += 299_999;
  assert.equal(retry.canAttempt("date"), false);
  now++;
  assert.equal(retry.canAttempt("date"), true);
  retry.failed("invalid", "not a date");
  now += 5_000;
  assert.equal(retry.canAttempt("invalid"), true);
});

test("closure confirmation resets after an open reading or a changed delivery generation", () => {
  let now = 0;
  const state = new CloseConfirmationState(() => now);
  assert.equal(state.observe("watch", false, true, "first"), false);
  now = 5_999;
  assert.equal(state.observe("watch", false, true, "first"), false);
  now = 6_000;
  assert.equal(state.observe("watch", false, true, "first"), true);
  assert.equal(state.observe("watch", true, true, "first"), false);
  assert.equal(state.observe("watch", false, true, "first"), false);
  now += 6_000;
  assert.equal(state.observe("watch", false, true, "newer"), false);
  now += 6_000;
  assert.equal(state.observe("watch", false, true, "newer"), true);
  state.retain(new Set());
  assert.equal(state.observe("watch", false, true, "newer"), false);
});

test("fallback sends other opening alerts before waiting to confirm closures", async () => {
  setup("fallback-no-opening-delay", 2);
  open = new Set([watches[0].index_number]);
  watches[1].last_status = true;
  watches[1].notified_at = new Date(clock).toISOString();
  let waited = false;
  onConfirmationWait = () => {
    waited = true;
    assert.deepEqual(sends, [watches[0].device_id], "The opening push is already sent");
  };
  await run("fallback");
  assert.equal(waited, true);
  assert.equal(watches[1].last_status, false);
});
