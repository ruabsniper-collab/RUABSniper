import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { searchCourses, LOCATION_OPTIONS } from "../lib/courses";
import { guessCurrentTerm, loadTermPreference, saveTermPreference, termKey, termLabel, termOptions, type Term } from "../lib/term";
import { addWatch, listWatches, removeWatch } from "../lib/watches";
import { getActiveSchedule, type ScheduleBlock } from "../lib/schedule";
import { maybePromptAfterAddingWatch } from "../lib/push";
import { DAY_LABELS, parseTimeToMilitary } from "../lib/time";
import { SectionRow } from "../components/SectionRow";
import { NotificationPrompt } from "../components/NotificationPrompt";
import { EmptyState } from "../components/EmptyState";
import { PullToRefreshIndicator } from "../components/PullToRefreshIndicator";
import { haptic } from "../lib/haptics";
import { showToast } from "../lib/toast";
import { usePullToRefresh } from "../lib/usePullToRefresh";
import type { SectionWithCourse } from "../types/db";

function sectionLabel(section: SectionWithCourse): string {
  return `${section.courses.subject_code}:${section.courses.course_number} sec ${section.section_number}`;
}

const DAYS = ["M", "T", "W", "H", "F", "S", "U"];
const TERM_OPTIONS = termOptions();

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
  const [minRating, setMinRating] = useState<number | null>(null);
  const [includeUnrated, setIncludeUnrated] = useState(true);
  const [requireRmpMatch, setRequireRmpMatch] = useState(false);
  const [sortByRating, setSortByRating] = useState(false);
  const [locations, setLocations] = useState<Set<string>>(new Set());
  const [filterDays, setFilterDays] = useState<Set<string>>(new Set());
  const [earliestStartText, setEarliestStartText] = useState("");
  const [latestEndText, setLatestEndText] = useState("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [hideConflicts, setHideConflicts] = useState(false);
  const [travelBuffer, setTravelBuffer] = useState(30); // minutes; 0 = off
  const [mySchedule, setMySchedule] = useState<ScheduleBlock[]>([]);
  const [scheduleName, setScheduleName] = useState("");
  const [results, setResults] = useState<SectionWithCourse[]>([]);
  const [watchedIndexes, setWatchedIndexes] = useState<Set<string>>(new Set());
  const [watchIdByIndex, setWatchIdByIndex] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whether there's anything to actually search on. Without this, opening
  // Search cold ran searchCourses() with a blank query, which applies no
  // filter at all beyond term -- fetching (and rendering) up to 200 courses'
  // worth of sections nobody asked for, every single time, before anyone's
  // typed or tapped anything. Real Supabase reads too, worth avoiding given
  // this project's zero-cost design. A single filter of any kind (not just
  // typed text -- "show me what's open at Busch" with an empty query box is
  // a legitimate search) is enough to run a real query.
  const hasAnyFilter =
    query.trim() !== "" ||
    minRating != null ||
    requireRmpMatch ||
    sortByRating ||
    locations.size > 0 ||
    filterDays.size > 0 ||
    earliestStartText.trim() !== "" ||
    latestEndText.trim() !== "" ||
    hideConflicts;

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
    const active = getActiveSchedule();
    setMySchedule(active.blocks);
    setScheduleName(active.name);
    refreshWatches();
  }, [pathname, refreshWatches]);

  const runSearch = useCallback(async () => {
    if (!hasAnyFilter) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await searchCourses({
        term,
        query,
        minRating: minRating ?? undefined,
        includeUnratedWhenFiltering: includeUnrated,
        requireRmpMatch,
        sortByRating,
        locations: locations.size > 0 ? [...locations] : undefined,
        hideScheduleConflicts: hideConflicts,
        mySchedule,
        travelBufferMinutes: travelBuffer,
        days: filterDays.size > 0 ? [...filterDays] : undefined,
        // Left as typed until it actually parses -- e.g. "9:0" mid-keystroke
        // just doesn't apply a bound yet rather than erroring, same
        // leniency as any other free-text filter input.
        earliestStart: parseTimeToMilitary(earliestStartText) ?? undefined,
        latestEnd: parseTimeToMilitary(latestEndText) ?? undefined,
      });
      setResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [
    hasAnyFilter,
    term,
    query,
    minRating,
    includeUnrated,
    requireRmpMatch,
    sortByRating,
    locations,
    hideConflicts,
    mySchedule,
    travelBuffer,
    filterDays,
    earliestStartText,
    latestEndText,
  ]);

  useEffect(() => {
    const handle = setTimeout(runSearch, 350); // debounce
    return () => clearTimeout(handle);
  }, [runSearch]);

  const { pull, refreshing, threshold } = usePullToRefresh(
    () => Promise.all([runSearch(), refreshWatches()]).then(() => {}),
    pathname === "/",
  );

  function handleTermChange(key: string) {
    const next = TERM_OPTIONS.find((t) => termKey(t) === key);
    if (!next) return;
    setTerm(next);
    saveTermPreference(next);
  }

  function toggleLocation(value: string) {
    setLocations((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function toggleDay(value: string) {
    setFilterDays((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
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
      <NotificationPrompt />
      <select
        className="input"
        style={{ width: "auto", marginBottom: 10 }}
        value={termKey(term)}
        onChange={(e) => handleTermChange(e.target.value)}
      >
        {TERM_OPTIONS.map((t) => (
          <option key={termKey(t)} value={termKey(t)}>
            {termLabel(t)}
          </option>
        ))}
      </select>
      <input
        className="input"
        placeholder="Search by name, subject, course #, core code, or index #"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        spellCheck={false}
      />

      <div className="filter-row">
        <span className="filter-label">Min RMP rating</span>
        <div className="chip-row">
          {[null, 3, 3.5, 4, 4.5].map((r) => (
            <button
              key={String(r)}
              className={`chip ${minRating === r ? "active" : ""}`}
              onClick={() => setMinRating(r)}
            >
              {r == null ? "Any" : `${r}+`}
            </button>
          ))}
        </div>
      </div>

      {minRating != null && (
        <label className="switch-row">
          <span className="filter-label">Include instructors with no RMP match</span>
          <input type="checkbox" checked={includeUnrated} onChange={(e) => setIncludeUnrated(e.target.checked)} />
        </label>
      )}

      <label className="switch-row">
        <span className="filter-label">
          Hide conflicts with {scheduleName || "My Schedule"} ({mySchedule.length} blocks)
        </span>
        <input type="checkbox" checked={hideConflicts} onChange={(e) => setHideConflicts(e.target.checked)} />
      </label>

      {hideConflicts && (
        <label className="switch-row">
          <span className="filter-label">Also flag tight cross-campus back-to-backs</span>
          <select
            className="input"
            style={{ width: 90, flex: "0 0 auto" }}
            value={travelBuffer}
            onChange={(e) => setTravelBuffer(Number(e.target.value))}
          >
            <option value={0}>Off</option>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>60 min</option>
          </select>
        </label>
      )}

      <button className="more-filters-toggle" onClick={() => setShowMoreFilters((v) => !v)}>
        {showMoreFilters ? "▾ Fewer filters" : "▸ More filters (sort, location, days/times, online/async)"}
      </button>

      {showMoreFilters && (
        <>
          <label className="switch-row">
            <span className="filter-label">Only show professors with an RMP profile</span>
            <input
              type="checkbox"
              checked={requireRmpMatch}
              onChange={(e) => setRequireRmpMatch(e.target.checked)}
            />
          </label>

          <label className="switch-row">
            <span className="filter-label">Sort by highest-rated professor first</span>
            <input type="checkbox" checked={sortByRating} onChange={(e) => setSortByRating(e.target.checked)} />
          </label>

          <div className="filter-row">
            <span className="filter-label">Campus / online</span>
            <div className="chip-row">
              {LOCATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`chip ${locations.has(opt.value) ? "active" : ""}`}
                  onClick={() => toggleLocation(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-row">
            <span className="filter-label">Days</span>
            <div className="chip-row">
              {DAYS.map((d) => (
                <button
                  key={d}
                  className={`day-chip ${filterDays.has(d) ? "active" : ""}`}
                  onClick={() => toggleDay(d)}
                >
                  {DAY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-row">
            <span className="filter-label">Time window</span>
            <div className="row-flex" style={{ marginTop: 6 }}>
              <input
                className="input"
                placeholder="No earlier than, e.g. 9:00 AM"
                value={earliestStartText}
                onChange={(e) => setEarliestStartText(e.target.value)}
              />
              <input
                className="input"
                placeholder="No later than, e.g. 5:00 PM"
                value={latestEndText}
                onChange={(e) => setLatestEndText(e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      {loading && results.length === 0 ? (
        <div style={{ marginTop: 12 }}>
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : (
        loading && <p className="hint" style={{ marginTop: 12 }}>Searching…</p>
      )}
      {error && <p className="error-text">{error}</p>}

      <div style={{ marginTop: 8 }}>
        {results.map((item) => (
          <SectionRow
            key={item.id}
            section={item}
            isWatched={watchedIndexes.has(item.index_number)}
            onToggleWatch={() => toggleWatch(item)}
            onClick={() => navigate(`/course/${item.course_id}?year=${term.year}&code=${term.code}`)}
          />
        ))}
        {!loading && !hasAnyFilter && results.length === 0 && (
          <EmptyState icon="search">
            Type a course name, subject, core code, or index number above — or use a filter below — to
            search {termLabel(term)}.
          </EmptyState>
        )}
        {!loading && hasAnyFilter && results.length === 0 && (
          <EmptyState icon="search">No sections match yet — try a different search.</EmptyState>
        )}
      </div>
    </div>
  );
}
