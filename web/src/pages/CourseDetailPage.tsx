import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getCourseSections } from "../lib/courses";
import { addWatch, listWatches, removeWatch } from "../lib/watches";
import { maybePromptAfterAddingWatch } from "../lib/push";
import { SectionRow } from "../components/SectionRow";
import { haptic } from "../lib/haptics";
import { showToast } from "../lib/toast";
import type { SectionWithCourse } from "../types/db";
import type { Term } from "../lib/term";

function sectionLabel(section: SectionWithCourse): string {
  return `${section.courses.subject_code}:${section.courses.course_number} sec ${section.section_number}`;
}

export function CourseDetailPage() {
  const { courseId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const term: Term = { year: Number(searchParams.get("year")), code: Number(searchParams.get("code")) };

  const [sections, setSections] = useState<SectionWithCourse[]>([]);
  const [watchIdByIndex, setWatchIdByIndex] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, watches] = await Promise.all([getCourseSections(courseId), listWatches()]);
      setSections(data);
      setWatchIdByIndex(
        new Map(
          watches
            .filter((w) => w.term_year === term.year && w.term_code === term.code)
            .map((w) => [w.index_number, w.id]),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load this course");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, term.year, term.code]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function toggleWatch(section: SectionWithCourse) {
    const existingId = watchIdByIndex.get(section.index_number);
    if (existingId) {
      await removeWatch(existingId);
      haptic("tap");
      showToast(`Stopped sniping ${sectionLabel(section)}`);
    } else {
      const hadNoWatchesBefore = (await listWatches()).length === 0;
      await addWatch(term, section.index_number, section.open);
      haptic("confirm");
      showToast(`🎯 Sniping ${sectionLabel(section)}`, "success");
      await maybePromptAfterAddingWatch(hadNoWatchesBefore);
    }
    await refresh();
  }

  if (loading) return <p className="hint">Loading…</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div>
      {sections[0] && (
        <div style={{ marginBottom: 10 }}>
          <h2>
            {sections[0].courses.subject_code}:{sections[0].courses.course_number} —{" "}
            {sections[0].courses.title}
          </h2>
          {sections[0].courses.core_codes.length > 0 && (
            <p className="meta">Core: {sections[0].courses.core_codes.join(", ")}</p>
          )}
        </div>
      )}
      {sections.map((item) => (
        <SectionRow
          key={item.id}
          section={item}
          isWatched={watchIdByIndex.has(item.index_number)}
          onToggleWatch={() => toggleWatch(item)}
        />
      ))}
    </div>
  );
}
