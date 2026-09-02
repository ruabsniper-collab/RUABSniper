// Best-effort screenshot -> schedule-block parser. There's no reliable way
// to parse an arbitrary schedule screenshot (a WebReg grid, a Schedule
// Planner export, a calendar app, or a photo of a printed schedule) with
// certainty, so this follows the same philosophy as backend/lib/rmp.ts:
// make the best automatic guess, expose exactly what was guessed (including
// the source line it came from), and let the human confirm or fix every
// field before anything is saved. See components/ScreenshotImport.tsx for
// the review UI -- nothing in this file writes to storage.

import { normalizeCampusName } from "./campus";
import { nearestCampusByColor, type RGB } from "./colorSample";

export type ScheduleBlockDraft = {
  label: string;
  day: string; // M/T/W/H/F/S/U
  start: string | null; // "HHMM" military, or null if the time couldn't be read
  end: string | null;
  sourceLine: string; // the OCR'd line this was guessed from, shown for review
  dayGuessed?: boolean; // true when `day` is a placeholder, not read from the image
  courseKey?: string; // "subjectCode:courseNumber" read off a SOC-style course-code line, when one was found -- lets Search recognize "same course, different section" instead of a hard conflict
  campus?: string; // one of campus.ts's canonical CAMPUS_VALUES, when recognizable text was found near the course-code line -- powers the cross-campus travel-time conflict check
};

/** One OCR'd line with its pixel bounding box, reconstructed from OCR.space's word-level overlay data. */
export type PositionedLine = { text: string; left: number; top: number; width: number; height: number };

export type OcrResult = { text: string; lines: PositionedLine[] };

const OCR_ENDPOINT = "https://api.ocr.space/parse/image";

type OcrSpaceWord = { WordText?: string; Left?: number; Top?: number; Width?: number; Height?: number };
type OcrSpaceLine = { Words?: OcrSpaceWord[]; MaxHeight?: number; MinTop?: number };

/**
 * OCR.space often splits one visually-tight token (e.g. "8:30") into
 * several "words" ("8", ":", "30") that all share the *same* (or
 * overlapping) bounding box, rather than one word with sub-pixel-accurate
 * boxes. Verified against a real API response: those sub-tokens' gaps
 * (nextWord.Left - (prevWord.Left + prevWord.Width)) come back sharply
 * negative (-21 to -26 in the sample), while genuine word boundaries are a
 * tiny positive gap (+1 to +2, since the mock schedule's font is small).
 * Blindly joining every word with " " turned "8:30 AM" into "8 : 30 AM",
 * which TIME_RANGE_RE (and the course-code / credits regexes) don't match
 * at all -- silently zeroing out every draft. Only insert a space when the
 * gap is actually positive.
 */
function joinWords(words: OcrSpaceWord[]): string {
  let text = "";
  let prevRight: number | null = null;
  for (const w of words) {
    const left = w.Left ?? 0;
    if (prevRight != null && left - prevRight > 0) text += " ";
    text += w.WordText ?? "";
    prevRight = left + (w.Width ?? 0);
  }
  return text;
}

function toPositionedLines(lines: OcrSpaceLine[] | undefined): PositionedLine[] {
  const out: PositionedLine[] = [];
  for (const line of lines ?? []) {
    const words = (line.Words ?? []).filter((w) => w.WordText);
    if (words.length === 0) continue;
    const lefts = words.map((w) => w.Left ?? 0);
    const rights = words.map((w) => (w.Left ?? 0) + (w.Width ?? 0));
    const left = Math.min(...lefts);
    out.push({
      text: joinWords(words),
      left,
      top: line.MinTop ?? Math.min(...words.map((w) => w.Top ?? 0)),
      width: Math.max(...rights) - left,
      height: line.MaxHeight ?? Math.max(...words.map((w) => w.Height ?? 0)),
    });
  }
  return out;
}

