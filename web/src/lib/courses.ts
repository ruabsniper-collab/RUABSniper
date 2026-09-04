import { supabase } from "./supabase";
import type { Course, ProfessorRmpMatch, Section, SectionWithCourse, Watch } from "../types/db";
import type { Term } from "./term";
import { checkConflict, type ScheduleBlock } from "./schedule";
import { militaryToMinutes } from "./time";
import { listWatches } from "./watches";

const MIN_CONFIDENT_MATCH = 0.72; // mirrors backend/lib/rmp.ts's "fuzzy" acceptance floor

// Real values SOC uses for meeting_times[].campus on the NB campus (verified
// against a live courses.json pull): "BUSCH", "COLLEGE AVENUE",
// "DOUGLAS/COOK", "DOWNTOWN NB", "LIVINGSTON", "OFF CAMPUS", "ONLINE",
// "STUDY ABROAD", plus "" (unspecified) for some non-instructional rows.
// "ASYNCHRONOUS" isn't a SOC value -- it's synthetic, see isAsyncMeeting().
export const LOCATION_OPTIONS: { value: string; label: string }[] = [
  { value: "COLLEGE AVENUE", label: "College Ave" },
  { value: "BUSCH", label: "Busch" },
  { value: "LIVINGSTON", label: "Livingston" },
  { value: "DOUGLAS/COOK", label: "Douglass/Cook" },
  { value: "DOWNTOWN NB", label: "Downtown NB" },
  { value: "OFF CAMPUS", label: "Off Campus" },
  { value: "ONLINE", label: "Online" },
  { value: "ASYNCHRONOUS", label: "Asynchronous" },
  { value: "STUDY ABROAD", label: "Study Abroad" },
];
const ASYNC_LOCATION_VALUE = "ASYNCHRONOUS";

export type SearchFilters = {
  term: Term;
  query?: string; // free text: title, subject name, subject/course number, or a core code
  minRating?: number; // 0-5, only applied to sections with a confident RMP match
  includeUnratedWhenFiltering?: boolean; // if minRating is set, whether "no confident match" still passes
  requireRmpMatch?: boolean; // drop any section whose professor has no confident RMP match at all
  sortByRating?: boolean; // highest-rated professor first; unrated/no-match sections sink to the bottom
  locations?: string[]; // values from LOCATION_OPTIONS, OR'd together against a section's meeting_times
  hideScheduleConflicts?: boolean;
  mySchedule?: ScheduleBlock[];
  travelBufferMinutes?: number; // also flag a same-day, different-campus gap smaller than this as a conflict (0/undefined = off)
  days?: string[]; // M/T/W/H/F/S/U -- every one of a section's real meeting days must be in this set
  earliestStart?: string; // "HHMM" 24h -- no meeting may start before this
  latestEnd?: string; // "HHMM" 24h -- no meeting may end after this
};

/**
 * SOC has no dedicated "synchronous"/"asynchronous" field. Verified against
 * live data instead: online meetings that have an actual scheduled day/time
 * are synchronous (e.g. cross-institution CourseShare lectures held over
 * video at a fixed time); online meetings with no day/time at all are
 * asynchronous. That gap is the signal this uses.
 */
function isAsyncMeeting(m: { campus: string | null; day: string | null }): boolean {
  return (m.campus ?? "").toUpperCase() === "ONLINE" && !m.day;
}

function matchesLocation(section: SectionWithCourse, selected: string[]): boolean {
  return selected.some((loc) =>
    loc === ASYNC_LOCATION_VALUE
      ? section.meeting_times.some(isAsyncMeeting)
      : section.meeting_times.some((m) => (m.campus ?? "").toUpperCase() === loc),
  );
}

/**
 * True unless some *real* meeting (one with an actual day -- an async
 * online meeting has none, and never fails a day/time check on its own,
 * same philosophy as isAsyncMeeting/checkConflict) falls on a day outside
 * `days` (when `days` is non-empty) or outside the [earliestStart,
 * latestEnd] window (when either bound is set). Every real meeting has to
 * fit, not just one -- a MWF class shouldn't pass a "Tue/Thu only" filter
 * just because it also happens to not meet on, say, Saturday.
 */
function matchesDayAndTime(
  section: SectionWithCourse,
  days: Set<string>,
  earliestStart: string | null,
  latestEnd: string | null,
): boolean {
  const earliestMin = earliestStart ? militaryToMinutes(earliestStart) : null;
  const latestMin = latestEnd ? militaryToMinutes(latestEnd) : null;

  for (const mt of section.meeting_times) {
    if (!mt.day) continue;
    if (days.size > 0 && !days.has(mt.day)) return false;
    const start = militaryToMinutes(mt.start);
    const end = militaryToMinutes(mt.end);
    if (earliestMin != null && start != null && start < earliestMin) return false;
    if (latestMin != null && end != null && end > latestMin) return false;
  }
  return true;
}

