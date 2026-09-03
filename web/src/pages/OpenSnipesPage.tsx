import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getWatchedSections, type WatchedSection } from "../lib/courses";
import { addWatch, removeWatch } from "../lib/watches";
import { SectionRow } from "../components/SectionRow";
import { EmptyState } from "../components/EmptyState";
import { haptic } from "../lib/haptics";
import { showToast } from "../lib/toast";

function watchLabel({ watch, section }: WatchedSection): string {
  return section
    ? `${section.courses.subject_code}:${section.courses.course_number} sec ${section.section_number}`
    : `index ${watch.index_number}`;
}

// Reached by tapping the "Open now" stat card on Watches -- a real
// navigation-stack page (like CourseDetail/Register, see App.tsx's comment
// on why those aren't tabs) rather than an in-place filter, so it's a real
// URL with its own back-button semantics. No separate polling loop here --
// WatchesPage's own poll (which keeps running regardless of which tab is
// visible) is still the source of truth for the badge dot and the "just
// opened" flash; this page just needs one fresh read on mount.
export function OpenSnipesPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState<WatchedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await getWatchedSections();
      setOpen(data.filter((w) => w.watch.last_status));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load open snipes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function stopSniping(w: WatchedSection) {
    const { watch } = w;
    await removeWatch(watch.id);
    haptic("tap");
    showToast(`Stopped sniping ${watchLabel(w)}`, "default", {
      label: "Undo",
      onClick: async () => {
        await addWatch({ year: watch.term_year, code: watch.term_code }, watch.index_number, watch.last_status);
        haptic("confirm");
        await refresh();
      },
    });
    await refresh();
  }

  return (
    <div>
      <h2>Open right now</h2>
      {loading && (
        <div>
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      {open.map((w) => {
        const { watch, section } = w;
        return section ? (
          <SectionRow
            key={watch.id}
            section={{ ...section, open: true }}
            isWatched
            onToggleWatch={() => stopSniping(w)}
            onClick={() => navigate(`/course/${section.course_id}?year=${watch.term_year}&code=${watch.term_code}`)}
          />
        ) : (
          <div key={watch.id} className="card card-row">
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 700, fontSize: 15 }}>Index {watch.index_number}</p>
              <p className="meta">Course details aren't cached yet — check back after the next catalog refresh.</p>
            </div>
            <button className="btn btn-danger btn-small" onClick={() => stopSniping(w)}>
              Stop sniping
            </button>
          </div>
        );
      })}

      {!loading && open.length === 0 && (
        <EmptyState icon="target">
          Nothing open right now — the last of your open snipes was just stopped or closed back up.
        </EmptyState>
      )}
    </div>
  );
}
