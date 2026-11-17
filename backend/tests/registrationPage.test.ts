import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { copyIndexAndOpenWebReg } from "../../web/src/lib/webReg.js";

test("WebReg opens immediately while clipboard permission is still pending", async () => {
  const calls: string[] = [];
  let finishCopy!: () => void;
  let copied = false;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    clipboard: { writeText(index: string) { calls.push(`copy:${index}`); return new Promise<void>(resolve => { finishCopy = resolve; }); } },
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    open(url: string) { calls.push(`open:${url}`); },
  } });
  copyIndexAndOpenWebReg("13913", () => { copied = true; }, () => assert.fail("Copy should succeed"));
  assert.deepEqual(calls, ["copy:13913", "open:https://sims.rutgers.edu/webreg/"]);
  assert.equal(copied, false);
  finishCopy();
  await Promise.resolve();
  assert.equal(copied, true);
});

test("clipboard failure still opens WebReg and exposes the manual-copy fallback", async () => {
  for (const clipboard of [undefined, { writeText: () => Promise.reject(new Error("Denied")) }]) {
    let opened = false;
    let failed = false;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard } });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { open() { opened = true; } } });
    copyIndexAndOpenWebReg("13913", () => assert.fail("Copy should fail"), () => { failed = true; });
    assert.equal(opened, true);
    await Promise.resolve();
    assert.equal(failed, true);
  }
  delete (globalThis as any).window;
});

test("exact-section controls render before course/seat data or unrelated tabs load", async () => {
  const webRequire = createRequire(new URL("../../web/package.json", import.meta.url));
  const { createServer } = await import(pathToFileURL(webRequire.resolve("vite")).href);
  const root = fileURLToPath(new URL("../../web/", import.meta.url));
  const renderId = root.replaceAll("\\", "/") + "__registration_render__.ts";
  const server = await createServer({
    root, logLevel: "error", server: { middlewareMode: true, hmr: false },
    plugins: [{
      name: "isolated-registration-render",
      resolveId(id: string) { if (id === "virtual:registration-render") return renderId; },
      load(id: string) {
        if (id === renderId) return `
          import React from 'react';
          import { renderToString } from 'react-dom/server';
          import { MemoryRouter } from 'react-router-dom';
          import App from '/src/App.tsx';
          export function render(url) {
            return renderToString(React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(App)));
          }
        `;
      },
    }],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://example.test"),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("test-key"),
    },
  });
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("Unexpected network request before registration controls render"); };
  try {
    const { render } = await server.ssrLoadModule("virtual:registration-render");
    const html = render("/register?index=13913&year=2027&code=1&label=Organic%20Chemistry%20section%2004");
    assert.match(html, /Index <!-- -->13913/);
    assert.match(html, /Organic Chemistry section 04/);
    assert.match(html, /Spring 2027/);
    assert.match(html, /Copy index &amp; open WebReg/);
    assert.ok(html.indexOf("Copy index &amp; open WebReg") < html.indexOf("skeleton-row"));
    assert.doesNotMatch(html, /The server did not finish this Suspense boundary/);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
  }
});
