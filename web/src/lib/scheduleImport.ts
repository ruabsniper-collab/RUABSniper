import type { ScheduleBlockDraft } from "./scheduleOcr";
import type { ScheduleBlock } from "./schedule";
import { formatMilitaryTime, parseTimeToMilitary } from "./time";
import { randomUUID } from "./uuid";

export type ScheduleImportRow = {
  id: string; label: string; day: string; startText: string; endText: string;
  included: boolean; sourceLine: string; dayGuessed: boolean; timeGuessed: boolean;
  courseKey?: string; campus?: string;
};

export function toImportRow(d: ScheduleBlockDraft): ScheduleImportRow {
  return { ...d, id: randomUUID(), startText: d.start ? formatMilitaryTime(d.start) : "",
    endText: d.end ? formatMilitaryTime(d.end) : "", included: !d.dayGuessed && !d.timeGuessed && Boolean(d.start && d.end),
    dayGuessed: Boolean(d.dayGuessed), timeGuessed: Boolean(d.timeGuessed) };
}

export function importRowError(row: ScheduleImportRow): string | null {
  if (!row.label.trim()) return "Enter a class name.";
  if (row.dayGuessed || !/^[MTWHFSU]$/.test(row.day)) return "Choose the correct day.";
  if (row.timeGuessed) return "Check AM/PM and confirm or edit the times.";
  const start = parseTimeToMilitary(row.startText), end = parseTimeToMilitary(row.endText);
  if (!start || !end) return "Enter both times, for example 3:50 PM or 15:50.";
  if (end <= start) return "End time must be later than start time.";
  return null;
}

export function prepareScheduleImport(rows: ScheduleImportRow[], existing: ScheduleBlock[]) {
  const blocks: Omit<ScheduleBlock, "id">[] = [];
  const handled = new Set<string>();
  const seen = [...existing];
  let duplicates = 0, invalid = 0;
  for (const row of rows.filter(r => r.included)) {
    if (importRowError(row)) { invalid++; continue; }
    const block = { label: row.label.trim(), day: row.day, start: parseTimeToMilitary(row.startText)!,
      end: parseTimeToMilitary(row.endText)!, courseKey: row.courseKey, campus: row.campus };
    const duplicate = seen.some(other => other.day === block.day && other.start === block.start && other.end === block.end &&
      ((other.courseKey && block.courseKey && other.courseKey === block.courseKey) || other.label.toLowerCase() === block.label.toLowerCase()));
    if (duplicate) duplicates++;
    else { blocks.push(block); seen.push({ ...block, id: row.id }); }
    handled.add(row.id);
  }
  return { blocks, remaining: rows.filter(row => !handled.has(row.id)), duplicates, invalid };
}
