// "My Schedule" for conflict filtering. Deliberately local-only (localStorage,
// never synced to Supabase) — it's just a filtering input, not something
// that needs to exist server-side or across devices, and keeping it local
// means one less thing tied to this device's identity on the backend.
//
// Multiple named schedules (not just one flat list) so one person can keep
// separate profiles -- e.g. their own existing classes plus a friend's, when
// sniping sections for both -- and switch which one Search filters against
// without one overwriting the other. Whichever is "active" is what Search
// actually uses; MySchedulePage is where you switch/rename/delete.

import type { MeetingTime } from "../types/db";
import { militaryToMinutes } from "./time";
import { randomUUID } from "./uuid";

export type ScheduleBlock = {
  id: string;
  label: string; // e.g. "CS 111" — freeform, just for display in the list
  day: string; // M/T/W/H/F/S/U
  start: string; // 24h "HHMM"
  end: string; // 24h "HHMM"
  // "subjectCode:courseNumber" -- only ever set on blocks imported from a
  // screenshot where a real SOC course-code line was found (see
  // scheduleOcr.ts). Lets checkConflict recognize "this is the same course
  // as a section you're looking at," which should never count as a
  // conflict -- you'd be replacing that registration, not adding to it.
  courseKey?: string;
  // One of campus.ts's canonical CAMPUS_VALUES -- set from a screenshot's
  // room/campus text when recognizable (scheduleOcr.ts), or picked by hand
  // on manual entry. Lets checkConflict flag a "technically doesn't
  // overlap" back-to-back that's actually impossible to make in person
  // because the two classes are on different campuses.
  campus?: string;
};

export type ScheduleSet = {
  id: string;
  name: string;
  blocks: ScheduleBlock[];
};

const SETS_KEY = "ruabsniper:scheduleSets";
const ACTIVE_KEY = "ruabsniper:activeScheduleId";
// Pre-multi-schedule storage format: a bare ScheduleBlock[]. Migrated once,
// in place, the first time this loads after the update -- existing users'
// classes carry straight over into a "Schedule 1" instead of vanishing.
const LEGACY_KEY = "ruabsniper:mySchedule";

function nextDefaultName(existing: ScheduleSet[]): string {
  const taken = new Set(existing.map((s) => s.name));
  let n = 1;
  while (taken.has(`Schedule ${n}`)) n++;
  return `Schedule ${n}`;
}

function readSets(): ScheduleSet[] | null {
  const raw = localStorage.getItem(SETS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ScheduleSet[];
  } catch {
    return null;
  }
}

function migrateLegacy(): ScheduleSet[] {
  const raw = localStorage.getItem(LEGACY_KEY);
  let blocks: ScheduleBlock[] = [];
  if (raw) {
    try {
      blocks = JSON.parse(raw) as ScheduleBlock[];
    } catch {
      blocks = [];
    }
  }
  const sets: ScheduleSet[] = [{ id: randomUUID(), name: "Schedule 1", blocks }];
  writeSets(sets);
  localStorage.setItem(ACTIVE_KEY, sets[0].id);
  localStorage.removeItem(LEGACY_KEY);
  return sets;
}

function writeSets(sets: ScheduleSet[]): void {
  localStorage.setItem(SETS_KEY, JSON.stringify(sets));
}

/** Always returns at least one schedule -- migrates legacy data or creates a fresh "Schedule 1" if there's truly nothing yet. */
export function listSchedules(): ScheduleSet[] {
  const existing = readSets();
  if (existing && existing.length > 0) return existing;
  return migrateOrCreateEmpty();
}

function migrateOrCreateEmpty(): ScheduleSet[] {
  const hasLegacy = localStorage.getItem(LEGACY_KEY) != null;
  if (hasLegacy) return migrateLegacy();
  const sets: ScheduleSet[] = [{ id: randomUUID(), name: "Schedule 1", blocks: [] }];
  writeSets(sets);
  localStorage.setItem(ACTIVE_KEY, sets[0].id);
  return sets;
}

export function getActiveScheduleId(): string {
  const sets = listSchedules();
  const stored = localStorage.getItem(ACTIVE_KEY);
  if (stored && sets.some((s) => s.id === stored)) return stored;
  // Stored id points at nothing (deleted, or never set) -- fall back to the first schedule.
  localStorage.setItem(ACTIVE_KEY, sets[0].id);
  return sets[0].id;
}

export function setActiveScheduleId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function getActiveSchedule(): ScheduleSet {
  const sets = listSchedules();
  const activeId = getActiveScheduleId();
  return sets.find((s) => s.id === activeId) ?? sets[0];
}

/** Just the active schedule's blocks — the shape Search's conflict filter has always taken. */
export function loadMySchedule(): ScheduleBlock[] {
  return getActiveSchedule().blocks;
}

