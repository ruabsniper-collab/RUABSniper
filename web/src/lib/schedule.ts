// "My Schedule" for conflict filtering. Deliberately local-only (localStorage,
// never synced to Supabase) — it's just a filtering input, not something
// that needs to exist server-side or across devices, and keeping it local
// means one less thing tied to this device's identity on the backend.

import type { MeetingTime } from "../types/db";
import { militaryToMinutes } from "./time";
import { randomUUID } from "./uuid";

export type ScheduleBlock = {
  id: string;
  label: string; // e.g. "CS 111" — freeform, just for display in the list
  day: string; // M/T/W/H/F/S/U
  start: string; // 24h "HHMM"
  end: string; // 24h "HHMM"
};

const STORAGE_KEY = "ruabsniper:mySchedule";

export function loadMySchedule(): ScheduleBlock[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ScheduleBlock[];
  } catch {
    return [];
  }
}

function saveMySchedule(blocks: ScheduleBlock[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
}

export function addScheduleBlock(block: Omit<ScheduleBlock, "id">): ScheduleBlock[] {
  const blocks = loadMySchedule();
  const next = [...blocks, { ...block, id: randomUUID() }];
  saveMySchedule(next);
  return next;
}

export function removeScheduleBlock(id: string): ScheduleBlock[] {
  const blocks = loadMySchedule();
  const next = blocks.filter((b) => b.id !== id);
  saveMySchedule(next);
  return next;
}

export function replaceMySchedule(blocks: ScheduleBlock[]): void {
  saveMySchedule(blocks);
}

/** True if any of a section's meeting times overlaps any block in the existing schedule. */
export function checkConflict(meetingTimes: MeetingTime[], schedule: ScheduleBlock[]): boolean {
  for (const mt of meetingTimes) {
    if (!mt.day) continue;
    const mtStart = militaryToMinutes(mt.start);
    const mtEnd = militaryToMinutes(mt.end);
    if (mtStart == null || mtEnd == null) continue;

    for (const block of schedule) {
      if (block.day !== mt.day) continue;
      const bStart = militaryToMinutes(block.start);
      const bEnd = militaryToMinutes(block.end);
      if (bStart == null || bEnd == null) continue;
      const overlaps = mtStart < bEnd && bStart < mtEnd;
      if (overlaps) return true;
    }
  }
  return false;
}
