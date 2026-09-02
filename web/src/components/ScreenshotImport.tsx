import { useRef, useState } from "react";
import { addScheduleBlock } from "../lib/schedule";
import { runScheduleOcr, parseScheduleImage, type ScheduleBlockDraft } from "../lib/scheduleOcr";
import { DAY_LABELS, formatMilitaryTime, parseTimeToMilitary } from "../lib/time";
import { CAMPUS_PICKER_OPTIONS } from "../lib/campus";
import { loadImageCanvas, sampleRegionColor } from "../lib/colorSample";

const DAYS = ["M", "T", "W", "H", "F", "S", "U"];

type DraftRow = {
  label: string;
  day: string;
  startText: string;
  endText: string;
  included: boolean;
  sourceLine: string;
  dayGuessed: boolean;
  courseKey?: string;
  campus?: string;
};

function toDraftRow(d: ScheduleBlockDraft): DraftRow {
  return {
    label: d.label,
    day: d.day,
    startText: d.start ? formatMilitaryTime(d.start) : "",
    endText: d.end ? formatMilitaryTime(d.end) : "",
    // A day guessed rather than read (see parseScheduleText — this is the
    // normal case for a WebReg Calendar-view screenshot, where the day is
    // only ever a column header, never text next to the class) starts
    // unchecked, so nothing gets added to My Schedule on a possibly-wrong
    // day just because the reviewer clicked "Add" without reading every row.
    included: !d.dayGuessed,
    sourceLine: d.sourceLine,
    dayGuessed: d.dayGuessed ?? false,
    courseKey: d.courseKey,
    campus: d.campus,
  };
}

/** Reads a File as a base64 JPEG payload (no "data:" prefix) for runScheduleOcr. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read that image."));
    reader.readAsDataURL(file);
  });
}

/**
 * "Import from screenshot": pick a photo, OCR it (see lib/scheduleOcr.ts),
 * then show every guessed class as an editable row so nothing gets added
 * to My Schedule without the user looking at it first.
 */
export function ScreenshotImport({ onImported }: { onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [skippedMsg, setSkippedMsg] = useState<string | null>(null);

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageUrl(URL.createObjectURL(file));
    setStatus("scanning");
    setError(null);
    setSkippedMsg(null);
    setDrafts([]);
    setRawText("");

    try {
      const base64 = await fileToBase64(file);
      const result = await runScheduleOcr(base64);
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

      setDrafts(parseScheduleImage(result, sampleColor).map(toDraftRow));
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
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
    const included = drafts.filter((d) => d.included);
    let added = 0;
    let skipped = 0;
    for (const d of included) {
      const start = parseTimeToMilitary(d.startText);
      const end = parseTimeToMilitary(d.endText);
      if (!start || !end || !d.label.trim()) {
        skipped += 1;
        continue;
      }
      addScheduleBlock({ label: d.label.trim(), day: d.day, start, end, courseKey: d.courseKey, campus: d.campus });
      added += 1;
    }
    setSkippedMsg(
      skipped > 0
        ? `Added ${added}, skipped ${skipped} (couldn't read a time like "3:50 PM" — fix and retry, or add manually).`
        : null,
    );
    if (added > 0) onImported();
    setDrafts((prev) => prev.filter((d) => !d.included)); // keep unselected/failed rows to retry
  }

  const includedCount = drafts.filter((d) => d.included).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p className="hint">
        Pick a screenshot of your schedule — WebReg, Schedule Planner, a calendar app, even a photo of a
        printout. Text recognition is best-effort, so review every row below before adding anything.
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

      {status === "scanning" && <p className="hint">Reading text off the image…</p>}
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

      {status === "done" && drafts.length === 0 && !error && (
        <div>
          <p className="warning-box">
            Couldn't find any "day + time" patterns in that image. Raw text it read is below — use Manual
            entry if this isn't useful.
          </p>
          {rawText ? (
            <pre style={{ maxHeight: 120, overflow: "auto", background: "#f6f8fa", borderRadius: 6, padding: 8, fontSize: 11 }}>
              {rawText}
            </pre>
          ) : null}
        </div>
      )}

      {drafts.map((d, i) => (
        <div key={i} className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="row-flex" style={{ alignItems: "center" }}>
            <input
              type="checkbox"
              checked={d.included}
              onChange={(e) => updateDraft(i, { included: e.target.checked })}
            />
            <input
              className="input"
              style={{ flex: 1, fontWeight: 600 }}
              value={d.label}
              onChange={(e) => updateDraft(i, { label: e.target.value })}
            />
            <button className="btn-danger btn btn-small" onClick={() => removeDraft(i)}>
              ✕
            </button>
          </div>
          <p className="meta" style={{ fontStyle: "italic" }}>
            from: "{d.sourceLine}"
          </p>
          {d.dayGuessed && (
            <p className="warning-box">
              Couldn't read a day for this one (common for a WebReg Calendar screenshot, where the day is
              only shown once as a column header) — defaulted to Monday below. Pick the real day before
              including it.
            </p>
          )}
          <div className="row-flex">
            {DAYS.map((day) => (
              <button
                key={day}
                className={`day-chip ${d.day === day ? "active" : ""}`}
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
              value={d.startText}
              onChange={(e) => updateDraft(i, { startText: e.target.value })}
            />
            <input
              className="input"
              placeholder="End, e.g. 5:10 PM"
              value={d.endText}
              onChange={(e) => updateDraft(i, { endText: e.target.value })}
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

      {drafts.length > 0 && (
        <button className="btn btn-green" onClick={commitSelected} disabled={includedCount === 0}>
          Add {includedCount} class{includedCount === 1 ? "" : "es"} to my schedule
        </button>
      )}
    </div>
  );
}
