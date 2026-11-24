import { useCallback, useEffect, useRef, useState } from "react";
import { useSeatRefresh } from "../lib/useSeatRefresh";
import { useLocation, useNavigate } from "react-router-dom";
import { browseOpenSections, searchCourses } from "../lib/courses";
import { guessCurrentTerm, loadTermPreference, saveTermPreference, termKey, termLabel, termOptions, type Term } from "../lib/term";
import { addWatch, listWatches, removeWatch } from "../lib/watches";
import {
  getActiveSchedule,
  listSchedules,
  setActiveScheduleId as persistActiveScheduleId,
  type ScheduleBlock,
  type ScheduleSet,
} from "../lib/schedule";
import { maybePromptAfterAddingWatch } from "../lib/push";
import { parseTimeToMilitary } from "../lib/time";
import { SectionRow } from "../components/SectionRow";
import { NotificationPrompt } from "../components/NotificationPrompt";
import { EmptyState } from "../components/EmptyState";
import { PullToRefreshIndicator } from "../components/PullToRefreshIndicator";
import { haptic } from "../lib/haptics";
import { showToast } from "../lib/toast";
import { usePullToRefresh } from "../lib/usePullToRefresh";
import type { SectionWithCourse } from "../types/db";
import { CourseFilters, DEFAULT_COURSE_FILTERS, activeFilterCount, type CourseFilterValues } from "../components/CourseFilters";
import { getCatalogOptions, type CatalogOptions } from "../lib/catalogOptions";

function sectionLabel(section: SectionWithCourse): string {
  return `${section.courses.subject_code}:${section.courses.course_number} sec ${section.section_number}`;
}

const TERM_OPTIONS = termOptions();
const SECTION_BATCH_SIZE = 40;

