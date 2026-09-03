import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { haptic } from "../lib/haptics";

const WEBREG_URL = "https://sims.rutgers.edu/webreg/";

// A website has no way to script a separate tab it opens on a different
// origin — browsers block that as cross-origin scripting, confirmed live
// against WebReg's own form (neither a GET-query pre-fill nor a same-tab
// cross-origin POST worked; WebReg's session cookie isn't sent on either,
// by design). Genuine autofill would need a browser extension -- tried
// that too, but asking everyone using this app to install one just to
// register is too much friction, so copy-index + open WebReg is the one
// real path, for everyone, no exceptions.
export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const indexNumber = searchParams.get("index") ?? "";
  const label = searchParams.get("label") ?? "";
  const [copied, setCopied] = useState(false);

  async function copyIndex() {
    await navigator.clipboard.writeText(indexNumber);
    setCopied(true);
    haptic("tap");
    setTimeout(() => setCopied(false), 2000);
  }

  function openWebReg() {
    window.open(WEBREG_URL, "_blank", "noopener,noreferrer");
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
        Copy the index number above, open WebReg, log in, and paste it into the quick-add box.
      </p>
    </div>
  );
}
