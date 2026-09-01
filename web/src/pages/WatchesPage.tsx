import { useCallback, useEffect, useState } from "react";
import { listWatches, removeWatch } from "../lib/watches";
import { termLabel } from "../lib/term";
import type { Watch } from "../types/db";

export function WatchesPage() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWatches(await listWatches());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load snipes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div>
      {loading && <p className="hint">Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {watches.map((item) => (
        <div key={item.id} className="card card-row">
          <div style={{ flex: 1 }}>
            <p className="meta">{termLabel({ year: item.term_year, code: item.term_code })}</p>
            <p style={{ fontWeight: 700, fontSize: 15 }}>Index {item.index_number}</p>
            <p className="meta">
              {item.last_status ? "Currently open" : "Currently closed — waiting to snipe it"}
            </p>
          </div>
          <button
            className="btn btn-danger btn-small"
            onClick={async () => {
              await removeWatch(item.id);
              refresh();
            }}
          >
            Stop sniping
          </button>
        </div>
      ))}
      {!loading && watches.length === 0 && (
        <p className="empty-text">
          Nothing sniped yet. Find a closed section in Search and tap "Notify me" to get a push the moment
          a seat opens.
        </p>
      )}
    </div>
  );
}
