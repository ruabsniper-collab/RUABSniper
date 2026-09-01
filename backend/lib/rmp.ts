// Unofficial RateMyProfessors GraphQL client.
//
// RMP has no public API. This speaks to the same internal GraphQL endpoint
// their own site uses, the way community wrapper packages
// (@mtucourses/rate-my-professors, ratemyprofessor-api) do. It can break if
// RMP changes their schema — every call is wrapped so a break degrades to
// "no match" rather than crashing the whole ingest run.

import { distance } from "fastest-levenshtein";

const ENDPOINT = "https://www.ratemyprofessors.com/graphql";
// Well-known public token used by RMP's own web client for unauthenticated
// reads (base64 of "test:test"). Not a secret of ours.
const AUTH_HEADER = "Basic dGVzdDp0ZXN0";

export const RUTGERS_RMP_SCHOOL_ID = "825";

function schoolGraphId(numericId: string): string {
  return Buffer.from(`School-${numericId}`).toString("base64");
}

export type RmpCandidate = {
  legacyId: string;
  firstName: string;
  lastName: string;
  department: string | null;
  avgRating: number | null;
  numRatings: number | null;
  wouldTakeAgainPercent: number | null;
  avgDifficulty: number | null;
};

const SEARCH_QUERY = `
  query RuabsniperTeacherSearch($text: String!, $schoolID: ID!) {
    newSearch {
      teachers(query: { text: $text, schoolID: $schoolID }) {
        edges {
          node {
            legacyId
            firstName
            lastName
            department
            avgRating
            numRatings
            wouldTakeAgainPercent
            avgDifficulty
          }
        }
      }
    }
  }
`;

export async function searchProfessors(
  nameText: string,
  schoolNumericId = RUTGERS_RMP_SCHOOL_ID,
): Promise<RmpCandidate[]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: AUTH_HEADER,
    },
    body: JSON.stringify({
      query: SEARCH_QUERY,
      variables: { text: nameText, schoolID: schoolGraphId(schoolNumericId) },
    }),
  });

  if (!res.ok) {
    throw new Error(`RMP graphql ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as {
    data?: { newSearch?: { teachers?: { edges?: { node: RmpCandidate }[] } } };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(`RMP graphql errors: ${JSON.stringify(json.errors)}`);
  }

  return (json.data?.newSearch?.teachers?.edges ?? []).map((e) => e.node);
}

export function profileUrl(legacyId: string): string {
  return `https://www.ratemyprofessors.com/professor/${legacyId}`;
}

/** "Last, First Middle" (SOC format) -> { first, last } best-effort. */
export function splitSocName(socName: string): { first: string; last: string } {
  const [lastRaw, restRaw] = socName.split(",").map((s) => s?.trim() ?? "");
  const first = (restRaw ?? "").split(/\s+/)[0] ?? "";
  return { first, last: lastRaw ?? "" };
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z\s]/g, "");
}

/** 0..1, higher = more similar. */
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - distance(na, nb) / maxLen;
}

export type MatchResult =
  | { method: "exact" | "fuzzy"; confidence: number; candidate: RmpCandidate }
  | { method: "none"; confidence: 0; candidate: null };

/**
 * Fuzzy-matches a SOC instructor name against RMP search results.
 * Gate: last name must be reasonably close (>= 0.6) before a first-name/full
 * -name score is trusted — avoids matching "J. Smith" to an unrelated Smith.
 *
 * When SOC gives no first name at all (a bare last name, no comma — this
 * happens for real, verified live against several Fall 2026 instructors
 * like "NIKPOUR" and "DESORBO"), don't blend in a full-name comparison —
 * `similarity(" nikpour", "fereydoun nikpour")` scores badly no matter how
 * right the match is, since half the comparison is empty. Score on the last
 * name alone instead, just held to a much higher bar than the 0.6 gate,
 * since a bare surname is a weaker identifier than a full name.
 */
export function pickBestMatch(socName: string, candidates: RmpCandidate[]): MatchResult {
  const { first, last } = splitSocName(socName);
  if (!last || candidates.length === 0) return { method: "none", confidence: 0, candidate: null };

  let best: { score: number; candidate: RmpCandidate } | null = null;
  for (const c of candidates) {
    const lastSim = similarity(last, c.lastName ?? "");
    if (lastSim < 0.6) continue;
    const score = first
      ? lastSim * 0.4 + similarity(`${first} ${last}`, `${c.firstName ?? ""} ${c.lastName ?? ""}`) * 0.6
      : lastSim;
    // Tie-break toward the more-reviewed profile — RMP sometimes has a
    // second, all-zero "ghost" entry for the same real person (seen live:
    // Fereydoun Nikpour has one with 71 ratings and one with 0).
    if (!best || score > best.score || (score === best.score && (c.numRatings ?? 0) > (best.candidate.numRatings ?? 0))) {
      best = { score, candidate: c };
    }
  }

  if (!best) return { method: "none", confidence: 0, candidate: null };
  if (best.score >= 0.97) return { method: "exact", confidence: best.score, candidate: best.candidate };
  if (best.score >= 0.72) return { method: "fuzzy", confidence: best.score, candidate: best.candidate };
  return { method: "none", confidence: 0, candidate: null };
}
