import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getWatchedSections, type WatchedSection } from "../lib/courses";
import { addWatch, removeWatch } from "../lib/watches";
import { termLabel } from "../lib/term";
import { SectionRow } from "../components/SectionRow";
import { EmptyState } from "../components/EmptyState";
import { PullToRefreshIndicator } from "../components/PullToRefreshIndicator";
import { haptic } from "../lib/haptics";
import { showToast } from "../lib/toast";
import { usePullToRefresh } from "../lib/usePullToRefresh";
import { setOpenSnipeCount } from "../lib/watchStatus";

const POLL_MS = 30_000; // frequent enough to actually catch a closed -> open flip while the tab's open

function watchLabel({ watch, section }: WatchedSection): string {
  return section
    ? `${section.courses.subject_code}:${section.courses.course_number} sec ${section.section_number}`
    : `index ${watch.index_number}`;
}

export function WatchesPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [watched, setWatched] = useState<WatchedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justOpenedIds, setJustOpenedIds] = useState<Set<string>>(new Set());

  // Last-seen open/closed per watch id, so refresh() can tell a genuine
  // closed -> open flip apart from "this is just the first load" (which
  // starts with nothing in the map, so nothing is flagged as "just
  // opened") and apart from an already-open watch staying open.
  const lastStatus = useRef<Map<string, boolean>>(new Map());

  const refresh = useCallback(async (isFirstLoad = false) => {
    if (isFirstLoad) setLoading(true);
    setError(null);
    try {
      const data = await getWatchedSections();
      const newlyOpened = data.filter((w) => lastStatus.current.get(w.watch.id) === false && w.watch.last_status === true);
      lastStatus.current = new Map(data.map((w) => [w.watch.id, w.watch.last_status]));
      setWatched(data);
      // Published for BottomNav's badge dot (lib/watchStatus.ts) -- this
      // runs on every poll tick regardless of which tab is active, so the
      // dot stays live even from Search/My Schedule/Settings.
      setOpenSnipeCount(data.filter((w) => w.watch.last_status).length);

      if (newlyOpened.length > 0) {
        setJustOpenedIds(new Set(newlyOpened.map((w) => w.watch.id)));
        haptic("success");
        for (const w of newlyOpened) showToast(`🎉 A seat opened — ${watchLabel(w)}`, "success");
        // The CSS animation plays once on mount and doesn't need to be
        // "turned off" visually, but clear the flag after it's had time to
        // finish so a later re-render (e.g. the next poll) doesn't replay it.
        setTimeout(() => setJustOpenedIds(new Set()), 1600);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load snipes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(true);
    // This tab never unmounts (see App.tsx), so this interval effectively
    // polls for the whole session once you've visited Watches once -- the
    // whole point being to catch an open-seat flip live instead of only on
    // the next manual visit to this tab.
    const id = setInterval(() => refresh(false), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const { pull, refreshing, threshold } = usePullToRefresh(() => refresh(false), pathname === "/watches");

  async function stopSniping(w: WatchedSection) {
    const { watch } = w;
    await removeWatch(watch.id);
    haptic("tap");
    showToast(`Stopped sniping ${watchLabel(w)}`, "default", {
      label: "Undo",
      onClick: async () => {
        // Re-adds it exactly as it was -- same term/index, and last_status
        // preserved so a currently-open watch doesn't come back "closed"
        // and misfire a false "it just opened!" on the next poll.
        await addWatch({ year: watch.term_year, code: watch.term_code }, watch.index_number, watch.last_status);
        haptic("confirm");
        await refresh(false);
      },
    });
    await refresh(false);
  }

  const openCount = watched.filter((w) => w.watch.last_status).length;

  return (
    <div>
      <PullToRefreshIndicator pull={pull} refreshing={refreshing} threshold={threshold} />
      {error && <p className="error-text">{error}</p>}

      {loading && watched.length === 0 && (
        <div>
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      )}

      {!loading && watched.length > 0 && (
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-label">Sniped</div>
            <div className="stat-value">{watched.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Open now</div>
            <div className={`stat-value ${openCount > 0 ? "green" : ""}`}>{openCount}</div>
          </div>
        </div>
      )}

      {watched.map((w) => {
        const { watch, section } = w;
        return section ? (
          <SectionRow
            key={watch.id}
            // The poller (backend/scripts/poll-and-notify.ts) tracks live
            // open/closed status in watches.last_status, refreshed every
            // ~10-20 minutes; sections.open comes from the catalog ingest,
            // which only runs every 6 hours. last_status is the fresher,
            // more trustworthy signal for exactly the page whose whole job
            // is "what's the current status of what I'm watching" — so it
            // overrides the section's own (possibly stale) open field here.
            section={{ ...section, open: watch.last_status }}
            isWatched
            justOpened={justOpenedIds.has(watch.id)}
            onToggleWatch={() => stopSniping(w)}
            onClick={() => navigate(`/course/${section.course_id}?year=${watch.term_year}&code=${watch.term_code}`)}
          />
        ) : (
          <div key={watch.id} className="card card-row">
            <div style={{ flex: 1 }}>
              <p className="meta">{termLabel({ year: watch.term_year, code: watch.term_code })}</p>
              <p style={{ fontWeight: 700, fontSize: 15 }}>Index {watch.index_number}</p>
              <p className="meta">Course details aren't cached yet — check back after the next catalog refresh.</p>
            </div>
            <button className="btn btn-danger btn-small" onClick={() => stopSniping(w)}>
              Stop sniping
            </button>
          </div>
        );
      })}

      {!loading && watched.length === 0 && (
        <EmptyState icon="target">
          Nothing sniped yet. Find a closed section in Search and tap "Notify me" to get a push the moment
          a seat opens.
        </EmptyState>
      )}
    </div>
  );
}
