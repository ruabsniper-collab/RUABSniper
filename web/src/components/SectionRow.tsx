import { useNavigate } from "react-router-dom";
import type { SectionWithCourse } from "../types/db";
import { RatingBadge } from "./RatingBadge";
import { ClockIcon, PersonIcon } from "./icons";
import { DAY_LABELS, formatMilitaryTime } from "../lib/time";
import { haptic } from "../lib/haptics";

// A campus of "ONLINE" with no day/time is asynchronous (no live meeting) —
// see isAsyncMeeting()'s comment in lib/courses.ts for how that was verified.
function meetingLabel(m: SectionWithCourse["meeting_times"][number]): string {
  const campus = m.campus ? ` (${m.campus === "ONLINE" ? "Online" : m.campus})` : "";
  if (!m.day) return m.campus?.toUpperCase() === "ONLINE" ? "Online (async)" : "No regular meeting time";
  return `${DAY_LABELS[m.day] ?? m.day} ${formatMilitaryTime(m.start)}–${formatMilitaryTime(m.end)}${campus}`;
}

// Exported for RegisterPage, which shows the same meeting-time summary on
// the page reached from tapping a notification or "Open WebReg" -- someone
// shouldn't have to remember what a bare index number means once they're
// staring at the quick-add box.
export function meetingSummary(section: SectionWithCourse): string {
  if (section.meeting_times.length === 0) return "No regular meeting time";
  return section.meeting_times.map(meetingLabel).join(", ");
}

// Credits were already ingested onto Course (see types/db.ts) and used
// internally by scheduleOcr.ts to recognize where a course-code block ends
// in a screenshot, but never actually shown anywhere. Rutgers has
// fractional/variable-credit courses (1.5, 0.5, etc.), so this keeps
// whatever precision the catalog gives rather than rounding. Exported for
// the same reason meetingSummary is -- RegisterPage and CourseDetailPage
// show the same course info and shouldn't format it differently.
export function creditsLabel(credits: number | null): string | null {
  if (credits == null) return null;
  return `${credits} credit${credits === 1 ? "" : "s"}`;
}

export function SectionRow({
  section,
  onClick,
  onToggleWatch,
  isWatched,
  justOpened,
}: {
  section: SectionWithCourse;
  onClick?: () => void;
  onToggleWatch?: () => void;
  isWatched?: boolean;
  // True for one render right after this section flips closed -> open on
  // Watches -- plays a highlight animation for the moment the app exists
  // for. See WatchesPage.tsx's refresh().
  justOpened?: boolean;
}) {
  const navigate = useNavigate();

  async function openWebReg(e: React.MouseEvent) {
    e.stopPropagation();
    const label = `${section.courses.subject_code}:${section.courses.course_number} sec ${section.section_number}`;
    // The button says "with index copied" -- actually copy it, right here,
    // before navigating, instead of just linking to a page where you still
    // have to tap "Copy index" yourself. Best-effort: a clipboard failure
    // (permissions, unfocused document) shouldn't block getting to
    // Register at all, it just means the copied=1 flag below is skipped so
    // RegisterPage's own "Copy index" button is still there to try again.
    let copied = false;
    try {
      await navigator.clipboard.writeText(section.index_number);
      copied = true;
      haptic("tap");
    } catch {
      // fall through -- RegisterPage's own Copy index button is the retry
    }
    // year/code let RegisterPage fetch this exact section instead of
    // guessing "whichever term has this index number most recently" --
    // see getSectionByIndex's comment for why that guess is a real risk
    // once more than one term is active at once, which is now normal.
    navigate(
      `/register?index=${section.index_number}&label=${encodeURIComponent(label)}&year=${section.term_year}&code=${section.term_code}${copied ? "&copied=1" : ""}`,
    );
  }

  return (
    <div
      className={`section-row ${section.open ? "section-row-open" : ""} ${justOpened ? "just-opened" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="section-row-header">
        <span className="section-title">
          {section.courses.subject_code}:{section.courses.course_number} · sec {section.section_number}
        </span>
        <span className={`pill ${section.open ? "pill-open" : "pill-closed"}`}>
          {section.open ? "OPEN" : "CLOSED"}
        </span>
      </div>
      {/* Course title reads at a step up from the metadata below it (index,
          instructor, time) -- it's the one line that actually says what
          this is, the rest is filtering detail once you already know that. */}
      <p className="meta-primary">
        {section.courses.title}
        {creditsLabel(section.courses.credits) && ` · ${creditsLabel(section.courses.credits)}`}
      </p>
      <p className="meta">Index {section.index_number}</p>
      {section.instructors.length === 0 ? (
        <div className="card-row" style={{ gap: 6, marginTop: 2 }}>
          <span className="meta-icon">
            <PersonIcon />
          </span>
          <span className="meta" style={{ flex: 1 }}>
            Staff
          </span>
        </div>
      ) : (
        section.instructors.map((name, i) => (
          <div key={i} className="card-row" style={{ gap: 6, marginTop: 2 }}>
            <span className="meta-icon">
              <PersonIcon />
            </span>
            <span className="meta" style={{ flex: 1 }}>
              {name}
            </span>
            {/* Falls back to the section's single "best" rating only if a
                caller somehow didn't attach the per-instructor array (every
                current one does) -- keeps a lone-instructor section showing
                something rather than an unrated badge for stale/missed data. */}
            <RatingBadge rating={section.professorRatings?.[i] ?? (section.instructors.length === 1 ? section.professorRating : null)} />
          </div>
        ))
      )}
      <div className="card-row" style={{ gap: 6, marginTop: 2 }}>
        <span className="meta-icon">
          <ClockIcon />
        </span>
        <p className="meta" style={{ margin: 0 }}>
          {meetingSummary(section)}
        </p>
      </div>
      <div className="section-footer">
        {onToggleWatch && (
          <button
            className={`watch-btn ${isWatched ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatch();
            }}
          >
            {isWatched ? "Sniped" : "Notify me"}
          </button>
        )}
      </div>
      {/* Only when actually open — a WebReg shortcut for a closed section
          isn't useful, there's nothing to register for yet. Right on the
          row (Search, Course Detail, Snipes all render this component) so
          it's one tap the moment it matters, not a click-into-the-course
          away. */}
      {section.open && (
        <button className="btn" style={{ marginTop: 4 }} onClick={openWebReg}>
          Open WebReg with index copied →
        </button>
      )}
    </div>
  );
}
