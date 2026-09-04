// Mirrors backend/lib/term.ts's Term shape (kept tiny and duplicated
// on purpose — the app and the backend are separate deployables).

export type Term = { year: number; code: number };

export const TERM_CODES = { WINTER: 0, SPRING: 1, SUMMER: 7, FALL: 9 } as const;

export function termLabel(term: Term): string {
  const name =
    term.code === TERM_CODES.SPRING
      ? "Spring"
      : term.code === TERM_CODES.SUMMER
        ? "Summer"
        : term.code === TERM_CODES.FALL
          ? "Fall"
          : "Winter";
  return `${name} ${term.year}`;
}

export function termKey(term: Term): string {
  return `${term.year}-${term.code}`;
}

/**
 * Single best-guess default for Search's term picker. Previously this only
 * ever returned Spring for the literal month of January and Fall for
 * everything else including Feb-Aug -- meaning it showed Fall courses
 * while Spring semester was actually in session. Now it tracks which
 * semester is actually running:
 *   - Jan-May: Spring is in session (Jan add/drop through early May finals)
 *   - Jun-Jul: summer sessions
 *   - Aug-Dec: Fall is starting or running
 * Search's own term picker (see termOptions()) is what actually matters for
 * the Nov-Dec Spring-registration rush this app cares about most -- this
 * default just needs to be the *usual* right answer, not the only answer.
 */
export function guessCurrentTerm(now = new Date()): Term {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 1 && month <= 5) return { year, code: TERM_CODES.SPRING };
  if (month >= 6 && month <= 7) return { year, code: TERM_CODES.SUMMER };
  return { year, code: TERM_CODES.FALL };
}

/**
 * The terms Search's picker offers -- a full academic-year cycle starting
 * from whichever Fall is current (Jan-Aug counts as belonging to the
 * academic year that started the previous Fall). Deliberately wider than
 * the backend's own guessActiveTerms() (backend/lib/term.ts), which is
 * tuned narrowly for "what should the nightly ingest pull right now" --
 * someone should be able to pick next Fall from Search in February even
 * though ingest itself won't start pulling it for a while yet, and
 * shouldn't lose the ability to search last term the moment the calendar
 * flips. Four options, always in this same relative shape, so it never
 * needs a yearly code change.
 */
export function termOptions(now = new Date()): Term[] {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const fallYear = month >= 9 ? year : year - 1;
  return [
    { year: fallYear, code: TERM_CODES.FALL },
    { year: fallYear + 1, code: TERM_CODES.SPRING },
    { year: fallYear + 1, code: TERM_CODES.SUMMER },
    { year: fallYear + 1, code: TERM_CODES.FALL },
  ];
}

const TERM_PREF_KEY = "ruabsniper:searchTerm";

/**
 * The last term someone explicitly picked in Search, if it's still one of
 * the currently-offered termOptions() -- lets the choice survive closing
 * and reopening the app instead of resetting to guessCurrentTerm() every
 * time, while still "expiring" naturally once it rolls out of the current
 * academic-year window rather than getting stuck on a stale pick forever.
 */
export function loadTermPreference(now = new Date()): Term | null {
  const raw = localStorage.getItem(TERM_PREF_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Term;
    if (typeof parsed.year !== "number" || typeof parsed.code !== "number") return null;
    const stillOffered = termOptions(now).some((t) => t.year === parsed.year && t.code === parsed.code);
    return stillOffered ? parsed : null;
  } catch {
    return null;
  }
}

export function saveTermPreference(term: Term): void {
  localStorage.setItem(TERM_PREF_KEY, JSON.stringify(term));
}