export function SearchPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // A real, user-controlled term instead of a single hardcoded guess --
  // see lib/term.ts's termOptions() comment for why: the old version
  // locked the whole app to whatever guessCurrentTerm() returned, with no
  // way to search or snipe any other term, which meant Spring was entirely
  // unreachable during exactly the Nov-Dec window its own registration
  // rush happens in. Falls back to the last term explicitly picked here
  // (if it's still current) before guessing fresh.
  const [term, setTerm] = useState<Term>(() => loadTermPreference() ?? guessCurrentTerm());
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<CourseFilterValues>(DEFAULT_COURSE_FILTERS);
  const { subjectCode, coreCodes, minRating, minRatingCount, creditsFilter, includeUnrated, requireRmpMatch,
    sortByRating, locations, filterDays, earliestStartText, latestEndText, hideConflicts, travelBuffer } = filters;
  const [catalogOptions, setCatalogOptions] = useState<CatalogOptions>({ subjects: [], cores: [] });
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(false);
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const updateFilters = useCallback((patch: Partial<CourseFilterValues>) => setFilters(previous => ({ ...previous, ...patch })), []);
  useEffect(() => {
    const request = new AbortController();
    setOptionsLoading(true); setOptionsError(false);
    getCatalogOptions(term, request.signal).then(options => {
      if (!request.signal.aborted) setCatalogOptions(options);
    }).catch(() => { if (!request.signal.aborted) { setOptionsError(true); setCatalogOptions({ subjects: [], cores: [] }); } })
      .finally(() => { if (!request.signal.aborted) setOptionsLoading(false); });
    return () => request.abort();
  }, [term, optionsAttempt]);
  const [schedules, setSchedules] = useState<ScheduleSet[]>([]);
  const [activeScheduleId, setActiveScheduleId] = useState("");
  const [mySchedule, setMySchedule] = useState<ScheduleBlock[]>([]);
  const [scheduleName, setScheduleName] = useState("");
  const [results, setResults] = useState<SectionWithCourse[]>([]);
  const [visibleCount, setVisibleCount] = useState(SECTION_BATCH_SIZE);
  const [watchedIndexes, setWatchedIndexes] = useState<Set<string>>(new Set());
  const [watchIdByIndex, setWatchIdByIndex] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasAnyFilter = query.trim() !== "" || activeFilterCount(filters) > 0;

  const refreshWatches = useCallback(async () => {
    const watches = await listWatches();
    const relevant = watches.filter((w) => w.term_year === term.year && w.term_code === term.code);
    setWatchedIndexes(new Set(relevant.map((w) => w.index_number)));
    setWatchIdByIndex(new Map(relevant.map((w) => [w.index_number, w.id])));
  }, [term]);

  // This tab never unmounts (see App.tsx) -- a plain mount-time effect would
  // only ever run once, missing anything added to My Schedule or changed in
  // Snipes after that first load. Re-syncing on every return to "/" instead
  // means both stay fresh without needing a full app restart, while still
  // not touching query/results state when you're not on this tab.
  useEffect(() => {
    if (pathname !== "/") return;
    setSchedules(listSchedules());
    const active = getActiveSchedule();
    setActiveScheduleId(active.id);
    setMySchedule(active.blocks);
    setScheduleName(active.name);
    refreshWatches();
  }, [pathname, refreshWatches]);

  // Switching which schedule Search checks conflicts against used to mean
  // leaving this tab, changing it in My Schedule, and coming back -- real
  // friction for exactly the case My Schedule's multi-schedule support
  // exists for (your own classes plus a friend's you're sniping for). This
  // lets it happen inline without leaving Search.
  function handleScheduleChange(id: string) {
    persistActiveScheduleId(id);
    const active = getActiveSchedule();
    setActiveScheduleId(active.id);
    setMySchedule(active.blocks);
    setScheduleName(active.name);
    haptic("tap");
  }

  const searchRequest = useRef<AbortController | null>(null);
  const runSearch = useCallback(async () => {
    searchRequest.current?.abort();
    const request = new AbortController();
    searchRequest.current = request;
    setLoading(true);
    setError(null);
    try {
      const data = !hasAnyFilter
        ? await browseOpenSections(term, request.signal)
        : await searchCourses({
            term,
            query,
            subjectCode: subjectCode || undefined,
            coreCodes: coreCodes.length ? coreCodes : undefined,
            minRating: minRating ?? undefined,
            minRatingCount: minRatingCount || undefined,
            credits: creditsFilter ?? undefined,
            includeUnratedWhenFiltering: includeUnrated,
            requireRmpMatch,
            sortByRating,
            locations: locations.length ? locations : undefined,
            hideScheduleConflicts: hideConflicts,
            mySchedule,
            travelBufferMinutes: travelBuffer,
            days: filterDays.length ? filterDays : undefined,
            // Empty native time controls leave the corresponding bound open.
            earliestStart: parseTimeToMilitary(earliestStartText) ?? undefined,
            latestEnd: parseTimeToMilitary(latestEndText) ?? undefined,
          }, request.signal);
      if (!request.signal.aborted) setResults(data);
    } catch (e) {
      if (!request.signal.aborted) {
        setError(e instanceof Error ? e.message : "Search failed");
      }
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [hasAnyFilter, term, query, filters, mySchedule]);

  useEffect(() => {
    setVisibleCount(SECTION_BATCH_SIZE);
    const handle = setTimeout(runSearch, query.trim() ? 200 : 0);
    return () => {
      clearTimeout(handle);
      searchRequest.current?.abort();
    };
  }, [query, runSearch]);
  useSeatRefresh(runSearch, pathname === "/");

  const { pull, refreshing, threshold } = usePullToRefresh(
    () => Promise.all([runSearch(), refreshWatches()]).then(() => {}),
    pathname === "/",
  );

  function handleTermChange(key: string) {
    const next = TERM_OPTIONS.find((t) => termKey(t) === key);
    if (!next) return;
    setResults([]);
    setLoading(true);
    setTerm(next);
    updateFilters({ subjectCode: "", coreCodes: [] });
    saveTermPreference(next);
  }

  async function toggleWatch(section: SectionWithCourse) {
    const existingId = watchIdByIndex.get(section.index_number);
    if (existingId) {
      await removeWatch(existingId);
      haptic("tap");
      showToast(`Stopped sniping ${sectionLabel(section)}`, "default", {
        label: "Undo",
        onClick: async () => {
          await addWatch(term, section.index_number, section.open);
          haptic("confirm");
          await refreshWatches();
        },
      });
    } else {
      const hadNoWatchesBefore = (await listWatches()).length === 0;
      await addWatch(term, section.index_number, section.open);
      haptic("confirm");
      showToast(`🎯 Sniping ${sectionLabel(section)}`, "success");
      await maybePromptAfterAddingWatch(hadNoWatchesBefore);
    }
    await refreshWatches();
  }

  return (
    <div>
      <PullToRefreshIndicator pull={pull} refreshing={refreshing} threshold={threshold} />
      <header className="search-heading">
        <div>
          <p className="search-eyebrow">Rutgers · New Brunswick</p>
          <h1>RUAB Sniper</h1>
        </div>
        <select
          className="input search-term"
          aria-label="Semester"
          value={termKey(term)}
          onChange={(e) => handleTermChange(e.target.value)}
        >
          {TERM_OPTIONS.map((t) => (
            <option key={termKey(t)} value={termKey(t)}>
              {termLabel(t)}
            </option>
          ))}
        </select>
      </header>
      <NotificationPrompt />
      <CourseFilters query={query} onQueryChange={setQuery} value={filters} onChange={updateFilters}
        options={catalogOptions} optionsLoading={optionsLoading} optionsError={optionsError} onRetryOptions={() => setOptionsAttempt(attempt => attempt + 1)}
        schedules={schedules} activeScheduleId={activeScheduleId} onScheduleChange={handleScheduleChange}
        scheduleName={scheduleName} scheduleBlocks={mySchedule.length} />

      {loading && results.length === 0 ? (
        <div style={{ marginTop: 12 }}>
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : (
        loading && <p className="hint" role="status">Searching…</p>
      )}
      {error && <p className="error-text">{error}</p>}

      <section className="search-results" aria-label="Course results" aria-busy={loading}>
        {results.length > 0 && (
          <div className="search-results-header">
            <h2>{hasAnyFilter ? "Search results" : "Open sections"}</h2>
            <span className="pill search-result-count">
              {results.length > visibleCount ? `${visibleCount} of ` : ""}
              {results.length} {results.length === 1 ? "section" : "sections"}
            </span>
          </div>
        )}
        {results.slice(0, visibleCount).map((item) => (
          <SectionRow
            key={item.id}
            section={item}
            isWatched={watchedIndexes.has(item.index_number)}
            onToggleWatch={() => toggleWatch(item)}
            onClick={() => navigate(`/course/${item.course_id}?year=${term.year}&code=${term.code}`)}
          />
        ))}
        {!loading && results.length > visibleCount && (
          <button className="btn btn-secondary search-more" onClick={() => setVisibleCount((count) => count + SECTION_BATCH_SIZE)}>
            Show {Math.min(SECTION_BATCH_SIZE, results.length - visibleCount)} more sections
          </button>
        )}
        {!loading && !error && !hasAnyFilter && results.length === 0 && (
          <EmptyState icon="search">
            No open sections to show yet for {termLabel(term)}. Type a course name, subject, core code, or
            index number above — or tap a core code or choose a subject.
          </EmptyState>
        )}
        {!loading && !error && hasAnyFilter && results.length === 0 && (
          <EmptyState icon="search">No sections match yet — try a different search.</EmptyState>
        )}
      </section>
    </div>
  );
}
