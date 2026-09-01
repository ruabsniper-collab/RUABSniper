import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getWatchedSections, type WatchedSection } from "../lib/courses";
import { removeWatch } from "../lib/watches";
import { termLabel } from "../lib/term";
import { SectionRow } from "../components/SectionRow";

export function WatchesPage() {
  const navigate = useNavigate();
  const [watched, setWatched] = useState<WatchedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWatched(await getWatchedSections());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load snipes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function stopSniping(watchId: string) {
    await removeWatch(watchId);
    await refresh();
  }

  return (
    <div>
      {loading && <p className="hint">Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {watched.map(({ watch, section }) =>
        section ? (
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
            onToggleWatch={() => stopSniping(watch.id)}
            onClick={() => navigate(`/course/${section.course_id}?year=${watch.term_year}&code=${watch.term_code}`)}
          />
        ) : (
          <div key={watch.id} className="card card-row">
            <div style={{ flex: 1 }}>
              <p className="meta">{termLabel({ year: watch.term_year, code: watch.term_code })}</p>
              <p style={{ fontWeight: 700, fontSize: 15 }}>Index {watch.index_number}</p>
              <p className="meta">Course details aren't cached yet — check back after the next catalog refresh.</p>
            </div>
            <button className="btn btn-danger btn-small" onClick={() => stopSniping(watch.id)}>
              Stop sniping
            </button>
          </div>
        ),
      )}

      {!loading && watched.length === 0 && (
        <p className="empty-text">
          Nothing sniped yet. Find a closed section in Search and tap "Notify me" to get a push the moment
          a seat opens.
        </p>
      )}
    </div>
  );
}
