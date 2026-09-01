// Best-effort screenshot -> schedule-block parser. There's no reliable way
// to parse an arbitrary schedule screenshot (a WebReg grid, a Schedule
// Planner export, a calendar app, or a photo of a printed schedule) with
// certainty, so this follows the same philosophy as backend/lib/rmp.ts:
// make the best automatic guess, expose exactly what was guessed (including
// the source line it came from), and let the human confirm or fix every
// field before anything is saved. See components/ScreenshotImport.tsx for
// the review UI -- nothing in this file writes to storage.

export type ScheduleBlockDraft = {
  label: string;
  day: string; // M/T/W/H/F/S/U
  start: string | null; // "HHMM" military, or null if the time couldn't be read
  end: string | null;
  sourceLine: string; // the OCR'd line this was guessed from, shown for review
};

const OCR_ENDPOINT = "https://api.ocr.space/parse/image";

/**
 * Sends a JPEG (base64, no "data:" prefix) to OCR.space's free tier and
 * returns the recognized text. Get a free key (no card required, 25k
 * requests/month / 500 a day) at https://ocr.space/ocrapi/freekey and put
 * it in mobile/.env as EXPO_PUBLIC_OCR_SPACE_API_KEY -- see
 * mobile/.env.example. Run entirely client-side; nothing about this call
 * touches Supabase or the backend.
 */
export async function runScheduleOcr(base64Jpeg: string): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_OCR_SPACE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing EXPO_PUBLIC_OCR_SPACE_API_KEY. Get a free key at https://ocr.space/ocrapi/freekey " +
        "and add it to mobile/.env (see mobile/.env.example).",
    );
  }

  const form = new FormData();
  form.append("apikey", apiKey);
  form.append("language", "eng");
  form.append("isTable", "true"); // schedules are usually grid-shaped
  form.append("scale", "true"); // upscales small grid text before OCR
  form.append("OCREngine", "2"); // engine 2 reads small/dense text more reliably
  form.append("base64Image", `data:image/jpeg;base64,${base64Jpeg}`);

  const res = await fetch(OCR_ENDPOINT, { method: "POST", body: form });
  if (!res.ok) throw new Error(`OCR.space request failed: ${res.status} ${res.statusText}`);

  const json = (await res.json()) as {
    IsErroredOnProcessing?: boolean;
    ErrorMessage?: string | string[];
    ParsedResults?: { ParsedText?: string }[];
  };

  if (json.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join("; ") : json.ErrorMessage;
    throw new Error(msg || "OCR.space couldn't process that image.");
  }

  return (json.ParsedResults ?? []).map((r) => r.ParsedText ?? "").join("\n");
}

// ---- Day-run tokenizing ----------------------------------------------------

// Ordered longest-name-first so "Thursday" is consumed whole before falling
// back to "Thu"/"Th", and "Tuesday" before the bare "T" that would otherwise
// also match its own first letter.
const DAY_NAMES: [string, string][] = (
  [
    ["monday", "M"], ["mon", "M"],
    ["tuesday", "T"], ["tues", "T"], ["tue", "T"],
    ["wednesday", "W"], ["wed", "W"],
    ["thursday", "H"], ["thurs", "H"], ["thur", "H"], ["thu", "H"], ["th", "H"],
    ["friday", "F"], ["fri", "F"],
    ["saturday", "S"], ["sat", "S"],
    ["sunday", "U"], ["sun", "U"], ["su", "U"],
    ["m", "M"], ["t", "T"], ["w", "W"], ["f", "F"],
  ] as [string, string][]
).sort((a, b) => b[0].length - a[0].length);

const DAY_ALT = DAY_NAMES.map(([name]) => name).join("|");
// A "run" is one or more day tokens back to back, optionally separated by
// slashes/commas/ampersands/spaces: "MW", "TTh", "Mon/Wed/Fri", "T & Th".
// Word-boundaried so single-letter tokens don't match inside other words.
const DAY_RUN_RE = new RegExp(`\\b(?:${DAY_ALT})(?:[\\s/,&-]*(?:${DAY_ALT}))*\\b`, "gi");

/** "MWF" / "Mon/Wed/Fri" / "TTh" -> ["M","W","F"] / ["T","H"]. */
function expandDayRun(run: string): string[] {
  const days: string[] = [];
  let rest = run;
  while (rest.length > 0) {
    const stripped = rest.replace(/^[\s/,&-]+/, "");
    if (stripped !== rest) {
      rest = stripped;
      continue;
    }
    const hit = DAY_NAMES.find(([name]) => rest.toLowerCase().startsWith(name));
    if (!hit) break; // shouldn't happen given DAY_RUN_RE, but never loop forever
    days.push(hit[1]);
    rest = rest.slice(hit[0].length);
  }
  return [...new Set(days)];
}

// ---- Time parsing -----------------------------------------------------------

/** Looser than time.ts's parseTimeToMilitary -- tolerates OCR noise like "3-4:15pm", "930am", "3.50 PM". */
function parseLooseTime(raw: string, inheritPeriod?: "AM" | "PM"): string | null {
  const cleaned = raw.trim().replace(/\./g, "").toUpperCase();
  const m = cleaned.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const period = (m[3] as "AM" | "PM" | undefined) ?? inheritPeriod;
  if (minutes > 59) return null;
  if (period) {
    if (hours < 1 || hours > 12) return null;
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
}

const TIME_RANGE_RE =
  /(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/;

/**
 * Scans OCR'd text line by line for "<label?> <day(s)> <start>-<end>"
 * patterns. Every field is a guess -- the review UI shows `sourceLine`
 * next to each one and lets the user fix or discard it before it's saved.
 */
export function parseScheduleText(text: string): ScheduleBlockDraft[] {
  const drafts: ScheduleBlockDraft[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const timeMatch = line.match(TIME_RANGE_RE);
    if (!timeMatch || timeMatch.index == null) continue;

    const before = line.slice(0, timeMatch.index);
    const dayRuns = [...before.matchAll(DAY_RUN_RE)];
    if (dayRuns.length === 0) continue; // no day info on this line -- skip rather than guess wrong
    const dayMatch = dayRuns[dayRuns.length - 1]; // the run closest to the time is the relevant one
    const days = expandDayRun(dayMatch[0]);
    if (days.length === 0 || dayMatch.index == null) continue;

    const label = before.slice(0, dayMatch.index).trim().replace(/[:\-–—]+$/, "").trim() || "Imported class";

    const endRaw = timeMatch[2];
    const endPeriodMatch = endRaw.toUpperCase().match(/AM|PM/);
    const endPeriod = endPeriodMatch ? (endPeriodMatch[0] as "AM" | "PM") : undefined;
    const end = parseLooseTime(endRaw, endPeriod);
    const start = parseLooseTime(timeMatch[1], endPeriod);

    for (const day of days) {
      drafts.push({ label, day, start, end, sourceLine: line });
    }
  }

  return drafts;
}
