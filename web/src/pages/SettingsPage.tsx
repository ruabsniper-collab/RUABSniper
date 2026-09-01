import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushStatus, type PushStatus } from "../lib/push";

const STATUS_COPY: Record<PushStatus, string> = {
  unsupported: "This browser doesn't support push notifications.",
  denied: "Notifications are blocked for this site — re-enable them in your browser's site settings.",
  unsubscribed: "Not enabled yet.",
  subscribed: "Enabled — you'll get a real push the moment a watched section opens.",
};

export function SettingsPage() {
  const [status, setStatus] = useState<PushStatus | "checking">("checking");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushStatus().then(setStatus);
  }, []);

  async function handleEnable() {
    setBusy(true);
    setError(null);
    try {
      await enablePush();
      setStatus(await getPushStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't enable notifications");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setError(null);
    try {
      await disablePush();
      setStatus(await getPushStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't disable notifications");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card">
        <h3>Seat-open notifications</h3>
        <p className="hint">{status === "checking" ? "Checking…" : STATUS_COPY[status]}</p>
        {error && <p className="error-text">{error}</p>}
        {status === "unsubscribed" && (
          <button className="btn" style={{ marginTop: 8 }} onClick={handleEnable} disabled={busy}>
            Enable notifications
          </button>
        )}
        {status === "subscribed" && (
          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={handleDisable} disabled={busy}>
            Turn off notifications
          </button>
        )}
        <p className="hint" style={{ marginTop: 8 }}>
          On iPhone, real push only works after you "Add to Home Screen" first (Share → Add to Home
          Screen) — a regular Safari tab can't receive push. Everything else works fine either way.
        </p>
      </div>

      <div className="card">
        <h3>What this app stores</h3>
        <p className="hint">
          No Rutgers account, no NetID, no password — ever. A random id for this browser is used only to
          remember what you're watching and where to send notifications. Your "My Schedule" list stays on
          this device only.
        </p>
      </div>
    </div>
  );
}
