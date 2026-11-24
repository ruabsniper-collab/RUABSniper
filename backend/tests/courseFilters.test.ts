import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

test("catalog choices cover all pages and cache only successful term-specific results", async () => {
  const webRequire = createRequire(new URL("../../web/package.json", import.meta.url));
  const { createServer } = await import(pathToFileURL(webRequire.resolve("vite")).href);
  const server = await createServer({ root: fileURLToPath(new URL("../../web/", import.meta.url)), logLevel: "error", server: { middlewareMode: true, hmr: false },
    define: { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://example.test"), "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("test-key") } });
  const originalFetch = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input)); requests.push(url);
    assert.equal(url.hostname, "example.test");
    const first = { subject_code: "119", subject_description: "Biological Sciences", core_codes: ["NS"], core_details: [{ coreCode: "NS", coreCodeDescription: "Natural Sciences" }] };
    const second = { subject_code: "640", subject_description: "Mathematics", core_codes: ["QQ"], section_listings: { "12345": { core_codes: ["WCd"] } } };
    return new Response(JSON.stringify(url.searchParams.get("offset") === "0" ? Array(1000).fill(first) : [second]), { headers: { "content-type": "application/json" } });
  };
  try {
    const { getCatalogOptions, buildCatalogOptions } = await server.ssrLoadModule("/src/lib/catalogOptions.ts");
    const term = { year: 2027, code: 1 };
    const options = await getCatalogOptions(term, new AbortController().signal);
    assert.deepEqual(options.subjects.map((s: { code: string }) => s.code), ["119", "640"]);
    assert.deepEqual(options.cores.map((c: { code: string }) => c.code), ["NS", "QQ", "WCd"]);
    assert.equal(options.cores[0].name, "Natural Sciences");
    assert.equal(requests.length, 2);
    assert.equal(requests[1].searchParams.get("offset"), "1000");
    await getCatalogOptions(term, new AbortController().signal); assert.equal(requests.length, 2);
    await getCatalogOptions({ year: 2027, code: 9 }, new AbortController().signal); assert.equal(requests.length, 4);
    assert.equal(buildCatalogOptions([{ subject_code: "119", subject_description: null, core_codes: null }]).subjects[0].name, "119");
  } finally { globalThis.fetch = originalFetch; await server.close(); }
});

test("clicking core buttons and choosing a subject change independent filters without modifying search text", async () => {
  const webRequire = createRequire(new URL("../../web/package.json", import.meta.url));
  const { createServer } = await import(pathToFileURL(webRequire.resolve("vite")).href);
  const root = fileURLToPath(new URL("../../web/", import.meta.url));
  let expanded = false;
  // Isolate the component's local disclosure state. JSX elements retain the
  // actual handlers, which are invoked below without a browser or network.
  const server = await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false },
    plugins: [{ name: "filter-control-state", enforce: "pre", load(id: string) {
      if (id.replaceAll("\\", "/").endsWith("/components/CourseFilters.tsx")) return readFileSync(id, "utf8").replace('import { useState } from "react";',
        `let expanded=false;function useState(_initial){return [expanded, next=>{expanded=typeof next==='function'?next(expanded):next}];}`);
    } }],
    define: { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://example.test"), "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("test-key") } });
  try {
    const { CourseFilters, DEFAULT_COURSE_FILTERS, activeFilterCount } = await server.ssrLoadModule("/src/components/CourseFilters.tsx");
    let value = { ...DEFAULT_COURSE_FILTERS };
    let query = "";
    const props = { value, query, onChange: (patch: any) => { value = { ...value, ...patch }; }, onQueryChange: (text: string) => { query = text; },
      options: { subjects: [{ code: "119", name: "Biological Sciences" }], cores: [{ code: "NS", name: "Natural Sciences" }, { code: "HST", name: "Historical Analysis" }] },
      optionsLoading: false, optionsError: false, onRetryOptions() {}, schedules: [], activeScheduleId: "", onScheduleChange() {}, scheduleName: "My Schedule", scheduleBlocks: 0 };
    const elements = (tree: any): any[] => tree && typeof tree === "object" ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(child => elements(child))] : [];
    const render = () => elements(CourseFilters({ ...props, value, query }));
    const button = (nodes: any[], label: string) => nodes.find(node => node.type === "button" && (node.props["aria-label"] === label || node.props.children === label));
    let nodes = render();
    assert.equal(nodes.some(node => node.props?.id === "course-filter-panel"), false, "Detailed controls start collapsed");
    button(nodes, "NS: Natural Sciences").props.onClick();
    assert.deepEqual(value.coreCodes, ["NS"]); assert.equal(query, ""); assert.equal(activeFilterCount(value), 1);
    nodes = render(); assert.equal(button(nodes, "NS: Natural Sciences").props["aria-pressed"], true);
    nodes.find(node => node.type === "select" && node.props["aria-label"] === "Subject").props.onChange({ target: { value: "119" } });
    assert.equal(value.subjectCode, "119"); assert.equal(query, "");
    nodes = render(); nodes.find(node => node.type === "button" && node.props["aria-controls"] === "course-filter-panel").props.onClick();
    expanded = true; nodes = render(); assert.equal(nodes.some(node => node.props?.id === "course-filter-panel"), expanded);
    const countSelect = nodes.find(node => node.type === "select" && node.props.children?.some?.((child: any) => child?.props?.children === "Any count"));
    assert.ok(countSelect); countSelect.props.onChange({ target: { value: "20" } }); assert.equal(value.minRatingCount, 20);
    query = "biology"; nodes = render(); button(nodes, "Reset all").props.onClick();
    assert.equal(activeFilterCount(value), 0); assert.equal(query, "biology", "Reset filters keeps the typed query");
  } finally { await server.close(); }
});
