import { useEffect, useRef, useState } from "react";

const THRESHOLD = 64; // px of pull past the top before a release triggers a refresh
const MAX_PULL = 100; // visual cap so the indicator can't be dragged forever
const DRAG_RATIO = 0.5; // pull moves slower than the finger, like native pull-to-refresh

/**
 * Attaches touch listeners to the app's single shared scroll container
 * (`.app-main` in App.tsx — every tab lives inside it, see App.tsx's comment
 * on why tabs stay mounted with `display` toggling rather than unmounting)
 * and calls `onRefresh()` when the user pulls down past THRESHOLD, starting
 * from already scrolled to the top, then releases.
 *
 * `enabled` should be true only while this page is the visible tab — every
 * tab that uses this hook stays mounted, so without that gate two hidden
 * tabs would both try to react to the same touches on `.app-main` at once.
 *
 * `onRefresh` doesn't need to be memoized -- the latest one is always read
 * from a ref at gesture-end, so passing a fresh closure every render never
 * tears down and re-attaches the actual touch listeners.
 */
export function usePullToRefresh(onRefresh: () => Promise<void>, enabled: boolean) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const startY = useRef<number | null>(null);
  const busyRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;
    const container = document.querySelector<HTMLElement>(".app-main");
    if (!container) return;

    function setPullValue(v: number) {
      pullRef.current = v;
      setPull(v);
    }

    function onTouchStart(e: TouchEvent) {
      if (busyRef.current || container!.scrollTop > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current == null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0 || container!.scrollTop > 0) {
        setPullValue(0);
        return;
      }
      // Only once we know this is a downward pull from the top -- take over
      // the gesture from native scrolling so the page doesn't bounce/scroll
      // underneath the indicator.
      e.preventDefault();
      setPullValue(Math.min(delta * DRAG_RATIO, MAX_PULL));
    }

    async function onTouchEnd() {
      if (startY.current == null) return;
      startY.current = null;
      if (pullRef.current >= THRESHOLD) {
        busyRef.current = true;
        setRefreshing(true);
        setPullValue(THRESHOLD);
        try {
          await onRefreshRef.current();
        } finally {
          busyRef.current = false;
          setRefreshing(false);
          setPullValue(0);
        }
      } else {
        setPullValue(0);
      }
    }

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);
    container.addEventListener("touchcancel", onTouchEnd);
    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled]);

  return { pull, refreshing, threshold: THRESHOLD };
}
