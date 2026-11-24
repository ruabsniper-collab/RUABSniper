import type { Course, ProfessorRmpMatch, SectionWithCourse } from "../types/db";

export type SearchScope = "all" | "subject" | "core";

export function matchesCatalogFilters(course: Course, filters: { subjectCode?: string; coreCodes?: string[] }): boolean {
  if (filters.subjectCode && course.subject_code !== filters.subjectCode) return false;
  return !filters.coreCodes?.length || filters.coreCodes.some(code => course.core_codes.some(actual => actual.toLowerCase() === code.toLowerCase()));
}

// Quote PostgREST values so punctuation in a course/subject name cannot
// change the structure of the OR filter. Treat wildcard characters literally.
export function courseSearchFilter(query: string, scope: SearchScope): string {
  const q = query.trim();
  const pattern = JSON.stringify(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
  const subject = /^\d{1,3}$/.test(q)
    ? `subject_code.eq.${q.padStart(3, "0")}`
    : `subject_description.ilike.${pattern}`;
  // JSON text searches are case-insensitive and include alternate listings.
  // Exact section-level code matching below removes substring matches.
  const core = `raw->>coreCodes.ilike.${pattern},raw->>section_listings.ilike.${pattern}`;
  if (scope === "subject") return subject;
  if (scope === "core") return core;
  if (/^\d{1,3}$/.test(q)) return `${subject},course_number.eq.${q}`;
  return `title.ilike.${pattern},subject_description.ilike.${pattern},raw->>listing_titles.ilike.${pattern},${core}`;
}

export function matchesCourseSearch(course: Course, query: string, scope: SearchScope): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const subject = /^\d{1,3}$/.test(q)
    ? course.subject_code === q.padStart(3, "0")
    : Boolean(course.subject_description?.toLowerCase().includes(q));
  const core = course.core_codes.some(code => code.toLowerCase() === q);
  if (scope === "subject") return subject;
  if (scope === "core") return core;
  return subject || core || course.title.toLowerCase().includes(q) || course.course_number === q;
}

export function matchesProfessorFilters(section: SectionWithCourse, filters: {
  minRating?: number;
  minRatingCount?: number;
  requireRmpMatch?: boolean;
  includeUnratedWhenFiltering?: boolean;
}): boolean {
  const ratings = section.professorRatings ?? [section.professorRating ?? null];
  const confident = (rating: ProfessorRmpMatch | null | undefined): rating is ProfessorRmpMatch =>
    Boolean(rating && rating.match_method !== "none" && rating.confidence >= 0.72);
  // A minimum count excludes unknown/low-count co-instructors too. A highly
  // rated instructor must not hide an unrated co-instructor on the same section.
  if ((filters.minRatingCount ?? 0) > 0 && (section.instructors.length === 0 ||
      ratings.length !== section.instructors.length ||
      ratings.some(rating => !confident(rating) || (rating.num_ratings ?? 0) < filters.minRatingCount!))) return false;
  const matched = ratings.filter(confident);
  if (filters.requireRmpMatch && matched.length === 0) return false;
  if (filters.minRating != null) {
    if (matched.length === 0) return Boolean(filters.includeUnratedWhenFiltering);
    return matched.some(rating => (rating.avg_rating ?? 0) >= filters.minRating!);
  }
  return true;
}
