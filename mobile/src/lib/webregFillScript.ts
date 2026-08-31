// Injected into the real WebReg page (see RegisterScreen). Best-effort by
// design: WebReg's DOM isn't documented anywhere and this repo has never
// been able to inspect it directly (it's behind CAS login), so this uses
// loose heuristics rather than a fixed selector, and always reports back
// whether it actually found something to fill via ReactNativeWebView
// .postMessage — the screen falls back to "copy the index, paste it
// yourself" whenever this comes back false.

export function buildFillScript(indexNumber: string): string {
  // Returned as a string so it can be handed to WebView's injectedJavaScript
  // / injectJavaScript — keep it a single expression-less IIFE, no imports.
  return `
(function () {
  function report(found) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "fillResult", found: found }));
    } catch (e) {}
  }

  function fire(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function looksLikeIndexField(el) {
    var attrs = ((el.id || "") + " " + (el.name || "") + " " + (el.placeholder || "")).toLowerCase();
    if (attrs.indexOf("index") !== -1) return true;
    // WebReg's quick-add boxes are commonly 5-char-max plain text inputs.
    if (el.tagName === "INPUT" && (el.type === "text" || el.type === "tel" || el.type === "number")) {
      var maxLen = el.getAttribute("maxlength");
      if (maxLen && parseInt(maxLen, 10) === 5) return true;
    }
    return false;
  }

  var inputs = Array.prototype.slice.call(document.querySelectorAll("input"));
  var candidates = inputs.filter(looksLikeIndexField);
  var target = candidates.find(function (el) { return !el.value; }) || candidates[0];

  if (!target) {
    report(false);
    return;
  }

  target.focus();
  target.value = ${JSON.stringify(indexNumber)};
  fire(target);
  target.scrollIntoView({ block: "center" });
  report(true);
})();
true;
`;
}
