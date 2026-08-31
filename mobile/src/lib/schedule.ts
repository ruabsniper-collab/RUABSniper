// "My Schedule" for conflict filtering. Deliberately local-only (AsyncStorage,
// never synced to Supabase) — it's just a filtering input, not something
// that needs to exist server-side or across devices, and keeping it local
// means one less thing tied to this device's identity on the backend.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type { MeetingTime } from "../types/db";
import { militaryToMinutes } from "./time";

export type ScheduleBlock = {
  id: string;
  label: string; // e.g. "CS 111" — freeform, just for display in the list
  day: string; // M/T/W/H/F/S/U
  start: string; // 24h "HHMM"
  end: string; // 24h "HHMM"
};

const STORAGE_KEY = "ruabsniper:mySchedule";

export async function loadMySchedule(): Promise<ScheduleBlock[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ScheduleBlock[];
  } catch {
    return [];
  }
}

async function saveMySchedule(blocks: ScheduleBlock[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
}

export async function addScheduleBlock(block: Omit<ScheduleBlock, "id">): Promise<ScheduleBlock[]> {
  const blocks = await loadMySchedule();
  const next = [...blocks, { ...block, id: Crypto.randomUUID() }];
  await saveMySchedule(next);
  return next;
}

export async function removeScheduleBlock(id: string): Promise<ScheduleBlock[]> {
  const blocks = await loadMySchedule();
  const next = blocks.filter((b) => b.id !== id);
  await saveMySchedule(next);
  return next;
}

export async function replaceMySchedule(blocks: ScheduleBlock[]): Promise<void> {
  await saveMySchedule(blocks);
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
