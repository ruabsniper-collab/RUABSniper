import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import handler from "../../web/api/notification-events.js";
import { APP_VERSION } from "../../web/src/lib/appVersion.js";
import { traceNotification } from "../../web/src/lib/notificationTrace.js";

function response() {
  const result = { status: 0, body: null as unknown, headers: {} as Record<string, string> };
  return { result, res: {
    setHeader(name: string, value: string) { result.headers[name] = value; },
    status(code: number) { result.status = code; return { json(value: unknown) { result.body = value; } }; },
  } };
}

test("diagnostic endpoint accepts bounded test events without logging extra fields", () => {
  const { result, res } = response();
  const logs: string[] = [];
  const original = console.log;
  console.log = value => { logs.push(String(value)); };
  try {
    handler({ query: { event: "sw-click-data", trace: randomUUID(), index: "13913", version: APP_VERSION, endpoint: "must-not-be-logged" } }, res);
  } finally { console.log = original; }
  assert.equal(result.status, 200);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.match(logs[0], /sw-click-data/);
  assert.doesNotMatch(logs[0], /must-not-be-logged/);
});

test("diagnostic endpoint rejects arbitrary events and malformed input", () => {
  for (const query of [
    { event: "arbitrary text", trace: randomUUID(), index: "13913", version: APP_VERSION },
    { event: "app-inbox", trace: "invalid", index: "13913", version: APP_VERSION },
    { event: "app-inbox", trace: randomUUID(), index: "not-an-index", version: APP_VERSION },
  ]) {
    const { result, res } = response();
    handler({ query }, res);
    assert.equal(result.status, 400);
  }
});

test("client diagnostics ignore normal alerts and deduplicate test stages", () => {
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://example.test" } } });
  const urls: string[] = [];
  globalThis.fetch = async input => { urls.push(String(input)); return new Response("{}"); };
  try {
    traceNotification("app-inbox", "/register?index=13913");
    assert.equal(urls.length, 0);
    const url = "/register?index=13913&notificationTest=" + randomUUID();
    traceNotification("app-inbox", url);
    traceNotification("app-inbox", url);
    assert.equal(urls.length, 1);
    assert.equal(new URL(urls[0], "https://example.test").searchParams.get("version"), APP_VERSION);
  } finally { globalThis.fetch = originalFetch; }
});
