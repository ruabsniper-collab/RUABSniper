import { useState } from "react";
import { useSearchParams } from "react-router-dom";

const WEBREG_URL = "https://sims.rutgers.edu/webreg/";

// Unlike the mobile app's WebView (which could inject JS straight into the
// WebReg page it controlled), a website has no way to script a separate tab
// it opens — browsers block that as cross-origin scripting. So this is
// copy-the-index-yourself instead of one-tap autofill; the mobile app's own
// fallback path for when its autofill heuristic failed, promoted to the only
// path here.
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
