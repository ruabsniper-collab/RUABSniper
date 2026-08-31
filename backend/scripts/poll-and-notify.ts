// The core "sniper" job: checks every watched section's open/closed status
// and pushes a notification the moment one flips closed -> open.
//
// Run manually: `npm run poll-and-notify`
// Run in CI: .github/workflows/poll-and-notify.yml (every 5 min, GitHub
// Actions' cron floor — see the plan doc for why this isn't sub-minute).

import "dotenv/config";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { fetchOpenIndexes } from "../lib/soc.js";
import { sendExpoPushNotifications, type ExpoPushMessage } from "../lib/expoPush.js";
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

async function pushTokenFor(deviceId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("push_tokens")
    .select("expo_push_token")
    .eq("device_id", deviceId)
    .maybeSingle();
  return (data?.expo_push_token as string | undefined) ?? null;
}

async function main() {
  const watches = await loadWatches();
  if (watches.length === 0) {
    console.log("[poll] no active watches, nothing to do");
    return;
  }

  const termsToCheck = new Map<string, Term>();
  for (const w of watches) termsToCheck.set(termKey({ year: w.term_year, code: w.term_code }), { year: w.term_year, code: w.term_code });

  const openByTerm = new Map<string, Set<string>>();
  for (const term of termsToCheck.values()) {
    try {
      openByTerm.set(termKey(term), await fetchOpenIndexes(term));
      console.log(`[poll] ${termLabel(term)}: ${openByTerm.get(termKey(term))!.size} open indexes`);
    } catch (err) {
      console.error(`[poll] failed to fetch open sections for ${termLabel(term)}:`, err);
    }
  }

  const messages: ExpoPushMessage[] = [];
  let opened = 0;
  let closedAgain = 0;

  for (const w of watches) {
    const key = termKey({ year: w.term_year, code: w.term_code });
    const openSet = openByTerm.get(key);
    if (!openSet) continue; // that term's fetch failed this run; leave the watch untouched

    const isOpenNow = openSet.has(w.index_number);

    if (isOpenNow && !w.last_status) {
      // closed -> open: notify (unless somehow already notified and still open, which
      // can't happen here since last_status was false).
      opened++;
      const token = await pushTokenFor(w.device_id);
      const label = await sectionLabel(w.term_year, w.term_code, w.index_number);
      console.log(`[poll] OPENED: device ${w.device_id} — ${label}`);
      if (token) {
        messages.push({
          to: token,
          title: "A seat opened up 🎉",
          body: label,
          sound: "default",
          data: { indexNumber: w.index_number, termYear: w.term_year, termCode: w.term_code },
        });
      } else {
        console.warn(`[poll] no push token registered for device ${w.device_id}, skipping push`);
      }
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

  if (messages.length > 0) await sendExpoPushNotifications(messages);
  console.log(`[poll] done: ${opened} newly opened, ${closedAgain} closed again, ${watches.length} watches checked`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
