import type { SectionWithCourse } from "../types/db";
import type { Term } from "./term";

export async function getAvailability(term: Term, signal?: AbortSignal) {
  const response = await fetch(`/api/availability?year=${term.year}&term=${term.code}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not verify seats with Rutgers");
  const data = await response.json();
  if (!Array.isArray(data.openIndexes) || !data.openIndexes.every((index: unknown) => typeof index === "string") ||
      typeof data.checkedAt !== "string" || !Number.isFinite(Date.parse(data.checkedAt))) {
    throw new Error("Invalid seat availability response");
  }
  return { openIndexes: new Set<string>(data.openIndexes), checkedAt: data.checkedAt as string };
}

export async function verifyAvailability(sections: SectionWithCourse[], signal?: AbortSignal): Promise<SectionWithCourse[]> {
  const terms = new Map<string, Term>();
  for (const section of sections) {
    terms.set(`${section.term_year}:${section.term_code}`, { year: section.term_year, code: section.term_code });
  }
  const availability = new Map<string, Awaited<ReturnType<typeof getAvailability>> | null>();
  await Promise.all([...terms].map(async ([key, term]) => {
    try {
      availability.set(key, await getAvailability(term, signal));
    } catch (error) {
      if (signal?.aborted) throw error;
      availability.set(key, null);
    }
  }));
  return sections.map((section) => {
    const live = availability.get(`${section.term_year}:${section.term_code}`);
    return { ...section, open: live ? live.openIndexes.has(section.index_number) : null, availabilityCheckedAt: live?.checkedAt ?? null };
  });
}
