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
import { searchProfessors, pickBestMatch, profileUrl, splitSocName } from "../lib/rmp.js";

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
  // Paginated for the same reason distinctInstructorNames() already is:
  // Supabase/PostgREST caps an unpaginated select at 1000 rows by default.
  // Once professor_rmp_matches passed 1000 rows, an unpaginated query here
  // silently returned an incomplete slice -- pending ended up re-including
  // names that were actually already fresh, so runs kept re-matching the
  // same ~1000 professors instead of making progress through the rest.
  // Verified live: two runs in a row logged "1000 already fresh" and the
  // table's actual row count didn't move at all between them.
  const cutoff = new Date(Date.now() - RE_MATCH_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const names = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("professor_rmp_matches")
      .select("instructor_name")
      .gte("updated_at", cutoff)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) names.add(row.instructor_name as string);
    if (data.length < pageSize) break;
  }
  return names;
}

async function main() {
  const [allNames, fresh] = await Promise.all([distinctInstructorNames(), alreadyFreshNames()]);
  const pending = allNames.filter((n) => !fresh.has(n)).slice(0, MAX_PER_RUN);

  console.log(
    `[match] ${allNames.length} distinct instructors, ${fresh.size} already fresh, matching ${pending.length} this run`,
  );

  let matched = 0;
  let unmatched = 0;
  let failed = 0;

  for (const socName of pending) {
    try {
      // RMP's search endpoint returns noticeably worse (often just wrong)
      // results for SOC's "Last, First" order than for natural "First
      // Last" order -- verified live: searching "hughes, david" surfaced
      // ten unrelated Davids and never the real match, while "david
      // hughes" put him first. So reformat before searching; pickBestMatch
      // still scores against the original socName/split, only the text
      // sent to RMP changes.
      const { first, last } = splitSocName(socName);
      const queryText = first ? `${first} ${last}` : last;
      const candidates = await searchProfessors(queryText);
      const result = pickBestMatch(socName, candidates);

      // Checking `error` here matters: without it, a failed write (a
      // transient Supabase hiccup, a rate limit, whatever) silently vanishes
      // — the run still logs "done: N matched" even though nothing was
      // saved, and since alreadyFreshNames() only counts rows that actually
      // made it into the table, that RMP request was just wasted rather than
      // recorded. Caught here, it lands in the same catch block below and
      // gets retried on a future run instead of disappearing unnoticed.
      const { error } = await supabaseAdmin.from("professor_rmp_matches").upsert(
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
      if (error) throw error;

      if (result.method === "none") unmatched++;
      else matched++;
    } catch (err) {
      failed++;
      console.error(`[match] failed for "${socName}":`, err instanceof Error ? err.message : err);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(
    `[match] done: ${matched} matched, ${unmatched} unmatched, ${failed} failed (will retry next run) this run`,
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
