import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { searchCourses, LOCATION_OPTIONS } from "../lib/courses";
import { guessCurrentTerm, termLabel } from "../lib/term";
import { addWatch, listWatches, removeWatch } from "../lib/watches";
import { loadMySchedule, type ScheduleBlock } from "../lib/schedule";
import { maybePromptAfterAddingWatch } from "../lib/push";
import { SectionRow } from "../components/SectionRow";
import { NotificationPrompt } from "../components/NotificationPrompt";
import type { SectionWithCourse } from "../types/db";

const term = guessCurrentTerm();

export function SearchPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [query, setQuery] = useState("");
  const [minRating, setMinRating] = useState<number | null>(null);
  const [includeUnrated, setIncludeUnrated] = useState(true);
  const [requireRmpMatch, setRequireRmpMatch] = useState(false);
  const [sortByRating, setSortByRating] = useState(false);
  const [locations, setLocations] = useState<Set<string>>(new Set());
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [hideConflicts, setHideConflicts] = useState(false);
  const [mySchedule, setMySchedule] = useState<ScheduleBlock[]>([]);
  const [results, setResults] = useState<SectionWithCourse[]>([]);
  const [watchedIndexes, setWatchedIndexes] = useState<Set<string>>(new Set());
  const [watchIdByIndex, setWatchIdByIndex] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshWatches = useCallback(async () => {
    const watches = await listWatches();
    const relevant = watches.filter((w) => w.term_year === term.year && w.term_code === term.code);
    setWatchedIndexes(new Set(relevant.map((w) => w.index_number)));
    setWatchIdByIndex(new Map(relevant.map((w) => [w.index_number, w.id])));
  }, []);

  // This tab never unmounts (see App.tsx) -- a plain mount-time effect would
  // only ever run once, missing anything added to My Schedule or changed in
  // Snipes after that first load. Re-syncing on every return to "/" instead
  // means both stay fresh without needing a full app restart, while still
  // not touching query/results state when you're not on this tab.
  useEffect(() => {
    if (pathname !== "/") return;
    setMySchedule(loadMySchedule());
    refreshWatches();
  }, [pathname, refreshWatches]);

  const runSearch = useCallback(async () => {
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
      });
      setResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [query, minRating, includeUnrated, requireRmpMatch, sortByRating, locations, hideConflicts, mySchedule]);

  useEffect(() => {
    const handle = setTimeout(runSearch, 350); // debounce
    return () => clearTimeout(handle);
  }, [runSearch]);

  function toggleLocation(value: string) {
    setLocations((prev) => {
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
    } else {
      const hadNoWatchesBefore = (await listWatches()).length === 0;
      await addWatch(term, section.index_number, section.open);
      await maybePromptAfterAddingWatch(hadNoWatchesBefore);
    }
    await refreshWatches();
  }

  return (
    <div>
      <NotificationPrompt />
      <p className="hint">{termLabel(term)}</p>
      <input
        className="input"
        placeholder="Search by name, subject, course #, or core code (e.g. WCr)"
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
        <span className="filter-label">Hide conflicts with My Schedule ({mySchedule.length} blocks)</span>
        <input type="checkbox" checked={hideConflicts} onChange={(e) => setHideConflicts(e.target.checked)} />
      </label>

      <button className="more-filters-toggle" onClick={() => setShowMoreFilters((v) => !v)}>
        {showMoreFilters ? "▾ Fewer filters" : "▸ More filters (sort, location, online/async)"}
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
        </>
      )}

      {loading && <p className="hint" style={{ marginTop: 12 }}>Searching…</p>}
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
        {!loading && results.length === 0 && (
          <p className="empty-text">No sections match yet — try a different search.</p>
        )}
      </div>
    </div>
  );
}
