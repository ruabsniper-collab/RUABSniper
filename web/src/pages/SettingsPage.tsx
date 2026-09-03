import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushStatus, type PushStatus } from "../lib/push";
import { getTheme, setTheme, type ThemePref } from "../lib/theme";
import { haptic } from "../lib/haptics";
import { showToast } from "../lib/toast";

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

  // navigator.share() opens the OS's own share sheet (Messages/iMessage,
  // WhatsApp, copy link, etc.) -- the whole reason this app exists right
  // now is to be shared with friends, so this closes the loop instead of
  // making someone manually copy the URL out of their address bar.
  // Desktop Firefox and a few others don't implement it at all, so this
  // falls back to just copying the link, same shape as RegisterPage's
  // "Copy index" -- always some visible confirmation, never a silent no-op.
  async function shareApp() {
    haptic("tap");
    const shareData = {
      title: "RUAB Sniper",
      text: "Get a push the instant a closed Rutgers class opens up.",
      url: window.location.origin,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (e) {
        // AbortError just means they closed the share sheet without
        // picking anything -- not a failure worth surfacing.
        if (e instanceof Error && e.name !== "AbortError") {
          showToast("Couldn't open the share sheet");
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        showToast("Link copied!", "success");
      } catch {
        // Clipboard access can fail too (permissions, insecure context,
        // an unfocused document) -- this branch only runs on a browser
        // that also lacks navigator.share, so there's no second fallback
        // left; at least say so instead of silently doing nothing.
        showToast(`Couldn't copy — the link is ${shareData.url}`);
      }
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

      <div className="card">
        <h3>Share this app</h3>
        <p className="hint">Know someone else fighting for a seat? Send them the link.</p>
        <button className="btn" style={{ marginTop: 8 }} onClick={shareApp}>
          Invite a friend
        </button>
      </div>
    </div>
  );
}
