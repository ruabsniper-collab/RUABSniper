import type { SocCourse } from "./soc.js";

type Listing = { title: string; credits: number | null; core_codes: string[] };

export function parseCredits(value: SocCourse["credits"]): number | null {
  if (value == null || String(value).trim() === "") return null;
  const credits = Number(value);
  return Number.isFinite(credits) ? credits : null;
}

export function mergeCourseListings(rawCourses: SocCourse[]) {
  const groups = new Map<string, SocCourse[]>();
  for (const course of rawCourses) {
    const key = `${course.subject}::${course.courseNumber}`;
    const group = groups.get(key) ?? [];
    group.push(course);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const sectionListings: Record<string, Listing> = {};
    const seen = new Set<string>();
    for (const course of group) {
      for (const section of course.sections ?? []) {
        const index = String(section.index);
        if (seen.has(index)) continue;
        seen.add(index);
        if (course === group[0]) continue;
        sectionListings[index] = {
          title: course.title,
          credits: parseCredits(course.credits),
          core_codes: (course.coreCodes ?? []).map((code) => code.coreCode).filter((code): code is string => Boolean(code)),
        };
      }
    }
    return {
      ...group[0],
      sections: group.flatMap((course) => course.sections ?? []),
      section_listings: sectionListings,
      listing_titles: [...new Set(group.map((course) => course.title))],
      listing_credits: [...new Set(group.map((course) => parseCredits(course.credits)).filter((credits): credits is number => credits != null))],
    };
  });
}
