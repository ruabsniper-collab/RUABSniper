import { useEffect, useState } from "react";
import { subscribeToasts, type Toast } from "../lib/toast";

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
          {t.message}
        </div>
      ))}
    </div>
  );
}
