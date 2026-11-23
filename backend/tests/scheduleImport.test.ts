import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseScheduleText, parseScheduleImage, toPositionedLines, type PositionedLine } from "../../web/src/lib/scheduleOcr.js";
import { prepareScheduleImport, toImportRow } from "../../web/src/lib/scheduleImport.js";
import { prepareScheduleImage } from "../../web/src/lib/scheduleImage.js";
import { addScheduleBlocks, loadMySchedule } from "../../web/src/lib/schedule.js";

test("recognizes spaced OCR, dotted/compact times, and both day placements", () => {
  for (const [line, days, start, end] of [
    ["Biology MWF 8 : 30 A.M. – 9 : 50 A.M.", ["M", "W", "F"], "0830", "0950"],
    ["Chemistry TTh 930am-1050am", ["T", "H"], "0930", "1050"],
    ["Physics 3.50 PM to 5.10 PM Mon/Wed", ["M", "W"], "1550", "1710"],
    ["Lab R 15:00-17:00", ["H"], "1500", "1700"],
    ["Discussion Su 09:00-10:00", ["U"], "0900", "1000"],
  ] as const) {
    const rows = parseScheduleText(line);
    assert.deepEqual(rows.map(row => row.day), days, line);
    assert.ok(rows.every(row => row.start === start && row.end === end && !row.timeGuessed), line);
  }
});

test("noon and midnight conventions do not become reversed classes", () => {
  for (const [line, start, end] of [["Class M 11-12:20 PM", "1100", "1220"], ["Class T 11 AM-12:20", "1100", "1220"], ["Class W 12:00 AM-1:00 AM", "0000", "0100"], ["Class H 12-1 PM", "1200", "1300"]]) {
    const [row] = parseScheduleText(line);
    assert.equal(row.start, start, line); assert.equal(row.end, end, line);
  }
});

test("ambiguous and impossible times require review; dates and course codes aren't meetings", () => {
  const [ambiguous] = parseScheduleText("Class M 9:00-10:20");
  assert.equal(ambiguous.timeGuessed, true);
  assert.equal(toImportRow(ambiguous).included, false);
  assert.equal(toImportRow(parseScheduleText("Class M 4 PM-3 PM")[0]).included, false);
  assert.deepEqual(parseScheduleText("2026-11-22\n01:640:151:01:12345\n3-4 credits"), []);
  assert.equal(parseScheduleText("Class M 9:00 AM-10:00 AM\nClass M 9:00 AM-10:00 AM").length, 1);
});

test("split multi-day header and neighboring-column OCR lines while preserving overlapping time tokens", () => {
  const word = (WordText: string, Left: number, Width = 40) => ({ WordText, Left, Top: 10, Width, Height: 12 });
  const headers = toPositionedLines([{ Words: [word("Wednesday", 400), word("Monday", 100), word("Tuesday", 250)] }]);
  assert.deepEqual(headers.map(row => row.text), ["Monday", "Tuesday", "Wednesday"]);
  const columns = toPositionedLines([{ Words: [word("BIOLOGY", 100, 50), word("CHEMISTRY", 300, 60)] }]);
  assert.equal(columns.length, 2);
  const overlap = toPositionedLines([{ Words: [word("8", 10, 20), word(":", 10, 20), word("30", 10, 20), word("AM", 32, 20)] }]);
  assert.equal(overlap[0].text, "8:30 AM");
  const reversedBoxes = toPositionedLines([{ Words: [word("8", 12, 20), word(":", 11, 20), word("30", 10, 20), word("AM", 32, 20)] }]);
  assert.equal(reversedBoxes[0].text, "8:30 AM", "Overlapping boxes do not override the token reading order");
});

test("shuffled and interleaved grid lines retain their day, course identity, title, and campus", () => {
  const line = (text: string, left: number, top: number, width = 100): PositionedLine => ({ text, left, top, width, height: 12 });
  const lines = [line("Tuesday", 210, 20, 80), line("Monday", 10, 20, 80),
    line("12:10 PM-1:30 PM", 0, 100), line("12:10 PM-1:30 PM", 200, 100),
    line("BIOLOGY", 0, 120), line("CHEMISTRY", 200, 120), line("01 : 119 : 115 : 01", 0, 140),
    line("01:160:161:02", 200, 140), line("(4.0) Busch", 0, 160), line("(4.0) Livingston", 200, 160)];
  const rows = parseScheduleImage({ text: "", lines: lines.reverse() });
  assert.deepEqual(rows.map(row => [row.day, row.label, row.courseKey, row.start, row.end]), [
    ["M", "BIOLOGY", "119:115", "1210", "1330"], ["T", "CHEMISTRY", "160:161", "1210", "1330"],
  ]);
  assert.ok(rows.every(row => row.campus && !row.dayGuessed));
});