function normalizeInstructorName(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Best professor rating among a section's instructors (there's sometimes more than one). */
function bestRatingFor(
  instructors: string[],
  ratingsByName: Map<string, ProfessorRmpMatch>,
): ProfessorRmpMatch | null {
  let best: ProfessorRmpMatch | null = null;
  for (const raw of instructors) {
    const match = ratingsByName.get(normalizeInstructorName(raw));
    if (!match || match.match_method === "none") continue;
    if (!best || (match.avg_rating ?? 0) > (best.avg_rating ?? 0)) best = match;
  }
  return best;
}

/** One entry per instructor, same order, null where there's no RMP row at all -- for showing every co-instructor's own rating rather than just the best one. */
function ratingsForInstructors(
  instructors: string[],
  ratingsByName: Map<string, ProfessorRmpMatch>,
): (ProfessorRmpMatch | null)[] {
  return instructors.map((raw) => ratingsByName.get(normalizeInstructorName(raw)) ?? null);
}

export async function searchCourses(filters: SearchFilters): Promise<SectionWithCourse[]> {
  const { term, query } = filters;
  const q = query?.trim();

  let sections: SectionWithCourse[];

  if (q && /^\d{4,6}$/.test(q)) {
    // Looks like an index number (real ones run 4-6 digits -- e.g. 17843,
    // 21069) rather than a 1-3 digit subject/course number below. Index
    // numbers live on *sections*, not courses, so the courses-table query
    // in the branch below can never match one no matter how it's built --
    // searching sections directly here is the only path that actually
    // works. Exact match only: someone typing a real index number wants
    // that exact section, not a fuzzy list.
    const { data: sectionRows, error: sectionsErr } = await supabase
      .from("sections")
      .select("*, courses(*)")
      .eq("term_year", term.year)
      .eq("term_code", term.code)
      .eq("index_number", q);
    if (sectionsErr) throw sectionsErr;
    sections = ((sectionRows ?? []) as (Section & { courses: Course })[]).map((row) => ({
      ...row,
      courses: row.courses,
    }));
  } else {
    let courseQuery = supabase
      .from("courses")
      .select("*, sections(*)")
      .eq("term_year", term.year)
      .eq("term_code", term.code);

    if (q) {
      if (/^[A-Z]{2,6}$/i.test(q)) {
        // Looks like a core code (e.g. "WCr", "QQ", "HST") — match core codes
        // OR fall through to a normal text search too, since a short code
        // could also just be someone typing a subject abbreviation.
        courseQuery = courseQuery.or(
          `core_codes.cs.{${q.toUpperCase()}},title.ilike.%${q}%,subject_description.ilike.%${q}%`,
        );
      } else if (/^\d{1,3}$/.test(q)) {
        // Looks like a subject or course number.
        courseQuery = courseQuery.or(`subject_code.eq.${q.padStart(3, "0")},course_number.eq.${q}`);
      } else {
        courseQuery = courseQuery.or(`title.ilike.%${q}%,subject_description.ilike.%${q}%`);
      }
    }

    const { data, error } = await courseQuery.limit(200);
    if (error) throw error;

    const courses = (data ?? []) as (Course & { sections: Section[] })[];
    sections = courses.flatMap((c) => (c.sections ?? []).map((s) => ({ ...s, courses: c })));
  }

  // Attach RMP ratings.
  const instructorNames = new Set<string>();
  for (const s of sections) for (const i of s.instructors) instructorNames.add(normalizeInstructorName(i));

  if (instructorNames.size > 0) {
    const { data: ratings, error: ratingsErr } = await supabase
      .from("professor_rmp_matches")
      .select("*")
      .in("instructor_name", [...instructorNames]);
    if (ratingsErr) throw ratingsErr;

    const ratingsByName = new Map<string, ProfessorRmpMatch>(
      (ratings ?? []).map((r) => [r.instructor_name as string, r as ProfessorRmpMatch]),
    );
    sections = sections.map((s) => ({
      ...s,
      professorRating: bestRatingFor(s.instructors, ratingsByName),
      professorRatings: ratingsForInstructors(s.instructors, ratingsByName),
    }));
  }

  // Everything below reads s.professorRating, so it applies whether or not
  // there were any instructors to look up (an empty match set just means
  // every section behaves as "no confident match").
  const hasConfidentMatch = (s: SectionWithCourse) =>
    Boolean(s.professorRating && s.professorRating.confidence >= MIN_CONFIDENT_MATCH);

  if (filters.requireRmpMatch) {
    sections = sections.filter(hasConfidentMatch);
  }

  if (filters.minRating != null) {
    sections = sections.filter((s) => {
      if (!hasConfidentMatch(s)) return Boolean(filters.includeUnratedWhenFiltering);
      return (s.professorRating!.avg_rating ?? 0) >= filters.minRating!;
    });
  }

  if (filters.locations && filters.locations.length > 0) {
    sections = sections.filter((s) => matchesLocation(s, filters.locations!));
  }

  if ((filters.days && filters.days.length > 0) || filters.earliestStart || filters.latestEnd) {
    const daySet = new Set(filters.days ?? []);
    sections = sections.filter((s) =>
      matchesDayAndTime(s, daySet, filters.earliestStart ?? null, filters.latestEnd ?? null),
    );
  }

  if (filters.hideScheduleConflicts && filters.mySchedule?.length) {
    sections = sections.filter((s) => {
      const sectionCourseKey = `${s.courses.subject_code}:${s.courses.course_number}`;
      return !checkConflict(s.meeting_times, filters.mySchedule!, sectionCourseKey, filters.travelBufferMinutes ?? 0);
    });
  }

  if (filters.sortByRating) {
    // Stable sort: highest rating first, unrated/no-match sections keep
    // their relative order at the bottom rather than being shuffled.
    sections = [...sections].sort((a, b) => {
      const ra = hasConfidentMatch(a) ? (a.professorRating!.avg_rating ?? -1) : -1;
      const rb = hasConfidentMatch(b) ? (b.professorRating!.avg_rating ?? -1) : -1;
      return rb - ra;
    });
  }

  return sections;
}

