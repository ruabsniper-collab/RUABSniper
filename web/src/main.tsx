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

  // sw.js's notificationclick handler posts {type:"navigate", url} to an
  // already-open window instead of opening a fresh one (see its comment) --
  // this is the other half of that: without a listener here, tapping a
  // notification while the app happened to still be open in the background
  // just focused the window without ever going to the tapped section. A
  // full navigation (not client-side routing) since this runs outside
  // react-router entirely.
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "navigate" && typeof event.data.url === "string") {
      window.location.href = event.data.url;
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
