import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushStatus, type PushStatus } from "../lib/push";
import { getTheme, setTheme, type ThemePref } from "../lib/theme";

const STATUS_COPY: Record<PushStatus, string> = {
  unsupported: "This browser doesn't support push notifications.",
  denied: "Notifications are blocked for this site — re-enable them in your browser's site settings.",
  unsubscribed: "Not enabled yet.",
  subscribed: "Enabled — you'll get a real push the moment a sniped section opens.",
};

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsPage() {
  const [status, setStatus] = useState<PushStatus | "checking">("checking");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [theme, setThemeState] = useState<ThemePref>(getTheme());

  useEffect(() => {
    getPushStatus().then(setStatus);
  }, []);

  function handleThemeChange(pref: ThemePref) {
    setTheme(pref);
    setThemeState(pref);
  }

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
        <h3>Appearance</h3>
        <p className="hint">"System" follows your phone/browser's own light or dark setting.</p>
        <div className="segmented" style={{ marginTop: 8 }}>
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={theme === opt.value ? "active" : ""}
              onClick={() => handleThemeChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

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
          remember what you're sniping and where to send notifications. Your "My Schedule" list stays on
          this device only.
        </p>
      </div>
    </div>
  );
}
