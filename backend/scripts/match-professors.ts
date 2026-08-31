// Refreshes the professor -> RateMyProfessors match cache for every
// instructor currently appearing in the `sections` table.
//
// Run manually: `npm run match-professors`
// Run in CI: .github/workflows/match-professors.yml (nightly)
//
// Every match carries a confidence score and is never presented as
// certain — see backend/lib/rmp.ts for the matching heuristic, and the
// mobile app's professor badge for how "unrated"/low-confidence is shown.

import "dotenv/config";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { searchProfessors, pickBestMatch, profileUrl } from "../lib/rmp.js";

const MAX_PER_RUN = 400; // keep each run reasonably short; nightly cron catches the rest
const RE_MATCH_AFTER_DAYS = 14;
const REQUEST_DELAY_MS = 250; // be polite to RMP's endpoint

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function distinctInstructorNames(): Promise<string[]> {
  const names = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("sections")
      .select("instructors")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      for (const raw of (row.instructors as string[]) ?? []) {
        const n = normalizeName(raw);
        if (n) names.add(n);
      }
    }
    if (data.length < pageSize) break;
  }
  return [...names];
}

async function alreadyFreshNames(): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - RE_MATCH_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("professor_rmp_matches")
    .select("instructor_name")
    .gte("updated_at", cutoff);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.instructor_name as string));
}

async function main() {
  const [allNames, fresh] = await Promise.all([distinctInstructorNames(), alreadyFreshNames()]);
  const pending = allNames.filter((n) => !fresh.has(n)).slice(0, MAX_PER_RUN);

  console.log(
    `[match] ${allNames.length} distinct instructors, ${fresh.size} already fresh, matching ${pending.length} this run`,
  );

  let matched = 0;
  let unmatched = 0;

  for (const socName of pending) {
    try {
      // socName is normalized (lowercase). RMP search is case-insensitive
      // in practice, but candidates still carry their real-cased names.
      const candidates = await searchProfessors(socName);
      const result = pickBestMatch(socName, candidates);

      await supabaseAdmin.from("professor_rmp_matches").upsert(
        {
          instructor_name: socName,
          rmp_legacy_id: result.candidate?.legacyId ?? null,
          rmp_first_name: result.candidate?.firstName ?? null,
          rmp_last_name: result.candidate?.lastName ?? null,
          rmp_department: result.candidate?.department ?? null,
          avg_rating: result.candidate?.avgRating ?? null,
          num_ratings: result.candidate?.numRatings ?? null,
          would_take_again_percent: result.candidate?.wouldTakeAgainPercent ?? null,
          difficulty: result.candidate?.avgDifficulty ?? null,
          profile_url: result.candidate ? profileUrl(result.candidate.legacyId) : null,
          confidence: result.confidence,
          match_method: result.method,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "instructor_name" },
      );

      if (result.method === "none") unmatched++;
      else matched++;
    } catch (err) {
      console.error(`[match] failed for "${socName}":`, err instanceof Error ? err.message : err);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`[match] done: ${matched} matched, ${unmatched} unmatched this run`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
