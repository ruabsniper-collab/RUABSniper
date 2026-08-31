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

/** Same heuristic as the backend's guessActiveTerms, but just the single best guess for the app's default. */
export function guessCurrentTerm(now = new Date()): Term {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 9 && month <= 12) return { year, code: TERM_CODES.FALL };
  if (month === 1) return { year, code: TERM_CODES.SPRING };
  return { year, code: TERM_CODES.FALL };
}
