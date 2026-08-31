// Refreshes the `courses` / `sections` cache from the Rutgers SOC API.
//
// Run manually: `npm run ingest-courses`
// Run in CI: .github/workflows/ingest-courses.yml (every 6h)
//
// Terms ingested = a date-based guess at the active registration terms,
// plus any term someone actually has a watch on (so a watch never goes
// stale just because our guess was wrong).

import "dotenv/config";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { fetchCourses, parseInstructorNames, type SocCourse } from "../lib/soc.js";
import { guessActiveTerms, termKey, termLabel, type Term } from "../lib/term.js";

async function watchedTerms(): Promise<Term[]> {
  const { data, error } = await supabaseAdmin.from("watches").select("term_year, term_code");
  if (error) throw error;
  const seen = new Map<string, Term>();
  for (const row of data ?? []) {
    const t = { year: row.term_year as number, code: row.term_code as number };
    seen.set(termKey(t), t);
  }
  return [...seen.values()];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function ingestTerm(term: Term, campus = "NB") {
  console.log(`[ingest] fetching ${termLabel(term)} (${campus})...`);
  const courses: SocCourse[] = await fetchCourses(term, campus);
  console.log(`[ingest] ${termLabel(term)}: ${courses.length} courses from SOC`);

  const courseRows = courses.map((c) => ({
    term_year: term.year,
    term_code: term.code,
    campus,
    subject_code: c.subject,
    subject_description: c.subjectDescription ?? null,
    course_number: c.courseNumber,
    title: c.title,
    credits: typeof c.credits === "number" ? c.credits : Number(c.credits) || null,
    core_codes: (c.coreCodes ?? []).map((cc) => cc.coreCode).filter((x): x is string => Boolean(x)),
    raw: c,
    updated_at: new Date().toISOString(),
  }));

  const idByKey = new Map<string, string>();
  for (const batch of chunk(courseRows, 500)) {
    const { data, error } = await supabaseAdmin
      .from("courses")
      .upsert(batch, { onConflict: "term_year,term_code,campus,subject_code,course_number" })
      .select("id, subject_code, course_number");
    if (error) throw error;
    for (const row of data ?? []) {
      idByKey.set(`${row.subject_code}::${row.course_number}`, row.id as string);
    }
  }
  console.log(`[ingest] ${termLabel(term)}: upserted ${courseRows.length} courses`);

  const sectionRows: Record<string, unknown>[] = [];
  for (const c of courses) {
    const courseId = idByKey.get(`${c.subject}::${c.courseNumber}`);
    if (!courseId) continue; // shouldn't happen, but don't crash the whole run over it
    for (const s of c.sections ?? []) {
      if (!s.index) continue;
      sectionRows.push({
        course_id: courseId,
        term_year: term.year,
        term_code: term.code,
        index_number: String(s.index),
        section_number: s.number ?? "",
        instructors: parseInstructorNames(s),
        open: Boolean(s.openStatus),
        meeting_times: (s.meetingTimes ?? []).map((m) => ({
          day: m.meetingDay ?? null,
          // 24h "HHMM", e.g. "1550" = 3:50 PM — see the NOTE on SocMeetingTime.
          start: m.startTimeMilitary ?? null,
          end: m.endTimeMilitary ?? null,
          campus: m.campusName ?? null,
          building: m.buildingCode ?? null,
          room: m.roomNumber ?? null,
        })),
        comments: s.commentsText ?? null,
        updated_at: new Date().toISOString(),
      });
    }
  }

  for (const batch of chunk(sectionRows, 500)) {
    const { error } = await supabaseAdmin
      .from("sections")
      .upsert(batch, { onConflict: "term_year,term_code,index_number" });
    if (error) throw error;
  }
  console.log(`[ingest] ${termLabel(term)}: upserted ${sectionRows.length} sections`);
}

async function main() {
  const terms = new Map<string, Term>();
  for (const t of guessActiveTerms()) terms.set(termKey(t), t);
  for (const t of await watchedTerms()) terms.set(termKey(t), t);

  if (terms.size === 0) {
    console.log("[ingest] no terms to ingest");
    return;
  }

  for (const term of terms.values()) {
    try {
      await ingestTerm(term);
    } catch (err) {
      // One bad term shouldn't block the others (e.g. SOC has no data yet
      // for a not-quite-open-for-registration future term).
      console.error(`[ingest] failed for ${termLabel(term)}:`, err);
    }
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
