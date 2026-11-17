import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { MessageChannel } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { restoreNotificationOnLaunch, installNotificationNavigation } from "../../web/src/lib/notificationNavigation.js";

const origin = "https://ruab.example.test";
const target = "/register?index=13913&year=2027&code=1&label=Organic%20Chemistry%20section%2004";
const key = origin + "/__ruab_notification_navigation__";
const source = await readFile(new URL("../../web/public/sw.js", import.meta.url), "utf8");
const tick = () => new Promise(r => setTimeout(r, 25));
const disposers: Array<() => void> = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); });

class Events {
  listeners = new Map<string, Set<(event: any) => void>>();
  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: (event: any) => void) { this.listeners.get(type)?.delete(listener); }
  emit(type: string, event: any = {}) { this.listeners.get(type)?.forEach(fn => fn(event)); }
}

function storage() {
  const entries = new Map<string, Response>();
  const cache = {
    async match(url: string) { return entries.get(String(url))?.clone(); },
    async put(url: string, response: Response) { entries.set(String(url), response.clone()); },
    async delete(url: string) { return entries.delete(String(url)); },
  };
  return { cache, entries, async open() { return cache; } };
}

function harness(cacheStorage = storage()) {
  const sw = new Events();
  const browser = Object.assign(new Events(), {
    location: new URL(origin + "/"), caches: cacheStorage,
    history: { replaceState(_state: unknown, _title: string, url: string) { browser.location.href = new URL(url, origin).href; } },
  });
  const document = Object.assign(new Events(), { visibilityState: "visible" });
  const serviceWorker = Object.assign(new Events(), { ready: null as any, controller: null as any, async getRegistration(): Promise<any> { return { active: worker }; } });
  const opened: string[] = [];
  const shown: Array<{ title: string; options: any }> = [];
  const traces: URL[] = [];
  let windows: any[] = [];
  const self = Object.assign(sw, {
    location: { origin }, skipWaiting() {},
    clients: { async claim() {}, async matchAll() { return windows; }, async openWindow(url: string) { opened.push(url); return null; } },
    registration: { async showNotification(title: string, options: any) { shown.push({ title, options }); } },
  });
  runInNewContext(source, { self, caches: cacheStorage, URL, URLSearchParams, Response, crypto: { randomUUID }, MessageChannel, setTimeout, clearTimeout, console,
    fetch: async (url: URL) => { traces.push(new URL(String(url))); return new Response("{}"); } });
  const dispatch = async (type: string, extra: Record<string, unknown>) => {
    const pending: Promise<unknown>[] = [];
    sw.emit(type, { ...extra, waitUntil(promise: Promise<unknown>) { pending.push(promise); } });
    await Promise.all(pending);
  };
  const worker = { postMessage(data: unknown, ports: unknown[] = []) { void dispatch("message", { data, ports }); } };
  serviceWorker.controller = worker;
  serviceWorker.ready = Promise.resolve({ active: worker });
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker } });
  Object.defineProperty(globalThis, "caches", { configurable: true, value: cacheStorage });
  Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: (fn: () => void) => setTimeout(fn, 0) });
  const routes: string[] = [];
  const connectApp = () => {
    const dispose = installNotificationNavigation(url => {
      routes.push(url);
      browser.history.replaceState(null, "", url);
    });
    disposers.push(dispose);
    return dispose;
  };
  const click = (url = target) => dispatch("notificationclick", { notification: { data: { url }, close() {} } });
  return { cacheStorage, browser, document, serviceWorker, worker, dispatch, routes, opened, shown, traces, click, connectApp,
    setWindows(value: any[]) { windows = value; } };
}

test("cold installed-app launch restores exact index and term even if openWindow resumes at home", async () => {
  const h = harness();
  await h.click();
  assert.equal(h.opened[0], origin + target);
  assert.equal(h.browser.location.pathname, "/", "Simulate the OS ignoring the requested launch URL");
  await restoreNotificationOnLaunch();
  assert.equal(h.browser.location.search, new URL(origin + target).search);
  const dispose = h.connectApp();
  await tick();
  assert.equal(h.cacheStorage.entries.size, 0, "Intent acknowledged only after the section route is handled");
  dispose();
});

test("warm app routes directly without a reload or second window", async () => {
  const h = harness();
  let reloads = 0;
  h.setWindows([{
    focused: true,
    async focus() { h.browser.emit("focus"); },
    async navigate() { reloads++; return null; },
    postMessage(data: unknown, ports: unknown[]) { h.serviceWorker.emit("message", { data, ports, source: h.worker }); },
  }]);
  const dispose = h.connectApp();
  await tick();
  await h.click();
  assert.equal(h.browser.location.search, new URL(origin + target).search);
  assert.equal(reloads, 0);
  assert.equal(h.opened.length, 0);
  assert.equal(h.cacheStorage.entries.size, 0);
  dispose();
});

for (const failure of ["reject", "null"] as const) {
  test(`suspended client navigation returning ${failure} falls back to opening the exact section`, async () => {
    const h = harness();
    h.setWindows([{
      postMessage() {}, async focus() {},
      async navigate() { if (failure === "reject") throw new Error("Client gone"); return null; },
    }]);
    await h.click();
    assert.deepEqual(h.opened, [origin + target]);
  });
}

