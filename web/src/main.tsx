import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { applyTheme, getTheme } from "./lib/theme";
import "./styles.css";

// The data-theme attribute itself was already set (if any) by the inline
// script in index.html <head>, before first paint. This just brings the
// theme-color meta tag and the system-preference listener up to speed —
// see lib/theme.ts.
applyTheme(getTheme());

// Register the service worker as early as possible so a push subscription
// (created later, from Settings) always has a controller to attach to. Safe
// to no-op on browsers without support — see lib/push.ts's pushSupported().
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((err) => {
    console.warn("[sw] registration failed:", err);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
