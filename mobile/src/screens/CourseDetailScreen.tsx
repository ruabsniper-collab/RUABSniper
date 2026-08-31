import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SearchStackParamList } from "../navigation/types";
import { getCourseSections } from "../lib/courses";
import { addWatch, listWatches, removeWatch } from "../lib/watches";
import { SectionRow } from "../components/SectionRow";
import type { SectionWithCourse } from "../types/db";

type Props = NativeStackScreenProps<SearchStackParamList, "CourseDetail">;

export function CourseDetailScreen({ route, navigation }: Props) {
  const { courseId, term } = route.params;
  const [sections, setSections] = useState<SectionWithCourse[]>([]);
  const [watchIdByIndex, setWatchIdByIndex] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [data, watches] = await Promise.all([getCourseSections(courseId), listWatches()]);
    setSections(data);
    setWatchIdByIndex(
      new Map(
        watches
          .filter((w) => w.term_year === term.year && w.term_code === term.code)
          .map((w) => [w.index_number, w.id]),
      ),
    );
    setLoading(false);
  }, [courseId, term]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function toggleWatch(section: SectionWithCourse) {
    const existingId = watchIdByIndex.get(section.index_number);
    if (existingId) await removeWatch(existingId);
    else await addWatch(term, section.index_number, section.open);
    await refresh();
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 24 }} />;

  return (
    <View style={styles.container}>
      {sections[0] && (
        <View style={styles.header}>
          <Text style={styles.courseTitle}>
            {sections[0].courses.subject_code}:{sections[0].courses.course_number} —{" "}
            {sections[0].courses.title}
          </Text>
          {sections[0].courses.core_codes.length > 0 && (
            <Text style={styles.coreCodes}>Core: {sections[0].courses.core_codes.join(", ")}</Text>
          )}
        </View>
      )}
      <FlatList
        data={sections}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <View>
            <SectionRow
              section={item}
              isWatched={watchIdByIndex.has(item.index_number)}
              onToggleWatch={() => toggleWatch(item)}
            />
            <Pressable
              style={styles.registerBtn}
              onPress={() =>
                navigation.navigate("Register", {
                  indexNumber: item.index_number,
                  label: `${item.courses.subject_code}:${item.courses.course_number} sec ${item.section_number}`,
                })
              }
            >
              <Text style={styles.registerBtnText}>Open in WebReg with index filled in →</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: "#f6f8fa" },
  header: { marginBottom: 10 },
  courseTitle: { fontSize: 16, fontWeight: "700" },
  coreCodes: { fontSize: 12, color: "#57606a", marginTop: 2 },
  registerBtn: {
    backgroundColor: "#0969da",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: -4,
    marginBottom: 12,
  },
  registerBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
});
