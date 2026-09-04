// The core "check every watch, notify on closed->open" logic, factored out
// of scripts/poll-and-notify.ts so both the single-shot script and the
// persistent scripts/poll-worker.ts (see that file for why a loop exists at
// all) share one implementation instead of drifting apart.
//
// Deliberately silent by default (no console.log calls in here) — the
// worker calls this every ~2-3 seconds forever, and logging per-term
// "N open indexes" at that cadence would flood the log with tens of
// thousands of near-identical lines a day. Callers that want that detail
// (poll-and-notify.ts, run rarely) log the returned summary themselves.

import { supabaseAdmin } from "./supabaseAdmin.js";
import { fetchOpenIndexes } from "./soc.js";
import { sendPushToDevice } from "./webPush.js";
import { termKey, type Term } from "./term.js";

type WatchRow = {
  id: string;
  device_id: string;
  term_year: number;
  term_code: number;
  index_number: string;
  last_status: boolean;
  notified_at: string | null;
};

async function loadWatches(): Promise<WatchRow[]> {
  const { data, error } = await supabaseAdmin.from("watches").select("*");
  if (error) throw error;
  return (data ?? []) as WatchRow[];
}

async function sectionLabel(termYear: number, termCode: number, indexNumber: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("sections")
    .select("section_number, courses(subject_code, course_number, title)")
    .eq("term_year", termYear)
    .eq("term_code", termCode)
    .eq("index_number", indexNumber)
    .maybeSingle();

  const course = (data as { courses?: { subject_code?: string; course_number?: string; title?: string } | null })
    ?.courses;
  if (!course) return `index ${indexNumber}`;
  return `${course.subject_code}:${course.course_number} ${course.title} (sec ${
    (data as { section_number?: string })?.section_number ?? "?"
  }, index ${indexNumber})`;
}

export type PollResult = {
  checked: number;
  opened: number;
  closedAgain: number;
  openedLabels: string[];
  termsChecked: { term: Term; openCount: number }[];
  termErrors: { term: Term; message: string }[];
};

export async function pollOnce(): Promise<PollResult> {
  const watches = await loadWatches();
  if (watches.length === 0) {
    return { checked: 0, opened: 0, closedAgain: 0, openedLabels: [], termsChecked: [], termErrors: [] };
  }

  const termsToCheck = new Map<string, Term>();
  for (const w of watches)
    termsToCheck.set(termKey({ year: w.term_year, code: w.term_code }), { year: w.term_year, code: w.term_code });

  const openByTerm = new Map<string, Set<string>>();
  const termsChecked: PollResult["termsChecked"] = [];
  const termErrors: PollResult["termErrors"] = [];
  for (const term of termsToCheck.values()) {
    try {
      const openSet = await fetchOpenIndexes(term);
      openByTerm.set(termKey(term), openSet);
      termsChecked.push({ term, openCount: openSet.size });
    } catch (err) {
      termErrors.push({ term, message: err instanceof Error ? err.message : String(err) });
    }
  }

  let opened = 0;
  let closedAgain = 0;
  const openedLabels: string[] = [];

  for (const w of watches) {
    const key = termKey({ year: w.term_year, code: w.term_code });
    const openSet = openByTerm.get(key);
    if (!openSet) continue; // that term's fetch failed this run; leave the watch untouched

    const isOpenNow = openSet.has(w.index_number);

    if (isOpenNow && !w.last_status) {
      // closed -> open: notify just this watch's device, right away.
      //
      // This UPDATE ... WHERE last_status = false is the atomic claim on
      // "am I the one who gets to notify for this flip" -- poll-worker.ts's
      // loop and web/api/poll.ts's 1-minute cron both run against the same
      // watches table at once, by design (see poll-worker.ts's comment),
      // and a plain read-then-send-then-write let both of them read
      // last_status=false in the same window and both send a push before
      // either write landed -- confirmed as the actual cause of duplicate
      // "seat opened" notifications in production, not just a theoretical
      // race. Postgres serializes concurrent UPDATEs to the same row, so
      // exactly one caller's WHERE clause still matches and gets a row
      // back; only that one is allowed to send. The loser affects zero
      // rows and silently skips -- no error, no double-notify.
      const { data: claimed, error: claimErr } = await supabaseAdmin
        .from("watches")
        .update({ last_status: true, notified_at: new Date().toISOString() })
        .eq("id", w.id)
        .eq("last_status", false)
        .select("id");
      if (claimErr) throw claimErr;
      if (claimed && claimed.length > 0) {
        opened++;
        const label = await sectionLabel(w.term_year, w.term_code, w.index_number);
        openedLabels.push(`${label} (device ${w.device_id})`);
        await sendPushToDevice(w.device_id, {
          title: "A seat opened up!",
          body: label,
          // year/code let RegisterPage fetch this exact section instead of
          // guessing "whichever term has this index number most recently"
          // -- see web/src/lib/courses.ts's getSectionByIndex comment for
          // why that guess is a real risk once more than one term is
          // active at once (now normal, since Search added a term picker).
          url: `/register?index=${w.index_number}&label=${encodeURIComponent(label)}&year=${w.term_year}&code=${w.term_code}`,
        });
      }
    } else if (!isOpenNow && w.last_status) {
      // open -> closed again: reset so a future re-open notifies again.
      closedAgain++;
      await supabaseAdmin.from("watches").update({ last_status: false, notified_at: null }).eq("id", w.id);
    }
  }

  return { checked: watches.length, opened, closedAgain, openedLabels, termsChecked, termErrors };
}
