import { useEffect, useState } from "react";
import { useVerifiedOpen } from "../lib/useVerifiedOpen";
import { useSearchParams } from "react-router-dom";
import { haptic } from "../lib/haptics";
import { showToast } from "../lib/toast";
import { getSectionByIndex } from "../lib/courses";
import { getAvailability } from "../lib/availability";
import { copyIndexAndOpenWebReg } from "../lib/webReg";
import { creditsLabel, meetingSummary } from "../components/SectionRow";
import { RatingBadge } from "../components/RatingBadge";
import type { SectionWithCourse } from "../types/db";
import type { Term } from "../lib/term";
import { termLabel } from "../lib/term";

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
  // Present on any link generated after the term-threading fix (both
  // SectionRow's "Open WebReg" button and the push-notification URL, see
  // getSectionByIndex's comment) -- absent only on a notification someone
  // left unread from before that shipped, in which case getSectionByIndex
  // falls back to its own "most recent term" guess.
  const yearParam = searchParams.get("year");
  const codeParam = searchParams.get("code");
  // SectionRow's "Open WebReg" button now copies the index itself before
  // navigating here (see its own comment) and flags that with ?copied=1 --
  // start already showing "Copied!" instead of "Copy index" so the button
  // doesn't lie about work that already happened one tap ago. Absent (and
  // still copy-on-first-tap here) for the notification-tap path, where
  // there's no earlier tap to have done it during.
  const [copied, setCopied] = useState(searchParams.get("copied") === "1");
  const [section, setSection] = useState<SectionWithCourse | null>(null);
  const open = useVerifiedOpen(section);
  const [loading, setLoading] = useState(true);

  // Single place the "Copied!" -> "Copy index" reset happens, regardless of
  // whether `copied` became true from arriving pre-copied above or from
  // tapping the button below.
  useEffect(() => {
    if (!copied) return;
    const handle = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(handle);
  }, [copied]);

  // This page is reached from a push notification tap as often as from an
  // in-app button (see sw.js's notificationclick + backend/lib/pollOnce.ts)
  // -- a fresh top-level load with nothing but the URL's own query params,
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
    setSection(null);
    setLoading(true);
    setCopied(searchParams.get("copied") === "1");
    const term: Term | undefined = yearParam && codeParam ? { year: Number(yearParam), code: Number(codeParam) } : undefined;
    const loadSection = () => getSectionByIndex(indexNumber, term)
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
    void loadSection();
    return () => {
      cancelled = true;
    };
  }, [indexNumber, yearParam, codeParam, searchParams]);

  const sectionYear = section?.term_year;
  const sectionCode = section?.term_code;
  useEffect(() => {
    if (!sectionYear || sectionCode === undefined) return;
    const controller = new AbortController();
    let inFlight = false;
    const refresh = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const live = await getAvailability({ year: sectionYear, code: sectionCode }, controller.signal);
        if (!controller.signal.aborted) setSection((current) => current?.index_number === indexNumber
          ? { ...current, open: live.openIndexes.has(indexNumber), availabilityCheckedAt: live.checkedAt } : current);
      } catch {
        if (!controller.signal.aborted) setSection((current) => current?.index_number === indexNumber
          ? { ...current, open: null, availabilityCheckedAt: null } : current);
      } finally { inFlight = false; }
    };
    const check = () => { void refresh(); };
    const interval = setInterval(check, 3_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      controller.abort();
      clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [indexNumber, sectionYear, sectionCode]);

  async function copyIndex() {
    try {
      await navigator.clipboard.writeText(indexNumber);
      setCopied(true);
      haptic("tap");
    } catch {
      // Clipboard access can fail (permissions, insecure context, an
      // unfocused document) -- the index is right there on screen either
      // way, so this isn't fatal, but a silent no-op on a tap is worse
      // than saying so.
      showToast("Couldn't copy — the index is above");
    }
  }

  function openWebReg() {
    copyIndexAndOpenWebReg(indexNumber, () => {
      setCopied(true);
      haptic("tap");
    }, () => showToast("Couldn't copy — the index is above"));
  }

  return (
    <div>
      <h1 className="page-title">Register for this section</h1>
      <p className="meta">{label || (section ? section.courses.title : "Section details are loading below")}</p>
      <div className="index-bar">
        <div>
          <p className="index-number">Index {indexNumber || "—"}</p>
          {yearParam && codeParam && <p className="meta">{termLabel({ year: Number(yearParam), code: Number(codeParam) })}</p>}
        </div>
        <span className={`pill ${open === null ? "pill-unknown" : open ? "pill-open" : "pill-closed"}`}>
          {open === null ? loading ? "CHECKING" : "UNVERIFIED" : open ? "OPEN" : "CLOSED"}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        <button className="btn" style={{ minHeight: 52, fontSize: 16 }} onClick={openWebReg} disabled={!/^\d{1,6}$/.test(indexNumber)}>
          Copy index & open WebReg →
        </button>
        <button className="btn btn-secondary" onClick={copyIndex} disabled={!/^\d{1,6}$/.test(indexNumber)}>
          {copied ? "Copied!" : "Copy index only"}
        </button>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Paste the index into WebReg’s quick-add box. Sign in to Rutgers if asked.
      </p>
      {open === false && <p className="hint">Rutgers currently reports this section closed. Availability can change again.</p>}

      {loading && <div className="skeleton-row" style={{ marginTop: 12, height: 120 }} />}

      {!loading && section && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="section-row-header">
            <span className="section-title">
              {section.courses.subject_code}:{section.courses.course_number} — {section.courses.title}
            </span>
            <span className={`pill ${open === null ? "pill-unknown" : open ? "pill-open" : "pill-closed"}`}>
              {open === null ? "UNVERIFIED" : open ? "OPEN" : "CLOSED"}
            </span>
          </div>
          <p className="meta">
            Section {section.section_number}
            {creditsLabel(section.courses.credits) && ` · ${creditsLabel(section.courses.credits)}`}
          </p>
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

    </div>
  );
}
