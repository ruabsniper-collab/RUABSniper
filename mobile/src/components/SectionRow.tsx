import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SectionWithCourse } from "../types/db";
import { RatingBadge } from "./RatingBadge";
import { DAY_LABELS, formatMilitaryTime } from "../lib/time";

function meetingSummary(section: SectionWithCourse): string {
  const parts = section.meeting_times
    .filter((m) => m.day)
    .map((m) => `${DAY_LABELS[m.day!] ?? m.day} ${formatMilitaryTime(m.start)}–${formatMilitaryTime(m.end)}`);
  return parts.length > 0 ? parts.join(", ") : "No regular meeting time";
}

export function SectionRow({
  section,
  onPress,
  onToggleWatch,
  isWatched,
}: {
  section: SectionWithCourse;
  onPress?: () => void;
  onToggleWatch?: () => void;
  isWatched?: boolean;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {section.courses.subject_code}:{section.courses.course_number} · sec {section.section_number}
        </Text>
        <View style={[styles.pill, section.open ? styles.pillOpen : styles.pillClosed]}>
          <Text style={styles.pillText}>{section.open ? "OPEN" : "CLOSED"}</Text>
        </View>
      </View>
      <Text style={styles.courseTitle}>{section.courses.title}</Text>
      <Text style={styles.meta}>
        Index {section.index_number} · {section.instructors.join(", ") || "Staff"}
      </Text>
      <Text style={styles.meta}>{meetingSummary(section)}</Text>
      <View style={styles.footer}>
        <RatingBadge rating={section.professorRating} />
        {onToggleWatch && (
          <Pressable style={[styles.watchBtn, isWatched && styles.watchBtnActive]} onPress={onToggleWatch}>
            <Text style={[styles.watchBtnText, isWatched && styles.watchBtnTextActive]}>
              {isWatched ? "Watching" : "Notify me"}
            </Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderColor: "#d0d7de",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fff",
    gap: 4,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontWeight: "700", fontSize: 14 },
  courseTitle: { fontSize: 13, color: "#24292f" },
  meta: { fontSize: 12, color: "#57606a" },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillOpen: { backgroundColor: "#dafbe1" },
  pillClosed: { backgroundColor: "#ffebe9" },
  pillText: { fontSize: 10, fontWeight: "700" },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  watchBtn: { borderWidth: 1, borderColor: "#d0d7de", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  watchBtnActive: { backgroundColor: "#0969da", borderColor: "#0969da" },
  watchBtnText: { fontSize: 12, fontWeight: "600", color: "#24292f" },
  watchBtnTextActive: { color: "#fff" },
});