/**
 * Sends a JPEG (base64, no "data:" prefix) to OCR.space's free tier and
 * returns both the plain recognized text and, when available, each line's
 * pixel position (isOverlayRequired) -- the position data is what lets
 * parseScheduleImage() below match a class to the day column it's actually
 * under, instead of guessing. Get a free key (no card required, 25k
 * requests/month / 500 a day) at https://ocr.space/ocrapi/freekey and put
 * it in web/.env as VITE_OCR_SPACE_API_KEY -- see web/.env.example. Run
 * entirely client-side; nothing about this call touches Supabase or the
 * backend.
 */
export async function runScheduleOcr(base64Jpeg: string): Promise<OcrResult> {
  const apiKey = import.meta.env.VITE_OCR_SPACE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing VITE_OCR_SPACE_API_KEY. Get a free key at https://ocr.space/ocrapi/freekey " +
        "and add it to web/.env (see web/.env.example).",
    );
  }

  const form = new FormData();
  form.append("apikey", apiKey);
  form.append("language", "eng");
  form.append("isTable", "true"); // schedules are usually grid-shaped
  form.append("scale", "true"); // upscales small grid text before OCR
  form.append("OCREngine", "2"); // engine 2 reads small/dense text more reliably
  form.append("isOverlayRequired", "true"); // word positions -- see toPositionedLines()
  form.append("base64Image", `data:image/jpeg;base64,${base64Jpeg}`);

  const res = await fetch(OCR_ENDPOINT, { method: "POST", body: form });
  if (!res.ok) throw new Error(`OCR.space request failed: ${res.status} ${res.statusText}`);

  const json = (await res.json()) as {
    IsErroredOnProcessing?: boolean;
    ErrorMessage?: string | string[];
    ParsedResults?: { ParsedText?: string; TextOverlay?: { Lines?: OcrSpaceLine[] } }[];
  };

  if (json.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join("; ") : json.ErrorMessage;
    throw new Error(msg || "OCR.space couldn't process that image.");
  }

  const results = json.ParsedResults ?? [];
  return {
    text: results.map((r) => r.ParsedText ?? "").join("\n"),
    lines: results.flatMap((r) => toPositionedLines(r.TextOverlay?.Lines)),
  };
}

// ---- Day names ---------------------------------------------------------------

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

/** True only if the *entire* line is one day name/abbreviation — a calendar grid's column header, not prose mentioning a day. */
function wholeLineDay(text: string): string | null {
  const cleaned = text.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!cleaned || cleaned.length > 9) return null; // longer than "wednesday" can't be a bare day name
  const hit = DAY_NAMES.find(([name]) => name === cleaned && name.length > 1); // single letters are too ambiguous as a whole-line match
  return hit ? hit[1] : null;
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

function parseTimeRange(m: RegExpMatchArray): { start: string | null; end: string | null } {
  const endRaw = m[2];
  const endPeriodMatch = endRaw.toUpperCase().match(/AM|PM/);
  const endPeriod = endPeriodMatch ? (endPeriodMatch[0] as "AM" | "PM") : undefined;
  return { start: parseLooseTime(m[1], endPeriod), end: parseLooseTime(endRaw, endPeriod) };
}

// ---- Simple-list parsing (no position data) ----------------------------------

/**
 * Scans OCR'd text line by line for "<label?> <day(s)> <start>-<end>"
 * patterns -- for a schedule that's typed out as a list ("CS 111 MW
 * 3:50-5:10"), or as a fallback when no position data came back from OCR.
 * Every field is a guess -- the review UI shows `sourceLine` next to each
 * one and lets the user fix or discard it before it's saved.
 */
export function parseScheduleText(text: string): ScheduleBlockDraft[] {
  const drafts: ScheduleBlockDraft[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const timeMatch = line.match(TIME_RANGE_RE);
    if (!timeMatch || timeMatch.index == null) continue;
    const { start, end } = parseTimeRange(timeMatch);

    const before = line.slice(0, timeMatch.index);
    const dayRuns = [...before.matchAll(DAY_RUN_RE)];

    if (dayRuns.length === 0) {
      const label = before.trim().replace(/[:\-–—]+$/, "").trim() || "Imported class";
      drafts.push({ label, day: "M", start, end, sourceLine: line, dayGuessed: true });
      continue;
    }

    const dayMatch = dayRuns[dayRuns.length - 1]; // the run closest to the time is the relevant one
    const days = expandDayRun(dayMatch[0]);
    if (days.length === 0 || dayMatch.index == null) continue;

    const label = before.slice(0, dayMatch.index).trim().replace(/[:\-–—]+$/, "").trim() || "Imported class";

    for (const day of days) {
      drafts.push({ label, day, start, end, sourceLine: line });
    }
  }

  return drafts;
}

