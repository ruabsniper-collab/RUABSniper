import { useEffect, useState } from "react";
import { dismissToast, subscribeToasts, type Toast } from "../lib/toast";

// Mounted once in App.tsx, outside the tab-switching <main> so it's never
// hidden by a tab's `display: none` -- see App.tsx's comment on why tabs
// stay mounted and are toggled with CSS instead of unmounting.
export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === "success" ? "toast-success" : ""}`}>
          <span>{t.message}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                // Dismiss first -- the action itself (e.g. re-adding a
                // watch) can take a moment, and the toast shouldn't sit
                // there looking tappable again while that's in flight.
                dismissToast(t.id);
                t.action!.onClick();
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
