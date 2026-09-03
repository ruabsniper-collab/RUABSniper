import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { haptic } from "../lib/haptics";
import { getSectionByIndex } from "../lib/courses";
import { meetingSummary } from "../components/SectionRow";
import { RatingBadge } from "../components/RatingBadge";
import type { SectionWithCourse } from "../types/db";

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
  const [section, setSection] = useState<SectionWithCourse | null>(null);
  const [loading, setLoading] = useState(true);

  // This page is reached from a push notification tap as often as from an
  // in-app button (see sw.js's notificationclick + backend/lib/pollOnce.ts)
  // -- a fresh top-level load with nothing but ?index=&label= in the URL,
  // no in-memory section object to fall back on. Fetching by index is the
  // one path that works for both, so someone doesn't have to remember what
  // a bare index number means (professor, when, where) right when they're
  // about to act on it.
  useEffect(() => {
    let cancelled = false;
    if (!indexNumber) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getSectionByIndex(indexNumber)
      .then((s) => {
        if (!cancelled) setSection(s);
      })
      .catch(() => {
        // Swallow -- the page still works with just the index number below,
        // this detail card is a bonus, not a requirement to register.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [indexNumber]);

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

      {loading && <div className="skeleton-row" style={{ marginTop: 12, height: 120 }} />}

      {!loading && section && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="section-row-header">
            <span className="section-title">
              {section.courses.subject_code}:{section.courses.course_number} — {section.courses.title}
            </span>
            <span className={`pill ${section.open ? "pill-open" : "pill-closed"}`}>
              {section.open ? "OPEN" : "CLOSED"}
            </span>
          </div>
          <p className="meta">Section {section.section_number}</p>
          {section.instructors.length === 0 ? (
            <p className="meta">Staff</p>
          ) : (
            section.instructors.map((name, i) => (
              <div key={i} className="card-row" style={{ gap: 6, marginTop: 2 }}>
                <span className="meta" style={{ flex: 1 }}>
                  {name}
                </span>
                <RatingBadge rating={section.professorRatings?.[i] ?? null} />
              </div>
            ))
          )}
          <p className="meta" style={{ marginTop: 4 }}>
            {meetingSummary(section)}
          </p>
        </div>
      )}

      {!loading && !section && (
        <p className="hint" style={{ marginTop: 12 }}>
          {label || "Couldn't load full section details — you can still register with the index below."}
        </p>
      )}

      <div className="index-bar">
        <div>
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
