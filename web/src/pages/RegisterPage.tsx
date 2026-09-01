import { useState } from "react";
import { useSearchParams } from "react-router-dom";

const WEBREG_URL = "https://sims.rutgers.edu/webreg/";

// A website has no way to script a separate tab it opens on a different
// origin — browsers block that as cross-origin scripting, confirmed live
// against WebReg's own form (neither a GET-query pre-fill nor a same-tab
// cross-origin POST worked; WebReg's session cookie isn't sent on either,
// by design). "Copy index" stays the reliable path for everyone.
//
// For the extension/ browser extension specifically: the index is also
// appended to the WebReg URL as a hash fragment (#ruabsniper-index=...).
// A URL fragment is never sent to the server at all, so this changes
// nothing for anyone without the extension installed -- WebReg just
// ignores a fragment it doesn't know about, same as today. The extension's
// content script (only runs on sims.rutgers.edu/webreg/*) reads it and
// fills the index box in for you.
export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const indexNumber = searchParams.get("index") ?? "";
  const label = searchParams.get("label") ?? "";
  const [copied, setCopied] = useState(false);

  async function copyIndex() {
    await navigator.clipboard.writeText(indexNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openWebReg() {
    const url = indexNumber ? `${WEBREG_URL}#ruabsniper-index=${indexNumber}` : WEBREG_URL;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <div className="banner">
        Log in with your own NetID on WebReg — your password goes straight to Rutgers, never through this
        app.
      </div>

      <div className="index-bar">
        <div>
          <p className="meta">{label}</p>
          <p className="index-number">Index {indexNumber}</p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        <button className="btn" onClick={copyIndex}>
          {copied ? "Copied!" : "Copy index"}
        </button>
        <button className="btn btn-secondary" onClick={openWebReg}>
          Open WebReg →
        </button>
      </div>

      <p className="hint" style={{ marginTop: 16 }}>
        Copy the index number above, open WebReg, log in, and paste it into the quick-add box. If you've
        installed the RUAB Sniper browser extension, "Open WebReg" fills that box in for you automatically
        — see Settings for how to get it.
      </p>
    </div>
  );
}
