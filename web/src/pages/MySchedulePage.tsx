import { useCallback, useEffect, useState } from "react";
import { addScheduleBlock, loadMySchedule, removeScheduleBlock, type ScheduleBlock } from "../lib/schedule";
import { DAY_LABELS, parseTimeToMilitary } from "../lib/time";
import { ScreenshotImport } from "../components/ScreenshotImport";

const DAYS = ["M", "T", "W", "H", "F"];

export function MySchedulePage() {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [addMode, setAddMode] = useState<"manual" | "screenshot">("manual");
  const [label, setLabel] = useState("");
  const [day, setDay] = useState("M");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setBlocks(loadMySchedule());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function submit() {
    const startMilitary = parseTimeToMilitary(start);
    const endMilitary = parseTimeToMilitary(end);
    if (!label.trim()) return setError('Give it a name, e.g. "CS 111".');
    if (!startMilitary || !endMilitary) return setError('Use a time like "3:50 PM" or "15:50" for both fields.');
    setError(null);
    const next = addScheduleBlock({ label: label.trim(), day, start: startMilitary, end: endMilitary });
    setBlocks(next);
    setLabel("");
    setStart("");
    setEnd("");
  }

  return (
    <div>
      <p className="hint">
        Add the classes you're already registered for so Search can hide anything that overlaps.
      </p>

      {blocks.map((item) => (
        <div key={item.id} className="card card-row">
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 14 }}>{item.label}</p>
            <p className="meta">
              {DAY_LABELS[item.day]} {item.start} – {item.end}
            </p>
          </div>
          <button
            className="btn btn-danger btn-small"
            onClick={() => setBlocks(removeScheduleBlock(item.id))}
          >
            Remove
          </button>
        </div>
      ))}
      {blocks.length === 0 && <p className="empty-text">No existing classes added yet.</p>}

      <div className="mode-tabs">
        <button
          className={`mode-tab ${addMode === "manual" ? "active" : ""}`}
          onClick={() => setAddMode("manual")}
        >
          Add manually
        </button>
        <button
          className={`mode-tab ${addMode === "screenshot" ? "active" : ""}`}
          onClick={() => setAddMode("screenshot")}
        >
          Import from screenshot
        </button>
      </div>

      {addMode === "manual" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            className="input"
            placeholder="Course name (e.g. CS 111)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="row-flex">
            {DAYS.map((d) => (
              <button key={d} className={`day-chip ${day === d ? "active" : ""}`} onClick={() => setDay(d)}>
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>
          <div className="row-flex">
            <input
              className="input"
              placeholder="Start, e.g. 3:50 PM"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
            <input
              className="input"
              placeholder="End, e.g. 5:10 PM"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-green" onClick={submit}>
            Add to my schedule
          </button>
        </div>
      ) : (
        <ScreenshotImport onImported={refresh} />
      )}
    </div>
  );
}
