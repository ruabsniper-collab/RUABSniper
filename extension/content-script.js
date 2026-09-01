// RUAB Sniper WebReg autofill.
//
// Reads a course index encoded in the URL's hash fragment (set by RUAB
// Sniper's own "Open WebReg" button — see web/src/pages/RegisterPage.tsx —
// as #ruabsniper-index=XXXXX) and fills it into WebReg's real quick-add
// index box. A URL fragment is never sent to any server, so this only ever
// does anything when this extension happens to be installed; everyone
// else's WebReg is completely unaffected by the link itself.
//
// Deliberately fills the box and stops there -- never touches "ADD
// COURSES" itself. Actually registering stays a real, deliberate click you
// make, same as if you'd typed the index in yourself.
//
// Verified live against WebReg's actual form (2026-09-01): the index field
// is <input id="i1" name="coursesToAdd[0].courseIndex" maxlength="5">, and
// getting there from a fresh link can pass through a few pages first
// (an intermediate refresh/semester-chooser step) before landing on the
// real "Manage Registration" screen with the box on it -- a browser
// redirect doesn't carry a URL fragment forward on its own, so the pending
// index is stashed in sessionStorage (survives navigation within the same
// tab, same origin) rather than relying on the hash still being there by
// the time the right page loads.

(function () {
  const STORAGE_KEY = "ruabsniper-pending-index";

  const hashMatch = location.hash.match(/ruabsniper-index=(\d{1,5})/);
  if (hashMatch) {
    sessionStorage.setItem(STORAGE_KEY, hashMatch[1]);
    // Tidy the fragment out of the visible URL rather than leaving it there
    // indefinitely.
    history.replaceState(null, "", location.pathname + location.search);
  }

  const pendingIndex = sessionStorage.getItem(STORAGE_KEY);
  if (!pendingIndex) return;

  function findIndexField() {
    return (
      document.getElementById("i1") ||
      document.querySelector('input[name="coursesToAdd[0].courseIndex"]') ||
      // Fallback if Rutgers ever renames these -- same loose heuristic the
      // old mobile app's WebView fill script used: a short, empty text
      // input capped at 5 characters (WebReg index numbers are 5 digits).
      Array.from(document.querySelectorAll('input[type="text"]')).find(
        (el) => el.getAttribute("maxlength") === "5" && !el.value,
      )
    );
  }

  function fillField() {
    const field = findIndexField();
    if (!field) return false;

    field.focus();
    field.value = pendingIndex;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.scrollIntoView({ block: "center" });

    // Brief highlight so it's obvious something happened automatically.
    const previousOutline = field.style.outline;
    field.style.outline = "3px solid #cc0033";
    setTimeout(() => {
      field.style.outline = previousOutline;
    }, 1500);

    sessionStorage.removeItem(STORAGE_KEY); // done -- don't reapply on a later, unrelated visit
    return true;
  }

  // The real field might not exist yet on whatever intermediate page this
  // is (WebReg's own redirects: a session refresh step, a semester chooser,
  // etc.) -- keep checking for up to ~10 seconds across those hops rather
  // than giving up after one look.
  let attempts = 0;
  const interval = setInterval(() => {
    attempts += 1;
    if (fillField() || attempts > 40) clearInterval(interval);
  }, 250);
})();