/**
 * A bounded, useful default for Search's empty state -- some currently
 * open sections for the term, shown before anyone's typed or tapped a
 * filter. Replaces two worse defaults tried in this same spot: the
 * original unfiltered catalog dump (up to 200 courses' worth of sections,
 * most of it repetitive placeholder "independent study" entries, real
 * Supabase reads on every cold load) turned out to be missed once removed
 * -- but a bare "type to search" prompt with nothing to look at wasn't a
 * good trade either. Open sections specifically, since that's the one
 * thing actually actionable in a sniping app, and capped low enough
 * (`limit`) that this stays cheap regardless of how big the catalog gets.
 */
export async function browseOpenSections(term: Term, limit = 24): Promise<SectionWithCourse[]> {
  const { data: sectionRows, error } = await supabase
    .from("sections")
    .select("*, courses(*)")
    .eq("term_year", term.year)
    .eq("term_code", term.code)
    .eq("open", true)
    .limit(limit);
  if (error) throw error;

  let sections: SectionWithCourse[] = ((sectionRows ?? []) as (Section & { courses: Course })[]).map((row) => ({
    ...row,
    courses: row.courses,
  }));

  const instructorNames = new Set<string>();
  for (const s of sections) for (const i of s.instructors) instructorNames.add(normalizeInstructorName(i));

  if (instructorNames.size > 0) {
    const { data: ratings, error: ratingsErr } = await supabase
      .from("professor_rmp_matches")
      .select("*")
      .in("instructor_name", [...instructorNames]);
    if (ratingsErr) throw ratingsErr;
    const ratingsByName = new Map<string, ProfessorRmpMatch>(
      (ratings ?? []).map((r) => [r.instructor_name as string, r as ProfessorRmpMatch]),
    );
    sections = sections.map((s) => ({
      ...s,
      professorRating: bestRatingFor(s.instructors, ratingsByName),
      professorRatings: ratingsForInstructors(s.instructors, ratingsByName),
    }));
  }

  return sections;
}

/** All sections for one course, with RMP ratings attached — used by CourseDetailPage. */
export async function getCourseSections(courseId: string): Promise<SectionWithCourse[]> {
  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();
  if (courseErr) throw courseErr;

  const { data: sectionRows, error: sectionsErr } = await supabase
    .from("sections")
    .select("*")
    .eq("course_id", courseId)
    .order("section_number", { ascending: true });
  if (sectionsErr) throw sectionsErr;

  let sections: SectionWithCourse[] = (sectionRows ?? []).map((s) => ({ ...(s as Section), courses: course as Course }));

  const instructorNames = new Set<string>();
  for (const s of sections) for (const i of s.instructors) instructorNames.add(normalizeInstructorName(i));

  if (instructorNames.size > 0) {
    const { data: ratings, error: ratingsErr } = await supabase
      .from("professor_rmp_matches")
      .select("*")
      .in("instructor_name", [...instructorNames]);
    if (ratingsErr) throw ratingsErr;
    const ratingsByName = new Map<string, ProfessorRmpMatch>(
      (ratings ?? []).map((r) => [r.instructor_name as string, r as ProfessorRmpMatch]),
    );
    sections = sections.map((s) => ({
      ...s,
      professorRating: bestRatingFor(s.instructors, ratingsByName),
      professorRatings: ratingsForInstructors(s.instructors, ratingsByName),
    }));
  }

  return sections;
}

