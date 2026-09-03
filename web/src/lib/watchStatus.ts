// Minimal pub/sub, same pattern as lib/toast.ts -- lets WatchesPage publish
// "how many of my snipes are open right now" without lifting that state up
// into App.tsx, and lets BottomNav (a sibling, not a parent/child of
// WatchesPage) subscribe to show a badge dot on the Snipes tab. WatchesPage
// polls continuously once mounted regardless of which tab is active (see
// its own comment), so this stays live even while you're on a different tab.
type Listener = (openCount: number) => void;

let openCount = 0;
const listeners = new Set<Listener>();

export function setOpenSnipeCount(count: number) {
  if (count === openCount) return;
  openCount = count;
  for (const l of listeners) l(openCount);
}

export function subscribeOpenSnipeCount(listener: Listener): () => void {
  listeners.add(listener);
  listener(openCount);
  return () => listeners.delete(listener);
}
