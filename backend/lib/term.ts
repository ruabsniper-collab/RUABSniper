// Term helpers.
//
// Rutgers SOC term codes: 1 = Spring, 7 = Summer, 9 = Fall, 0 = Winter.

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

/**
 * Best-guess "current registration term" from today's date. This is only
 * used as a sensible default for the nightly full-catalog ingest — actual
 * watches always carry an explicit term, so notifications never depend on
 * this guess being right.
 *
 * Rough Rutgers registration calendar:
 *   - Nov–Jan: registering for Spring (and Winter session)
 *   - Feb–Aug: registering for Summer and/or Fall
 *   - Sep–Oct: Fall is running, Spring registration opens late Oct/Nov
 */
export function guessActiveTerms(now = new Date()): Term[] {
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();

  if (month >= 9 && month <= 12) {
    // Fall running; Spring registration typically opens ~late October.
    return [
      { year, code: TERM_CODES.FALL },
      { year: month >= 10 ? year + 1 : year, code: TERM_CODES.SPRING },
    ];
  }
  if (month === 1) {
    return [{ year, code: TERM_CODES.SPRING }];
  }
  // Feb–Aug: Summer + Fall registration season.
  return [
    { year, code: TERM_CODES.SUMMER },
    { year, code: TERM_CODES.FALL },
  ];
}

export function termKey(term: Term): string {
  return `${term.year}-${term.code}`;
}