/**
 * One section's full detail by index number -- what RegisterPage needs.
 * Reached two ways: an in-app tap (SectionRow's "Open WebReg" button,
 * which now threads its section's own term through the URL) and a push
 * notification's direct link (backend/lib/pollOnce.ts and web/api/poll.ts
 * now do the same). `term`, when given, is an exact filter.
 *
 * `term` is still optional -- and the fallback below still matters -- for
 * a notification someone left unread from before this term-threading fix
 * shipped, or any other link that genuinely doesn't have one. Without an
 * exact term, Rutgers reusing index-number ranges each term becomes a real
 * risk once more than one term is actually active at once (which the
 * Search term picker now makes an everyday case, not just theoretical):
 * this took "whichever term has this index number most recently," which
 * could show a completely different class's professor/time/campus than
 * the one actually being registered for. Exact term match removes that
 * risk entirely for every path that has one to give.
 */
export async function getSectionByIndex(indexNumber: string, term?: Term): Promise<SectionWithCourse | null> {
  let query = supabase.from("sections").select("*, courses(*)").eq("index_number", indexNumber);
  query = term
    ? query.eq("term_year", term.year).eq("term_code", term.code)
    : query.order("term_year", { ascending: false }).order("term_code", { ascending: false });
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as Section & { courses: Course };
  let section: SectionWithCourse = { ...row, courses: row.courses };

  if (section.instructors.length > 0) {
    const { data: ratings, error: ratingsErr } = await supabase
      .from("professor_rmp_matches")
      .select("*")
      .in("instructor_name", section.instructors.map(normalizeInstructorName));
    if (ratingsErr) throw ratingsErr;
    const ratingsByName = new Map<string, ProfessorRmpMatch>(
      (ratings ?? []).map((r) => [r.instructor_name as string, r as ProfessorRmpMatch]),
    );
    section = {
      ...section,
      professorRating: bestRatingFor(section.instructors, ratingsByName),
      professorRatings: ratingsForInstructors(section.instructors, ratingsByName),
    };
  }

  return section;
}

export type WatchedSection = { watch: Watch; section: SectionWithCourse | null };

/**
 * Every current watch, each joined with its full section+course+RMP-rating
 * data so the Snipes tab can render with the same SectionRow used
 * everywhere else instead of a bare term/index/status line. `section` is
 * null for a watch whose index no longer exists in the cached catalog
 * (rare, but a dropped/renumbered section shouldn't crash the whole page).
 */
export async function getWatchedSections(): Promise<WatchedSection[]> {
  const watches = await listWatches();
  if (watches.length === 0) return [];

  // Watches can in principle span more than one term, so group and query
  // per term rather than assuming they're all the same one.
  const byTerm = new Map<string, Watch[]>();
  for (const w of watches) {
    const key = `${w.term_year}:${w.term_code}`;
    const group = byTerm.get(key);
    if (group) group.push(w);
    else byTerm.set(key, [w]);
  }

  let sections: SectionWithCourse[] = [];
  for (const group of byTerm.values()) {
    const { data, error } = await supabase
      .from("sections")
      .select("*, courses(*)")
      .eq("term_year", group[0].term_year)
      .eq("term_code", group[0].term_code)
      .in(
        "index_number",
        group.map((w) => w.index_number),
      );
    if (error) throw error;
    sections = sections.concat(
      ((data ?? []) as (Section & { courses: Course })[]).map((row) => ({ ...row, courses: row.courses })),
    );
  }

  const instructorNames = new Set<string>();
  for (const s of sections) for (const i of s.instructors) instructorNames.add(normalizeInstructorName(i));

  if (instructorNames.size > 0) {
    const { data: ratings, error } = await supabase
      .from("professor_rmp_matches")
      .select("*")
      .in("instructor_name", [...instructorNames]);
    if (error) throw error;
    const ratingsByName = new Map<string, ProfessorRmpMatch>(
      (ratings ?? []).map((r) => [r.instructor_name as string, r as ProfessorRmpMatch]),
    );
    sections = sections.map((s) => ({
      ...s,
      professorRating: bestRatingFor(s.instructors, ratingsByName),
      professorRatings: ratingsForInstructors(s.instructors, ratingsByName),
    }));
  }

  const sectionByKey = new Map(sections.map((s) => [`${s.term_year}:${s.term_code}:${s.index_number}`, s]));
  return watches.map((w) => ({
    watch: w,
    section: sectionByKey.get(`${w.term_year}:${w.term_code}:${w.index_number}`) ?? null,
  }));
}
