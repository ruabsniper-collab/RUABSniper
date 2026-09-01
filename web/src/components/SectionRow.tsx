import type { SectionWithCourse } from "../types/db";
import { RatingBadge } from "./RatingBadge";
import { DAY_LABELS, formatMilitaryTime } from "../lib/time";

// A campus of "ONLINE" with no day/time is asynchronous (no live meeting) —
// see isAsyncMeeting()'s comment in lib/courses.ts for how that was verified.
function meetingLabel(m: SectionWithCourse["meeting_times"][number]): string {
  const campus = m.campus ? ` (${m.campus === "ONLINE" ? "Online" : m.campus})` : "";
  if (!m.day) return m.campus?.toUpperCase() === "ONLINE" ? "Online (async)" : "No regular meeting time";
  return `${DAY_LABELS[m.day] ?? m.day} ${formatMilitaryTime(m.start)}–${formatMilitaryTime(m.end)}${campus}`;
}

function meetingSummary(section: SectionWithCourse): string {
  if (section.meeting_times.length === 0) return "No regular meeting time";
  return section.meeting_times.map(meetingLabel).join(", ");
}

export function SectionRow({
  section,
  onClick,
  onToggleWatch,
  isWatched,
}: {
  section: SectionWithCourse;
  onClick?: () => void;
  onToggleWatch?: () => void;
  isWatched?: boolean;
}) {
  return (
    <div className="section-row" onClick={onClick} role={onClick ? "button" : undefined}>
      <div className="section-row-header">
        <span className="section-title">
          {section.courses.subject_code}:{section.courses.course_number} · sec {section.section_number}
        </span>
        <span className={`pill ${section.open ? "pill-open" : "pill-closed"}`}>
          {section.open ? "OPEN" : "CLOSED"}
        </span>
      </div>
      <p className="meta">{section.courses.title}</p>
      <p className="meta">
        Index {section.index_number} · {section.instructors.join(", ") || "Staff"}
      </p>
      <p className="meta">{meetingSummary(section)}</p>
      <div className="section-footer">
        <RatingBadge rating={section.professorRating} />
        {onToggleWatch && (
          <button
            className={`watch-btn ${isWatched ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatch();
            }}
          >
            {isWatched ? "Watching" : "Notify me"}
          </button>
        )}
      </div>
    </div>
  );
}
