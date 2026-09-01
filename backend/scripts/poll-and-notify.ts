// The core "sniper" job: checks every watched section's open/closed status
// and sends a real Web Push notification the moment one flips closed -> open,
// straight to the device that owns that watch (see backend/lib/webPush.ts).
//
// Run manually: `npm run poll-and-notify`
// Run in CI: .github/workflows/poll-and-notify.yml (every 5 min, GitHub
// Actions' cron floor — see the plan doc for why this isn't sub-minute).

import "dotenv/config";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { fetchOpenIndexes } from "../lib/soc.js";
import { sendPushToDevice } from "../lib/webPush.js";
import { termKey, termLabel, type Term } from "../lib/term.js";

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

async function main() {
  const watches = await loadWatches();
  if (watches.length === 0) {
    console.log("[poll] no active watches, nothing to do");
    return;
  }

  const termsToCheck = new Map<string, Term>();
  for (const w of watches)
    termsToCheck.set(termKey({ year: w.term_year, code: w.term_code }), { year: w.term_year, code: w.term_code });

  const openByTerm = new Map<string, Set<string>>();
  for (const term of termsToCheck.values()) {
    try {
      openByTerm.set(termKey(term), await fetchOpenIndexes(term));
      console.log(`[poll] ${termLabel(term)}: ${openByTerm.get(termKey(term))!.size} open indexes`);
    } catch (err) {
      console.error(`[poll] failed to fetch open sections for ${termLabel(term)}:`, err);
    }
  }

  let opened = 0;
  let closedAgain = 0;

  for (const w of watches) {
    const key = termKey({ year: w.term_year, code: w.term_code });
    const openSet = openByTerm.get(key);
    if (!openSet) continue; // that term's fetch failed this run; leave the watch untouched

    const isOpenNow = openSet.has(w.index_number);

    if (isOpenNow && !w.last_status) {
      // closed -> open: notify just this watch's device, right away — no
      // more batching into one end-of-run email to one fixed address, since
      // different devices can (and, once shared with friends, will) own
      // different watches.
      opened++;
      const label = await sectionLabel(w.term_year, w.term_code, w.index_number);
      console.log(`[poll] OPENED: ${label} (device ${w.device_id})`);
      await sendPushToDevice(w.device_id, {
        title: "A seat opened up!",
        body: label,
        url: "/watches",
      });
      await supabaseAdmin
        .from("watches")
        .update({ last_status: true, notified_at: new Date().toISOString() })
        .eq("id", w.id);
    } else if (!isOpenNow && w.last_status) {
      // open -> closed again: reset so a future re-open notifies again.
      closedAgain++;
      await supabaseAdmin.from("watches").update({ last_status: false, notified_at: null }).eq("id", w.id);
    }
  }

  console.log(`[poll] done: ${opened} newly opened, ${closedAgain} closed again, ${watches.length} watches checked`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
