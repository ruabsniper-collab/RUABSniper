import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build } from "esbuild";
import handler from "../../web/api/notification-events.js";
import { APP_VERSION } from "../../web/src/lib/appVersion.js";
import { traceNotification } from "../../web/src/lib/notificationTrace.js";

test("compiled diagnostic API loads in native Node ESM without a bundler or TS loader", async () => {
  const webRoot = fileURLToPath(new URL("../../web/", import.meta.url));
  const output = fileURLToPath(new URL("../node_modules/.cache/native-diagnostic-api/", import.meta.url));
  await mkdir(output, { recursive: true });
  await writeFile(join(output, "package.json"), JSON.stringify({ type: "module" }));
  await build({
    entryPoints: [join(webRoot, "api/notification-events.ts"), join(webRoot, "src/lib/appVersion.ts")],
    outbase: webRoot, outdir: output, bundle: false, platform: "node", format: "esm", logLevel: "silent",
  });
  const entry = pathToFileURL(join(output, "api/notification-events.js")).href;
  const script = `
    const {default:handler}=await import(${JSON.stringify(entry)});
    let status; let body;
    handler({query:{}},{setHeader(){},status(code){status=code;return{json(value){body=value;}}}});
    console.log(JSON.stringify({status,body}));
  `;
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, NODE_OPTIONS: "" } });
  assert.deepEqual(JSON.parse(stdout), { status: 200, body: { version: APP_VERSION } });
});

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
