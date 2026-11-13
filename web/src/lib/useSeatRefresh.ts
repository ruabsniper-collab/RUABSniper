import { useEffect } from "react";

export function useSeatRefresh(refresh: () => Promise<unknown>, active = true) {
  useEffect(() => {
    if (!active) return;
    const check = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = setInterval(check, 30_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [refresh, active]);
}
