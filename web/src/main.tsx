import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { applyTheme, getTheme } from "./lib/theme";
import { restoreNotificationOnLaunch } from "./lib/notificationNavigation";
import { traceNotification } from "./lib/notificationTrace";
import "./styles.css";

// The data-theme attribute itself was already set (if any) by the inline
// script in index.html <head>, before first paint. This just brings the
// theme-color meta tag and the system-preference listener up to speed —
// see lib/theme.ts.
applyTheme(getTheme());

// Register the service worker as early as possible so a push subscription
// (created later, from Settings) always has a controller to attach to. Safe
// to no-op on browsers without support — see lib/push.ts's pushSupported().
// NotificationNavigation handles warm resumes; bootstrap restores a tapped
// section before mounting the router if the installed app opens at home.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch((err) => {
    console.warn("[sw] registration failed:", err);
  });
}

void restoreNotificationOnLaunch().finally(() => {
  traceNotification("app-start", window.location.href);
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
});