test("save keeps invalid/unselected rows, rejects reversed times, and prevents duplicate reimports", () => {
  const valid = toImportRow(parseScheduleText("Biology M 9 AM-10 AM")[0]);
  const invalid = { ...valid, id: "invalid", startText: "5:00 PM", endText: "4:00 PM", included: true };
  const unselected = { ...valid, id: "unselected", included: false };
  const result = prepareScheduleImport([valid, invalid, unselected, { ...valid, id: "duplicate" }], []);
  assert.equal(result.blocks.length, 1); assert.equal(result.duplicates, 1); assert.equal(result.invalid, 1);
  assert.deepEqual(result.remaining.map(row => row.id), ["invalid", "unselected"]);
  const again = prepareScheduleImport([valid], [{ ...result.blocks[0], id: "saved" }]);
  assert.equal(again.blocks.length, 0); assert.equal(again.duplicates, 1);
});

test("batch save writes the schedule once, preventing partial imports on a storage failure", () => {
  const data = new Map<string, string>([["ruabsniper:scheduleSets", JSON.stringify([{ id: "active", name: "My Schedule", blocks: [] }])], ["ruabsniper:activeScheduleId", "active"]]);
  let writes = 0;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null,
    setItem(key: string, value: string) { writes++; data.set(key, value); } } });
  const blocks = ["M", "W"].map(day => ({ label: "Biology", day, start: "0900", end: "1000" }));
  addScheduleBlocks(blocks); assert.equal(writes, 1); assert.equal(loadMySchedule().length, 2);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, setItem() { throw Error("Quota exceeded"); } } });
  assert.throws(() => addScheduleBlocks(blocks), /Quota/); assert.equal(loadMySchedule().length, 2);
  delete (globalThis as any).localStorage;
});

test("PNG pixels are encoded as a size-bounded JPEG; cancellation cleans up object URLs", async () => {
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  let revoked = 0, encoded = 0;
  URL.createObjectURL = () => "blob:test"; URL.revokeObjectURL = () => { revoked++; };
  Object.defineProperty(globalThis, "Image", { configurable: true, value: class { naturalWidth = 3000; naturalHeight = 1500; onload?: () => void; set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement() { return { width: 0, height: 0,
    getContext: () => ({ fillRect() {}, drawImage() {}, fillStyle: "" }),
    toDataURL(type: string) { assert.equal(type, "image/jpeg"); encoded++; return 'data:image/jpeg;base64,' + (encoded === 1 ? 'x'.repeat(1_400_000) : 'jpeg-pixels'); },
  }; } } });
  try {
    const payload = await prepareScheduleImage(new File(["png bytes"], "schedule.png", { type: "image/png" }), new AbortController().signal);
    assert.equal(payload, "jpeg-pixels"); assert.equal(encoded, 2); assert.equal(revoked, 1);
    const canceled = new AbortController(); canceled.abort();
    await assert.rejects(prepareScheduleImage(new File(["x"], "schedule.png"), canceled.signal), { name: "AbortError" });
    assert.equal(revoked, 2);
  } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; delete (globalThis as any).Image; delete (globalThis as any).document; }
});

test("OCR request sends a real JPEG, recognizes string success codes, and supports cancellation", async () => {
  const webRequire = createRequire(new URL("../../web/package.json", import.meta.url));
  const { createServer } = await import(pathToFileURL(webRequire.resolve("vite")).href);
  const server = await createServer({ root: fileURLToPath(new URL("../../web/", import.meta.url)), logLevel: "error", server: { middlewareMode: true, hmr: false },
    define: { "import.meta.env.VITE_OCR_SPACE_API_KEY": JSON.stringify("test-key") } });
  const originalFetch = globalThis.fetch;
  try {
    const { runScheduleOcr } = await server.ssrLoadModule("/src/lib/scheduleOcr.ts");
    globalThis.fetch = async (_input, init) => {
      const form = init?.body as FormData;
      assert.equal(form.get("base64Image"), "data:image/jpeg;base64,jpeg-pixels"); assert.ok(init?.signal);
      return new Response(JSON.stringify({ ParsedResults: [{ FileParseExitCode: "1", ParsedText: "Biology M 9 AM-10 AM" }] }));
    };
    const result = await runScheduleOcr("jpeg-pixels"); assert.ok(result.text.includes("Biology"));
    globalThis.fetch = async () => new Response(JSON.stringify({ ParsedResults: [{ FileParseExitCode: -20 }] }));
    await assert.rejects(runScheduleOcr("jpeg-pixels"), /couldn't read/);
    const canceled = new AbortController(); canceled.abort();
    globalThis.fetch = async (_input, init) => { init?.signal?.throwIfAborted(); throw Error("Not aborted"); };
    await assert.rejects(runScheduleOcr("jpeg-pixels", canceled.signal), { name: "AbortError" });
  } finally { globalThis.fetch = originalFetch; await server.close(); }
});
