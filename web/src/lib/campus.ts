// Canonical NB campus values -- must match exactly what SOC's own
// meeting_times[].campus field returns (verified against a live
// courses.json pull, see courses.ts's LOCATION_OPTIONS), including SOC's own
// "DOUGLAS/COOK" spelling (one L), not the standard "Douglass/Cook" people
// actually write/read. Centralized here since both the schedule importer
// (matching free OCR'd text) and the travel-buffer conflict check (matching
// a schedule block's stored campus against a real section's) need the same
// canonical spellings to ever compare equal.
export const CAMPUS_VALUES = {
  COLLEGE_AVENUE: "COLLEGE AVENUE",
  BUSCH: "BUSCH",
  LIVINGSTON: "LIVINGSTON",
  DOUGLASS_COOK: "DOUGLAS/COOK",
  DOWNTOWN: "DOWNTOWN NB",
  OFF_CAMPUS: "OFF CAMPUS",
  ONLINE: "ONLINE",
  STUDY_ABROAD: "STUDY ABROAD",
} as const;

const ALIASES: [RegExp, string][] = [
  [/college\s*ave(nue)?/i, CAMPUS_VALUES.COLLEGE_AVENUE],
  [/busch/i, CAMPUS_VALUES.BUSCH],
  [/livingston/i, CAMPUS_VALUES.LIVINGSTON],
  [/dougla?ss?\s*[/&]?\s*cook/i, CAMPUS_VALUES.DOUGLASS_COOK],
  [/downtown/i, CAMPUS_VALUES.DOWNTOWN],
  [/off[\s-]*campus/i, CAMPUS_VALUES.OFF_CAMPUS],
  [/online/i, CAMPUS_VALUES.ONLINE],
  [/study\s*abroad/i, CAMPUS_VALUES.STUDY_ABROAD],
];

/** Best-effort match of free text (an OCR'd room/campus line, user-picked text, etc.) to one of SOC's own canonical campus values. Null if nothing recognizable. */
export function normalizeCampusName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const [re, canonical] of ALIASES) {
    if (re.test(raw)) return canonical;
  }
  return null;
}

export const CAMPUS_PICKER_OPTIONS: { value: string; label: string }[] = [
  { value: CAMPUS_VALUES.COLLEGE_AVENUE, label: "College Ave" },
  { value: CAMPUS_VALUES.BUSCH, label: "Busch" },
  { value: CAMPUS_VALUES.LIVINGSTON, label: "Livingston" },
  { value: CAMPUS_VALUES.DOUGLASS_COOK, label: "Douglass/Cook" },
  { value: CAMPUS_VALUES.DOWNTOWN, label: "Downtown NB" },
  { value: CAMPUS_VALUES.OFF_CAMPUS, label: "Off Campus" },
  { value: CAMPUS_VALUES.ONLINE, label: "Online" },
];
