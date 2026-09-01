// Light/dark/system theme preference. The actual color tokens live in
// styles.css as CSS variables; this decides which of the three states is
// active, persists the choice, and keeps the browser-chrome `theme-color`
// meta tag matching. The very first application (so there's no flash of the
// wrong theme before React even mounts) happens in an inline script in
// index.html <head> -- keep STORAGE_KEY in sync with that script if it ever
// changes.

export type ThemePref = "system" | "light" | "dark";

const STORAGE_KEY = "ruabsniper:theme";
const LIGHT_THEME_COLOR = "#cc0033";
const DARK_THEME_COLOR = "#0d1117";

let systemMediaQuery: MediaQueryList | null = null;

function resolvedIsDark(pref: ThemePref): boolean {
  if (pref === "dark") return true;
  if (pref === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function updateThemeColorMeta(pref: ThemePref): void {
  const meta = document.getElementById("theme-color-meta");
  meta?.setAttribute("content", resolvedIsDark(pref) ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
}

export function getTheme(): ThemePref {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function applyTheme(pref: ThemePref): void {
  if (pref === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", pref);
  updateThemeColorMeta(pref);

  // While following the system preference, keep the meta tag (and, thanks
  // to the CSS media query, the whole page) live if the OS theme flips —
  // e.g. the sun goes down and the phone switches to dark automatically.
  systemMediaQuery?.removeEventListener("change", onSystemChange);
  if (pref === "system") {
    systemMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    systemMediaQuery.addEventListener("change", onSystemChange);
  }
}

function onSystemChange(): void {
  updateThemeColorMeta("system");
}

export function setTheme(pref: ThemePref): void {
  localStorage.setItem(STORAGE_KEY, pref);
  applyTheme(pref);
}
