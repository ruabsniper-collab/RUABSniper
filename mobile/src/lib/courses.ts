import { supabase } from "./supabase";
import type { Course, ProfessorRmpMatch, Section, SectionWithCourse } from "../types/db";
import type { Term } from "./term";
import { checkConflict, type ScheduleBlock } from "./schedule";

const MIN_CONFIDENT_MATCH = 0.72; // mirrors backend/lib/rmp.ts's "fuzzy" acceptance floor

export type SearchFilters = {
  term: Term;
  query?: string; // free text: title, subject name, subject/course number, or a core code
  minRating?: number; // 0-5, only applied to sections with a confident RMP match
  includeUnratedWhenFiltering?: boolean; // if minRating is set, whether "no confident match" still passes
  hideScheduleConflicts?: boolean;
  mySchedule?: ScheduleBlock[];
};

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

    if (filters.minRating != null) {
      sections = sections.filter((s) => {
        const rating = s.professorRating;
        const hasConfidentMatch = rating && rating.confidence >= MIN_CONFIDENT_MATCH;
        if (!hasConfidentMatch) return Boolean(filters.includeUnratedWhenFiltering);
        return (rating!.avg_rating ?? 0) >= filters.minRating!;
      });
    }
  }

  if (filters.hideScheduleConflicts && filters.mySchedule?.length) {
    sections = sections.filter((s) => !checkConflict(s.meeting_times, filters.mySchedule!));
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
