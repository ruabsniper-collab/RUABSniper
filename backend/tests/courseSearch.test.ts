import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { courseSearchFilter, matchesCourseSearch, matchesProfessorFilters } from "../../web/src/lib/courseSearch.js";
import type { Course, ProfessorRmpMatch, SectionWithCourse } from "../../web/src/types/db.js";

const course = { subject_code: "119", subject_description: "Biological Sciences", course_number: "101", title: "GENERAL BIOLOGY", core_codes: ["NS", "WCd"] } as Course;
const rating = (num_ratings: number | null, avg_rating = 4.5, confidence = 1) => ({ num_ratings, avg_rating, confidence, match_method: "exact" }) as ProfessorRmpMatch;
const section = (ratings: (ProfessorRmpMatch | null)[]) => ({ instructors: ratings.map((_, i) => `Teacher ${i}`), professorRatings: ratings }) as SectionWithCourse;

test("core search is case insensitive and exact; subject search accepts names and subject numbers", () => {
  for (const code of ["NS", "ns", "wcd", " WCd "]) assert.equal(matchesCourseSearch(course, code, "core"), true);
  assert.equal(matchesCourseSearch(course, "WC", "core"), false);
  assert.equal(matchesCourseSearch(course, "Biological", "subject"), true);
  assert.equal(matchesCourseSearch(course, "119", "subject"), true);
  assert.equal(matchesCourseSearch(course, "101", "subject"), false, "Subject scope must not match a course number");
  assert.equal(matchesCourseSearch(course, "101", "all"), true);
  assert.equal(matchesCourseSearch({ ...course, subject_code: "014" }, "14", "subject"), true);
});

test("search filter quotes punctuation and escapes wildcard input", () => {
  const filter = courseSearchFilter('Women\'s, "Gender" (Studies)', "subject");
  assert.equal(filter, 'subject_description.ilike.' + JSON.stringify('%Women\'s, "Gender" (Studies)%'));
  assert.equal(courseSearchFilter("119", "subject"), "subject_code.eq.119");
  assert.equal(courseSearchFilter("100%", "subject"), "subject_description.ilike." + JSON.stringify("%100\\%%"));
});

test("minimum rating count excludes low, missing, and uncertain counts, including co-teachers", () => {
  const filters = { minRatingCount: 10, includeUnratedWhenFiltering: true };
  assert.equal(matchesProfessorFilters(section([rating(10)]), filters), true);
  for (const ratings of [[rating(9)], [rating(null)], [null], [], [rating(100), rating(2)], [rating(100), null], [rating(100, 5, 0.5)]])
    assert.equal(matchesProfessorFilters(section(ratings), filters), false);
  assert.equal(matchesProfessorFilters(section([rating(100), rating(10)]), filters), true);
  assert.equal(matchesProfessorFilters(section([null]), {}), true, "Any keeps unrated sections available");
});

test("minimum score and count work together without letting a tiny five-star sample through", () => {
  assert.equal(matchesProfessorFilters(section([rating(2, 5)]), { minRating: 4, minRatingCount: 10 }), false);
  assert.equal(matchesProfessorFilters(section([rating(30, 3)]), { minRating: 4, minRatingCount: 10 }), false);
  assert.equal(matchesProfessorFilters(section([rating(30, 4.2)]), { minRating: 4, minRatingCount: 10 }), true);
});

test("real search keeps alternate-listing core codes separate and applies rating count before results", async () => {
  const webRequire = createRequire(new URL("../../web/package.json", import.meta.url));
  const { createServer } = await import(pathToFileURL(webRequire.resolve("vite")).href);
  const server = await createServer({ root: fileURLToPath(new URL("../../web/", import.meta.url)), logLevel: "error",
    server: { middlewareMode: true, hmr: false }, define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://example.test"),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("test-key"),
    },
  });
  const originalFetch = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input), "https://example.test");
    requests.push(url);
    let data: unknown;
    if (url.pathname.endsWith("/courses")) data = [{ ...course, id: "course", term_year: 2027, term_code: 1, core_codes: [],
      section_listings: { "12345": { title: "HISTORY SEMINAR", credits: 3, core_codes: ["HST"] } },
      sections: [{ id: "lecture", index_number: "12344", instructors: ["Prof"], meeting_times: [] }, { id: "seminar", index_number: "12345", instructors: ["Prof"], meeting_times: [] }],
    }];
    else if (url.pathname.endsWith("/sections")) data = [{ id: "exact", index_number: "12345", term_year: 2027, term_code: 1, instructors: ["Prof"], courses: course }];
    else if (url.pathname.endsWith("/professor_rmp_matches")) data = [{ ...rating(12), instructor_name: "prof" }];
    else if (url.pathname === "/api/availability") data = { openIndexes: ["12345"], checkedAt: new Date().toISOString() };
    else throw Error(`Unexpected request ${url}`);
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  };
  try {
    const { searchCourses } = await server.ssrLoadModule("/src/lib/courses.ts");
    const filters = { term: { year: 2027, code: 1 }, query: "hst", searchScope: "core", minRatingCount: 10 };
    const results = await searchCourses(filters, new AbortController().signal);
    assert.deepEqual(results.map((s: SectionWithCourse) => s.id), ["seminar"]);
    assert.equal(results[0].courses.title, "HISTORY SEMINAR");
    assert.ok(requests.some(url => url.searchParams.get("or")?.includes("raw->>section_listings")));
    assert.equal((await searchCourses({ ...filters, minRatingCount: 20 }, new AbortController().signal)).length, 0);
    const exact = await searchCourses({ term: filters.term, query: "12345" }, new AbortController().signal);
    assert.equal(exact[0].id, "exact", "Existing exact-index search stays available");
  } finally { globalThis.fetch = originalFetch; await server.close(); }
});
