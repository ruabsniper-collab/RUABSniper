import { useCallback, useEffect, useState } from "react";
import {
  addScheduleBlock,
  createSchedule,
  deleteSchedule,
  getActiveScheduleId,
  listSchedules,
  loadMySchedule,
  removeScheduleBlock,
  renameSchedule,
  restoreSchedules,
  setActiveScheduleId,
  type ScheduleBlock,
  type ScheduleSet,
} from "../lib/schedule";
import { DAY_LABELS, formatMilitaryTime, parseTimeToMilitary } from "../lib/time";
import { CAMPUS_PICKER_OPTIONS } from "../lib/campus";
import { ScreenshotImport } from "../components/ScreenshotImport";
import { haptic } from "../lib/haptics";
import { showToast } from "../lib/toast";

const DAYS = ["M", "T", "W", "H", "F"];

export function MySchedulePage() {
  const [schedules, setSchedules] = useState<ScheduleSet[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [addMode, setAddMode] = useState<"manual" | "screenshot">("manual");
  const [label, setLabel] = useState("");
  const [day, setDay] = useState("M");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [campus, setCampus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setSchedules(listSchedules());
    setActiveId(getActiveScheduleId());
    setBlocks(loadMySchedule());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeSchedule = schedules.find((s) => s.id === activeId);

  function switchTo(id: string) {
    setActiveScheduleId(id);
    setRenaming(false);
    refresh();
  }

  function handleNewSchedule() {
    createSchedule();
    setRenaming(false);
    refresh();
  }

  function startRename() {
    setRenameValue(activeSchedule?.name ?? "");
    setRenaming(true);
  }

  function commitRename() {
    if (activeId) renameSchedule(activeId, renameValue);
    setRenaming(false);
    refresh();
  }

  // Instant delete + an Undo toast, same pattern as unsniping (see
  // WatchesPage/SearchPage) -- no more window.confirm(), which was the one
  // place left in the whole app that broke out to a plain, unstyled browser
  // dialog instead of the app's own UI. Undo restores a full snapshot of
  // the schedule list + active pointer taken right before deleting, rather
  // than recreating just the one deleted schedule -- deleteSchedule()
  // always leaves at least one schedule behind, so deleting your only one
  // auto-creates a blank replacement first, and a create-based "undo"
  // would stack a second one on top of it instead of cleanly reversing.
  function handleDeleteSchedule() {
    if (!activeSchedule) return;
    const priorSets = schedules;
    const priorActiveId = activeId;
    const deletedName = activeSchedule.name;
    deleteSchedule(activeId);
    setRenaming(false);
    refresh();
    haptic("tap");
    showToast(`Deleted "${deletedName}"`, "default", {
      label: "Undo",
      onClick: () => {
        restoreSchedules(priorSets, priorActiveId);
        haptic("confirm");
        refresh();
      },
    });
  }

  function submit() {
    const startMilitary = parseTimeToMilitary(start);
    const endMilitary = parseTimeToMilitary(end);
    if (!label.trim()) return setError('Give it a name, e.g. "CS 111".');
    if (!startMilitary || !endMilitary) return setError('Use a time like "3:50 PM" or "15:50" for both fields.');
    setError(null);
    addScheduleBlock({ label: label.trim(), day, start: startMilitary, end: endMilitary, campus: campus || undefined });
    refresh();
    haptic("confirm");
    showToast(`Added ${label.trim()} to ${activeSchedule?.name ?? "schedule"}`, "success");
    setLabel("");
    setStart("");
    setEnd("");
  }

  function removeBlock(block: ScheduleBlock) {
    removeScheduleBlock(block.id);
    refresh();
    haptic("tap");
    showToast(`Removed ${block.label}`, "default", {
      label: "Undo",
      onClick: () => {
        addScheduleBlock({
          label: block.label,
          day: block.day,
          start: block.start,
          end: block.end,
          courseKey: block.courseKey,
          campus: block.campus,
        });
        haptic("confirm");
        refresh();
      },
    });
  }

  return (
    <div>
      <p className="hint">
        Add the classes you're already registered for so Search can hide anything that overlaps. Keep
        separate schedules for separate people — e.g. your own classes plus a friend's you're sniping for.
      </p>

      <div className="row-flex" style={{ flexWrap: "wrap", marginTop: 10 }}>
        {schedules.map((s) => (
          <button
            key={s.id}
            className={`mode-tab ${s.id === activeId ? "active" : ""}`}
            style={{ flex: "0 1 auto" }}
            onClick={() => switchTo(s.id)}
          >
            {s.name}
          </button>
        ))}
        <button className="btn-secondary btn btn-small" onClick={handleNewSchedule}>
          + New schedule
        </button>
      </div>

      <div className="card-row" style={{ marginTop: 10 }}>
        {renaming ? (
          <input
            className="input"
            style={{ flex: 1 }}
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => e.key === "Enter" && commitRename()}
          />
        ) : (
          <h3 style={{ flex: 1, margin: 0 }}>{activeSchedule?.name}</h3>
        )}
        {!renaming && (
          <button className="btn-secondary btn btn-small" onClick={startRename}>
            Rename
          </button>
        )}
        <button className="btn-danger btn btn-small" onClick={handleDeleteSchedule}>
          Delete schedule
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        {blocks.map((item) => (
          <div key={item.id} className="card card-row">
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 700, fontSize: 14 }}>{item.label}</p>
              <p className="meta">
                {DAY_LABELS[item.day]} {formatMilitaryTime(item.start)} – {formatMilitaryTime(item.end)}
              </p>
            </div>
            <button className="btn btn-danger btn-small" onClick={() => removeBlock(item)}>
              Remove
            </button>
          </div>
        ))}
        {blocks.length === 0 && <p className="empty-text">No existing classes added yet.</p>}
      </div>

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
          <select className="input" value={campus} onChange={(e) => setCampus(e.target.value)}>
            <option value="">Campus (optional)</option>
            {CAMPUS_PICKER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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
