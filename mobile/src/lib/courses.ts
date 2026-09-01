import { supabase } from "./supabase";
import type { Course, ProfessorRmpMatch, Section, SectionWithCourse } from "../types/db";
import type { Term } from "./term";
import { checkConflict, type ScheduleBlock } from "./schedule";

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

export async function searchCourses(filters: SearchFilters): Promise<SectionWithCourse[]> {
  const { term, query } = filters;

  let courseQuery = supabase
    .from("courses")
    .select("*, sections(*)")
    .eq("term_year", term.year)
    .eq("term_code", term.code);

  const q = query?.trim();
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
  let sections: SectionWithCourse[] = courses.flatMap((c) =>
    (c.sections ?? []).map((s) => ({ ...s, courses: c })),
  );

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
    sections = sections.map((s) => ({ ...s, professorRating: bestRatingFor(s.instructors, ratingsByName) }));
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

  if (filters.hideScheduleConflicts && filters.mySchedule?.length) {
    sections = sections.filter((s) => !checkConflict(s.meeting_times, filters.mySchedule!));
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

/** All sections for one course, with RMP ratings attached — used by CourseDetailScreen. */
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
    sections = sections.map((s) => ({ ...s, professorRating: bestRatingFor(s.instructors, ratingsByName) }));
  }

  return sections;
}
