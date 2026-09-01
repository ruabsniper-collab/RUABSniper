import { useEffect, useState } from "react";
import { enablePush, getPushStatus, type PushStatus } from "../lib/push";

const DISMISS_KEY = "ruabsniper:notifPromptDismissed";

/**
 * A dismissible nudge shown at the top of Search — the goal is that
 * enabling notifications never depends on someone remembering to go find
 * the Settings tab themselves (easy to forget, especially for a friend
 * just trying the app out). Hides itself permanently once dismissed,
 * subscribed, denied, or on a browser that doesn't support push at all —
 * never nags. See lib/push.ts's maybePromptAfterAddingWatch for the other
 * half of this: a direct prompt the moment someone adds their first watch.
 */
export function NotificationPrompt() {
  const [status, setStatus] = useState<PushStatus | "checking" | "hidden">("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) {
      setStatus("hidden");
      return;
    }
    getPushStatus().then(setStatus);
  }, []);

  if (status === "checking" || status === "hidden" || status === "unsupported" || status === "denied" || status === "subscribed") {
    return null;
  }

  async function handleEnable() {
    setBusy(true);
    setError(null);
    try {
      await enablePush();
      setStatus("subscribed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't enable notifications");
    } finally {
      setBusy(false);
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setStatus("hidden");
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
      <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>Get notified the moment a seat opens?</p>
      <p className="hint" style={{ margin: 0 }}>
        Real push notifications, straight to this device — free, no email, no spam.
      </p>
      {error && <p className="error-text">{error}</p>}
      <div className="row-flex">
        <button className="btn btn-small" onClick={handleEnable} disabled={busy}>
          Enable notifications
        </button>
        <button className="btn-secondary btn btn-small" onClick={handleDismiss} disabled={busy}>
          Not now
        </button>
      </div>
    </div>
  );
}
