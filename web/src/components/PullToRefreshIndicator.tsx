// A single refresh-arrows glyph that rotates to track pull progress, then
// switches to a continuous spin once the refresh actually fires. Renders
// nothing at rest (pull === 0 and not refreshing) so it never adds dead
// space to a page that hasn't been touched.
export function PullToRefreshIndicator({
  pull,
  refreshing,
  threshold,
}: {
  pull: number;
  refreshing: boolean;
  threshold: number;
}) {
  if (pull === 0 && !refreshing) return null;
  const progress = Math.min(pull / threshold, 1);

  return (
    <div className={`ptr-indicator ${refreshing ? "refreshing" : ""}`} style={{ height: refreshing ? 40 : pull }}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={refreshing ? undefined : { transform: `rotate(${progress * 360}deg)` }}
      >
        <path
          d="M17.65 6.35A7.95 7.95 0 0012 4a8 8 0 108 8h-2a6 6 0 11-1.76-4.24L13 11h7V4l-2.35 2.35z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}