export function createSchedule(name?: string): ScheduleSet {
  const sets = listSchedules();
  const created: ScheduleSet = { id: randomUUID(), name: name?.trim() || nextDefaultName(sets), blocks: [] };
  writeSets([...sets, created]);
  setActiveScheduleId(created.id);
  return created;
}

export function renameSchedule(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const sets = listSchedules();
  writeSets(sets.map((s) => (s.id === id ? { ...s, name: trimmed } : s)));
}

/** Deletes a schedule outright. Always leaves at least one behind — deleting the last one just clears it back to empty instead of leaving nothing to switch to. */
export function deleteSchedule(id: string): ScheduleSet[] {
  const sets = listSchedules();
  const remaining = sets.filter((s) => s.id !== id);
  const next = remaining.length > 0 ? remaining : [{ id: randomUUID(), name: "Schedule 1", blocks: [] }];
  writeSets(next);
  if (getActiveScheduleId() === id) setActiveScheduleId(next[0].id);
  return next;
}

export function addScheduleBlock(block: Omit<ScheduleBlock, "id">): ScheduleBlock[] {
  const sets = listSchedules();
  const activeId = getActiveScheduleId();
  const nextBlock = { ...block, id: randomUUID() };
  let updated: ScheduleBlock[] = [];
  writeSets(
    sets.map((s) => {
      if (s.id !== activeId) return s;
      updated = [...s.blocks, nextBlock];
      return { ...s, blocks: updated };
    }),
  );
  return updated;
}

export function removeScheduleBlock(id: string): ScheduleBlock[] {
  const sets = listSchedules();
  const activeId = getActiveScheduleId();
  let updated: ScheduleBlock[] = [];
  writeSets(
    sets.map((s) => {
      if (s.id !== activeId) return s;
      updated = s.blocks.filter((b) => b.id !== id);
      return { ...s, blocks: updated };
    }),
  );
  return updated;
}

/**
 * True if any of a section's meeting times overlaps any block in the given
 * schedule. `sectionCourseKey` ("subjectCode:courseNumber") skips any block
 * that's the *same course* -- switching to a different section of a class
 * you already have means dropping the old section anyway, so it was never
 * really a conflict to begin with. Only takes effect for blocks that
 * actually carry a courseKey (screenshot-imported ones -- see schedule.ts);
 * manually-typed blocks have no structured course identity to compare, so
 * they're checked as a plain time conflict same as always.
 *
 * `travelBufferMinutes` extends "conflict" past literal time overlap: two
 * same-day meetings on *different* campuses with less than this many
 * minutes between them count as a conflict too, even though their times
 * technically don't overlap -- there's a real Rutgers NB bus ride between
 * campuses (Busch <-> Douglass/Cook in particular routinely takes 20-30+
 * minutes), so "class ends at 7, next one starts at 7:30 across campus" is
 * not actually attendable back to back. Only compares when both sides have
 * a known campus -- a block with no campus recorded (most manually-typed
 * ones) just never triggers this half of the check.
 */
export function checkConflict(
  meetingTimes: MeetingTime[],
  schedule: ScheduleBlock[],
  sectionCourseKey?: string,
  travelBufferMinutes = 0,
): boolean {
  for (const mt of meetingTimes) {
    if (!mt.day) continue;
    const mtStart = militaryToMinutes(mt.start);
    const mtEnd = militaryToMinutes(mt.end);
    if (mtStart == null || mtEnd == null) continue;

    for (const block of schedule) {
      if (sectionCourseKey && block.courseKey && block.courseKey === sectionCourseKey) continue;
      if (block.day !== mt.day) continue;
      const bStart = militaryToMinutes(block.start);
      const bEnd = militaryToMinutes(block.end);
      if (bStart == null || bEnd == null) continue;

      const overlaps = mtStart < bEnd && bStart < mtEnd;
      if (overlaps) return true;

      if (travelBufferMinutes > 0 && block.campus && mt.campus) {
        const blockCampus = block.campus.trim().toUpperCase();
        const sectionCampus = mt.campus.trim().toUpperCase();
        if (blockCampus && sectionCampus && blockCampus !== sectionCampus) {
          // Not overlapping means exactly one of these is the "later" side.
          // Inclusive (<=), not strict -- a gap exactly equal to the chosen
          // buffer is the boundary case the buffer exists to catch (e.g. a
          // class ending at 7 and the next starting at 7:30 across campus,
          // checked against a 30-min buffer, should flag, not narrowly pass).
          const gap = mtStart >= bEnd ? mtStart - bEnd : bStart - mtEnd;
          if (gap <= travelBufferMinutes) return true;
        }
      }
    }
  }
  return false;
}
