import { useEffect, useRef, useState } from "react";
import { addScheduleBlocks, loadMySchedule } from "../lib/schedule";
import { runScheduleOcr, parseScheduleImage, parseScheduleText } from "../lib/scheduleOcr";
import { DAY_LABELS } from "../lib/time";
import { CAMPUS_PICKER_OPTIONS } from "../lib/campus";
import { loadImageCanvas, sampleRegionColor } from "../lib/colorSample";
import { prepareScheduleImage } from "../lib/scheduleImage";
import { importRowError, prepareScheduleImport, toImportRow, type ScheduleImportRow as DraftRow } from "../lib/scheduleImport";

const DAYS = ["M", "T", "W", "H", "F", "S", "U"];

/**
 * "Import from screenshot": pick a photo, OCR it (see lib/scheduleOcr.ts),
 * then show every guessed class as an editable row so nothing gets added
 * to My Schedule without the user looking at it first.
 */
export function ScreenshotImport({ onImported }: { onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<AbortController | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [skippedMsg, setSkippedMsg] = useState<string | null>(null);
  const [foundCount, setFoundCount] = useState(0);
  useEffect(() => () => scanRef.current?.abort(), []);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow retrying the very same screenshot
    if (!file) return;
    lastFileRef.current = file;
    await scanFile(file);
  }

  async function scanFile(file: File) {
    scanRef.current?.abort();
    const scan = new AbortController();
    scanRef.current = scan;

    setImageUrl(URL.createObjectURL(file));
    setStatus("scanning");
    setError(null);
    setSkippedMsg(null);
    setDrafts([]);
    setRawText("");
    setFoundCount(0);

    try {
      const base64 = await prepareScheduleImage(file, scan.signal);
      const result = await runScheduleOcr(base64, scan.signal);
      if (scan.signal.aborted) return;
      setRawText(result.text);

      // Color-based campus detection is a bonus signal, not a required one
      // -- if decoding the image for pixel access fails for any reason, the
      // import should still proceed on text alone rather than erroring out
      // over a fallback that didn't even need to work.
      let sampleColor: ((left: number, top: number, width: number, height: number) => import("../lib/colorSample").RGB | null) | undefined;
      try {
        const { ctx, width, height } = await loadImageCanvas(base64);
        sampleColor = (left, top, w, h) => sampleRegionColor(ctx, left, top, w, h, width, height);
      } catch {
        sampleColor = undefined;
      }

      if (scan.signal.aborted) return;
      const rows = parseScheduleImage(result, sampleColor).map(toImportRow);
      setDrafts(rows);
      setFoundCount(rows.length);
      setStatus("done");
    } catch (err) {
      if (scan.signal.aborted) return;
      setError(err instanceof Error && err.name === "TimeoutError" ? "The screenshot reader took too long. Try again or crop to the schedule grid." : err instanceof Error ? err.message : "Scan failed");
      setStatus("error");
    }
  }

  function updateDraft(index: number, patch: Partial<DraftRow>) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function removeDraft(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  function commitSelected() {
    try {
      const result = prepareScheduleImport(drafts, loadMySchedule());
      if (result.blocks.length > 0) addScheduleBlocks(result.blocks);
      setDrafts(result.remaining);
      setSkippedMsg(`Added ${result.blocks.length} class blocks.${result.duplicates ? ` ${result.duplicates} already in your schedule.` : ""}${result.invalid ? ` ${result.invalid} need corrections below and were kept for you.` : ""}`);
      setError(null);
      if (result.blocks.length > 0) onImported();
    } catch {
      setError("Couldn't save the import. Your review rows are still here; free some browser storage and try again.");
    }
  }

  const includedCount = drafts.filter((d) => d.included).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p className="hint">
        For the best result, use a screenshot cropped to the schedule grid with day headers and full
        class times visible. Check every day and time before adding the results.
      </p>

      {/* No `capture` attribute on purpose — that forces mobile browsers
          straight to the camera, but this is for picking an *existing*
          screenshot (from the photo library/Files), not taking a new photo.
          Leaving it off lets the browser show its normal picker (Photos /
          Camera / Files on iOS, Photos / Camera / Files on Android) instead. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={onFileChosen}
      />
      <button className="btn" onClick={() => fileInputRef.current?.click()}>
        {imageUrl ? "Choose a different screenshot" : "Choose screenshot"}
      </button>

      {imageUrl && (
        <img
          src={imageUrl}
          alt="Schedule screenshot preview"
          style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 8, background: "#eaeef2" }}
        />
      )}

      {status === "scanning" && <><p className="hint" role="status">Preparing the image and reading your schedule…</p>
        <button className="btn btn-secondary" onClick={() => { scanRef.current?.abort(); setStatus("idle"); }}>Cancel scan</button></>}
      {status !== "scanning" && lastFileRef.current && <button className="btn btn-secondary" onClick={() => { if (lastFileRef.current) void scanFile(lastFileRef.current); }}>Scan again</button>}
      {error && <p className="error-text">{error}</p>}
      {skippedMsg && <p className="warning-box">{skippedMsg}</p>}

      {/* Same action as the button below the review rows -- duplicated up
          here so it's visible the moment scanning finishes, not just after
          scrolling past every row. With a long schedule that button was
          easy to miss entirely. */}
      {drafts.length > 0 && (
        <button className="btn btn-green" onClick={commitSelected} disabled={includedCount === 0}>
          Add {includedCount} class{includedCount === 1 ? "" : "es"} to my schedule
        </button>
      )}

      {status === "done" && foundCount === 0 && drafts.length === 0 && !error && (
        <div>
          <p className="warning-box">
            Couldn't find any "day + time" patterns in that image. Raw text it read is below — use Manual
            entry if this isn't useful.
          </p>
        </div>
      )}

      {drafts.map((d, i) => (
        <div key={d.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="row-flex" style={{ alignItems: "center" }}>
            <input
              type="checkbox"
              aria-label={`Include ${d.label || "class"}`}
              checked={d.included}
              onChange={(e) => updateDraft(i, { included: e.target.checked })}
            />
            <input
              className="input"
              style={{ flex: 1, fontWeight: 600 }}
              value={d.label}
              aria-label="Class name"
              onChange={(e) => updateDraft(i, { label: e.target.value })}
            />
            <button className="btn-danger btn btn-small" aria-label={`Remove ${d.label || "class"}`} onClick={() => removeDraft(i)}>
              ✕
            </button>
          </div>
          <p className="meta" style={{ fontStyle: "italic" }}>
            from: "{d.sourceLine}"
          </p>
          {d.dayGuessed && (
            <p className="warning-box">
              Couldn't confidently read this class's day. Choose the correct day before including it.
            </p>
          )}
          {d.timeGuessed && <div className="warning-box">AM/PM was unclear. Check the times below.
            <button className="btn btn-small" onClick={() => updateDraft(i, { timeGuessed: false })}>These times are correct</button>
          </div>}
          {d.included && importRowError(d) && <p className="error-text" role="status">{importRowError(d)}</p>}
          <div className="row-flex">
            {DAYS.map((day) => (
              <button
                key={day}
                className={`day-chip ${d.day === day ? "active" : ""}`}
                aria-pressed={d.day === day && !d.dayGuessed}
                onClick={() => updateDraft(i, { day, dayGuessed: false })}
              >
                {DAY_LABELS[day]}
              </button>
            ))}
          </div>
          <div className="row-flex">
            <input
              className="input"
              placeholder="Start, e.g. 3:50 PM"
              aria-label="Start time"
              value={d.startText}
              onChange={(e) => updateDraft(i, { startText: e.target.value, timeGuessed: false })}
            />
            <input
              className="input"
              placeholder="End, e.g. 5:10 PM"
              aria-label="End time"
              value={d.endText}
              onChange={(e) => updateDraft(i, { endText: e.target.value, timeGuessed: false })}
            />
          </div>
          <label className="row-flex" style={{ alignItems: "center", gap: 8 }}>
            <span className="filter-label" style={{ whiteSpace: "nowrap" }}>
              Campus
            </span>
            <select
              className="input"
              value={d.campus ?? ""}
              onChange={(e) => updateDraft(i, { campus: e.target.value || undefined })}
            >
              <option value="">Campus not detected</option>
              {CAMPUS_PICKER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ))}

      {rawText && <details><summary>Review or fix the recognized text</summary>
        <p className="hint">For a corrected list, use one class per line, for example: Biology Mon/Wed 9:00 AM–10:20 AM.</p>
        <textarea className="input" aria-label="Recognized schedule text" rows={7} value={rawText} onChange={e => setRawText(e.target.value)} />
        <button className="btn btn-secondary" onClick={() => {
          const rows = parseScheduleText(rawText).map(toImportRow); setDrafts(rows); setFoundCount(rows.length); setSkippedMsg(null);
        }}>Rebuild review rows from this text</button>
      </details>}

      {drafts.length > 0 && (
        <button className="btn btn-green" onClick={commitSelected} disabled={includedCount === 0}>
          Add {includedCount} class{includedCount === 1 ? "" : "es"} to my schedule
        </button>
      )}
    </div>
  );
}