// ---- Calendar-grid parsing (uses OCR word positions) -------------------------

// SOC's own "school:subject:course:section:index" style code, e.g.
// "01:640:151:01:12932" -- WebReg prints this under every class's title, so
// it's a reliable signal that the title portion of a block has ended. The
// middle two groups (subject, course number) are the same identity SOC's
// own courses table keys on -- capturing them lets a schedule block imported
// this way be recognized as "the same course" as a section found in Search,
// not just matched on time (see courseKey on ScheduleBlockDraft).
const COURSE_CODE_RE = /^\d{2}:(\d{3}):(\d{3})/;
// "(4.0)" credits, printed right after the code line.
const CREDITS_RE = /^\(\d/;

/**
 * A WebReg Calendar-view screenshot names each day exactly once, as a
 * column header -- never as text next to an individual class block -- so
 * there's nothing for parseScheduleText()'s per-line day search to find.
 * With OCR.space's word positions (see runScheduleOcr), the real fix is the
 * obvious one: find the header row, then match every class block to
 * whichever day column it actually sits under by X position, the same way
 * a person reading the grid would. This also lets each block's title be
 * reconstructed from the lines directly below its time (same column, before
 * the course-code line) instead of falling back to a placeholder.
 *
 * Falls back to parseScheduleText(text) when no day-header row is found --
 * either OCR didn't return position data, or this isn't a grid at all (a
 * typed list, a photo of a printout, etc.).
 *
 * `sampleColor` is an optional pixel-color reader (left, top, width, height)
 * -> average RGB over that region, backed by a canvas of the original
 * screenshot (see colorSample.ts) -- ScreenshotImport wires this up. When
 * given, a campus color legend is built from the campus-name chips WebReg
 * prints above the day headers, and used as a fallback for any block whose
 * room/campus text didn't yield a match. Omitting it (as every existing
 * caller and test does) just skips this entirely -- campus detection still
 * works off text alone, same as before this existed.
 */
export function parseScheduleImage(
  result: OcrResult,
  sampleColor?: (left: number, top: number, width: number, height: number) => RGB | null,
): ScheduleBlockDraft[] {
  const { lines, text } = result;

  const dayLines = lines
    .map((line) => ({ line, day: wholeLineDay(line.text) }))
    .filter((x): x is { line: PositionedLine; day: string } => x.day != null);

  if (dayLines.length < 2) return parseScheduleText(text); // not a grid we can read positionally

  // The header row is the tightest cluster of day-name lines near the top —
  // there's exactly one occurrence of each day name as a header, at nearly
  // identical Top values, well above any within-cell text.
  const minTop = Math.min(...dayLines.map((d) => d.line.top));
  const tolerance = Math.max(20, ...dayLines.map((d) => d.line.height)); // scale with the image's actual font size
  const headerRow = dayLines
    .filter((d) => d.line.top <= minTop + tolerance)
    .map((d) => ({ day: d.day, centerX: d.line.left + d.line.width / 2 }));
  if (headerRow.length < 2) return parseScheduleText(text);

  // Campus color legend, built once from whatever campus-name chips sit
  // above the day-header row (the legend, not a class block) -- their own
  // bounding box IS their colored chip, so sampling it directly gives that
  // campus's color for this specific screenshot (compression/theme can
  // shift exact values run to run, so calibrating per-screenshot beats a
  // hardcoded color table).
  const colorLegend = new Map<string, RGB>();
  if (sampleColor) {
    for (const line of lines) {
      if (line.top >= minTop) continue;
      const campus = normalizeCampusName(line.text);
      if (!campus || colorLegend.has(campus)) continue;
      const color = sampleColor(line.left, line.top, line.width, line.height);
      if (color) colorLegend.set(campus, color);
    }
  }

  function nearestColumn(centerX: number): string {
    return headerRow.reduce((best, col) =>
      Math.abs(col.centerX - centerX) < Math.abs(best.centerX - centerX) ? col : best,
    ).day;
  }

  const drafts: ScheduleBlockDraft[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const timeMatch = line.text.match(TIME_RANGE_RE);
    if (!timeMatch) continue;

    const { start, end } = parseTimeRange(timeMatch);
    const day = nearestColumn(line.left + line.width / 2);
    const blockCenterX = line.left + line.width / 2;

    // Reconstruct the title from the lines right after the time, same
    // column (within half the header's own column width, generous enough
    // for text that's narrower or wider than the time line itself), up
    // until the course-code line, a credits line, the next time range, or
    // 3 lines out -- whichever comes first.
    const columnWidth =
      headerRow.length > 1
        ? Math.abs(headerRow[1].centerX - headerRow[0].centerX)
        : line.width * 2;
    const titleParts: string[] = [];
    let courseKey: string | undefined;
    let codeLineIndex: number | null = null;
    for (let j = i + 1; j < lines.length && titleParts.length < 3; j++) {
      const next = lines[j];
      // Same-row neighboring columns interleave in OCR's overall line order
      // (e.g. Tue/Thu/Fri classes that all happen to start at 12:10 PM emit
      // their lines back to back) -- a course-code/credits/time line from a
      // *different* day's block must not stop this block's title search, or
      // it never reaches this block's own title further down the list.
      // Checked first, before any of the stop patterns below, for exactly
      // that reason: verified live, this was silently producing "Imported
      // class" for a real class whose title just wasn't the very next line.
      const sameColumn = Math.abs(next.left + next.width / 2 - blockCenterX) < columnWidth / 2;
      if (!sameColumn) continue;
      const trimmed = next.text.trim();
      if (TIME_RANGE_RE.test(next.text)) break; // this column's own next class -- stop
      const codeMatch = trimmed.match(COURSE_CODE_RE);
      if (codeMatch) {
        courseKey = `${codeMatch[1]}:${codeMatch[2]}`;
        codeLineIndex = j;
        break;
      }
      if (CREDITS_RE.test(trimmed)) break; // this column's own credits line -- stop
      titleParts.push(trimmed);
    }

    // Campus/room text (e.g. "(3.0) SC-203 College Avenue") sits on or right
    // after the course-code line -- a short separate scan from there, since
    // the title loop above already stopped at that line without reading it.
    // Best-effort only: if nothing recognizable turns up, campus is just
    // left unset and this block simply never takes part in the travel-time
    // conflict check (see checkConflict) -- no different from before this
    // existed.
    let campus: string | undefined;
    if (codeLineIndex != null) {
      for (let j = codeLineIndex; j < lines.length && j < codeLineIndex + 3; j++) {
        const next = lines[j];
        if (j !== codeLineIndex && TIME_RANGE_RE.test(next.text)) break;
        const sameColumn = Math.abs(next.left + next.width / 2 - blockCenterX) < columnWidth / 2;
        if (!sameColumn) continue;
        const found = normalizeCampusName(next.text);
        if (found) {
          campus = found;
          break;
        }
      }
    }

    // Color fallback: only when the text search above found nothing, and
    // only when a legend was actually built for this screenshot. Sampled
    // from the time line's own region, which sits inside the same colored
    // cell as the rest of the block.
    if (!campus && sampleColor && colorLegend.size > 0) {
      const blockColor = sampleColor(line.left, line.top, line.width, line.height);
      if (blockColor) campus = nearestCampusByColor(blockColor, colorLegend) ?? undefined;
    }

    drafts.push({
      label: titleParts.join(" ").trim() || "Imported class",
      day,
      start,
      courseKey,
      campus,
      end,
      sourceLine: line.text,
    });
  }

  return drafts;
}
