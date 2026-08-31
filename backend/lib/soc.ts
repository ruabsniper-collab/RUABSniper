// Client for Rutgers' public (undocumented) Schedule of Classes API.
//
// This is the same API community tools like anitejb/lightning and
// pradhyumk/rutgers-course-sniper poll for open-seat notifications. It has
// no official docs and no key — treat field names as best-effort and lean
// on the `raw` column (see migrations/0001_init.sql) rather than assuming
// every field below is guaranteed to exist forever.

import type { Term } from "./term.js";

const BASE = "https://sis.rutgers.edu/soc/api";

export type SocMeetingTime = {
  meetingDay?: string; // M/T/W/H/F/S/U
  // NOTE: `startTime`/`endTime` are 12-hour with a separate `pmCode` flag —
  // easy to misread as 24-hour and get conflict math wrong. Use the
  // `*Military` fields (confirmed 24h, e.g. "1550" = 3:50 PM) instead.
  startTimeMilitary?: string;
  endTimeMilitary?: string;
  campusName?: string;
  buildingCode?: string;
  roomNumber?: string;
};

export type SocSection = {
  number?: string;
  index: string;
  openStatus?: boolean;
  instructorsText?: string;
  instructors?: { name?: string }[];
  commentsText?: string;
  meetingTimes?: SocMeetingTime[];
  [key: string]: unknown;
};

export type SocCourse = {
  title: string;
  courseNumber: string;
  subject: string;
  subjectDescription?: string;
  credits?: number | string;
  coreCodes?: { coreCode?: string; coreCodeDescription?: string }[];
  sections?: SocSection[];
  [key: string]: unknown;
};

/** Splits a possibly-multi-instructor SOC string/array into individual "Last, First" names. */
export function parseInstructorNames(section: SocSection): string[] {
  if (Array.isArray(section.instructors) && section.instructors.length > 0) {
    return section.instructors
      .map((i) => i.name?.trim())
      .filter((n): n is string => Boolean(n));
  }
  if (section.instructorsText) {
    return section.instructorsText
      .split(/;|\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export async function fetchCourses(term: Term, campus = "NB"): Promise<SocCourse[]> {
  const url = `${BASE}/courses.json?year=${term.year}&term=${term.code}&campus=${campus}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "ruabsniper/0.1 (personal course tracker)" },
  });
  if (!res.ok) {
    throw new Error(`SOC courses.json ${res.status} ${res.statusText} (${url})`);
  }
  return (await res.json()) as SocCourse[];
}

/**
 * Lighter-weight endpoint that returns only sections with open seats.
 * Used by the poller instead of the full courses.json to keep each run fast.
 */
export async function fetchOpenIndexes(term: Term, campus = "NB"): Promise<Set<string>> {
  const url = `${BASE}/openSections.json?year=${term.year}&term=${term.code}&campus=${campus}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "ruabsniper/0.1 (personal course tracker)" },
  });
  if (!res.ok) {
    throw new Error(`SOC openSections.json ${res.status} ${res.statusText} (${url})`);
  }
  const data = (await res.json()) as unknown;
  // openSections.json returns a flat array of index-number strings/numbers.
  const arr = Array.isArray(data) ? data : [];
  return new Set(arr.map((v) => String(v)));
}