test("foreground recovery handles a notification whose immediate message was missed", async () => {
  const h = harness();
  h.document.visibilityState = "hidden";
  const dispose = h.connectApp();
  await h.click();
  h.document.visibilityState = "visible";
  h.document.emit("visibilitychange");
  await tick();
  assert.equal(h.browser.location.search, new URL(origin + target).search);
  assert.equal(h.cacheStorage.entries.size, 0);
  dispose();
});

test("local inbox polling recovers a tap even when the app receives no resume event or worker message", async () => {
  const h = harness();
  h.document.visibilityState = "hidden";
  // No worker message/reply can arrive, and no focus/visibility event fires.
  h.serviceWorker.ready = new Promise(() => {});
  const dispose = h.connectApp();
  await tick();
  await h.click();
  assert.equal(h.browser.location.pathname, "/");
  await new Promise(resolve => setTimeout(resolve, 1_100));
  assert.equal(h.browser.location.searchParams.get("index"), "13913");
  assert.equal(h.cacheStorage.entries.size, 0);
  h.browser.history.replaceState(null, "", "/settings");
  await new Promise(resolve => setTimeout(resolve, 1_100));
  assert.equal(h.browser.location.pathname, "/settings", "Handled intents must not hijack later navigation");
  dispose();
});

test("notification tag preserves the section URL if notification data is missing", async () => {
  const h = harness();
  await h.dispatch("notificationclick", { notification: { tag: `ruab:${origin + target}`, close() {} } });
  assert.equal(h.opened[0], origin + target);
});

test("only a labeled test emits tap-stage diagnostics and identifies the updated worker", async () => {
  const h = harness();
  const url = origin + target + "&notificationTest=" + randomUUID();
  await h.dispatch("push", { data: { json: () => ({ title: "Section-link test", body: "Navigation test", url }) } });
  assert.match(h.shown[0].title, /updated/);
  assert.equal(h.shown[0].options.data.url, url);
  assert.equal(h.shown[0].options.tag, `ruab:${url}`);
  await h.dispatch("notificationclick", { notification: { ...h.shown[0].options, close() {} } });
  assert.ok(h.traces.some(t => t.searchParams.get("event") === "sw-push"));
  assert.ok(h.traces.some(t => t.searchParams.get("event") === "sw-click-data"));
  assert.ok(h.traces.some(t => t.searchParams.get("event") === "sw-stored"));
  assert.ok(h.traces.some(t => t.searchParams.get("event") === "sw-opened"));
  const normal = harness();
  await normal.dispatch("push", { data: { json: () => ({ title: "A seat opened", body: "Index 13913", url: origin + target }) } });
  assert.equal(normal.traces.length, 0);
});

test("a late acknowledgement cannot erase a newer section and the intent survives worker restart", async () => {
  const h = harness();
  await h.click();
  const old = await (await h.cacheStorage.cache.match(key))!.json();
  await h.click(target.replace("13913", "16152"));
  await h.dispatch("message", { data: { type: "RUAB_NOTIFICATION_ACK", id: old.id }, ports: [] });
  assert.equal(h.cacheStorage.entries.size, 1);
  const restarted = harness(h.cacheStorage);
  await restoreNotificationOnLaunch();
  assert.equal(restarted.browser.location.searchParams.get("index"), "16152");
  assert.equal(restarted.browser.location.searchParams.get("year"), "2027");
});

test("expired or external navigation intents cannot redirect normal app launches", async () => {
  const h = harness();
  for (const intent of [
    { id: "expired", url: origin + target, clickedAt: Date.now() - 121_000 },
    { id: "external", url: "https://other.example.test/register?index=13913", clickedAt: Date.now() },
  ]) {
    await h.cacheStorage.cache.put(key, new Response(JSON.stringify(intent)));
    await restoreNotificationOnLaunch();
    assert.equal(h.browser.location.pathname, "/");
  }
});

test("a delayed recovery response cannot replace a newer notification's section", async () => {
  const h = harness();
  let reply: any;
  const originalPost = h.worker.postMessage;
  h.worker.postMessage = (data: any, ports: any[] = []) => {
    if (data.type === "RUAB_NOTIFICATION_GET") reply = ports[0];
    else originalPost(data, ports);
  };
  const dispose = h.connectApp();
  await tick();
  h.serviceWorker.emit("message", {
    data: { type: "RUAB_NOTIFICATION_NAVIGATE", intent: { id: "new", url: origin + target, clickedAt: Date.now() } },
    source: h.worker, ports: [],
  });
  reply.postMessage({ intent: { id: "old", url: origin + target.replace("13913", "16152"), clickedAt: Date.now() - 1_000 } });
  await tick();
  assert.equal(h.browser.location.searchParams.get("index"), "13913");
  dispose();
});

test("storage failure does not block opening a section or rendering the app", async () => {
  const broken = { ...storage(), async open() { throw new Error("Storage unavailable"); } };
  const h = harness(broken);
  await h.click();
  assert.equal(h.opened[0], origin + target);
  await assert.doesNotReject(restoreNotificationOnLaunch());
});
