import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SearchStackParamList } from "../navigation/types";
import { searchCourses, LOCATION_OPTIONS } from "../lib/courses";
import { guessCurrentTerm, termLabel } from "../lib/term";
import { addWatch, listWatches, removeWatch } from "../lib/watches";
import { loadMySchedule, type ScheduleBlock } from "../lib/schedule";
import { SectionRow } from "../components/SectionRow";
import type { SectionWithCourse } from "../types/db";

type Props = NativeStackScreenProps<SearchStackParamList, "Search">;

const term = guessCurrentTerm();

export function SearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [minRating, setMinRating] = useState<number | null>(null);
  const [includeUnrated, setIncludeUnrated] = useState(true);
  const [requireRmpMatch, setRequireRmpMatch] = useState(false);
  const [sortByRating, setSortByRating] = useState(false);
  const [locations, setLocations] = useState<Set<string>>(new Set());
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [hideConflicts, setHideConflicts] = useState(false);
  const [mySchedule, setMySchedule] = useState<ScheduleBlock[]>([]);
  const [results, setResults] = useState<SectionWithCourse[]>([]);
  const [watchedIndexes, setWatchedIndexes] = useState<Set<string>>(new Set());
  const [watchIdByIndex, setWatchIdByIndex] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshWatches = useCallback(async () => {
    const watches = await listWatches();
    const relevant = watches.filter((w) => w.term_year === term.year && w.term_code === term.code);
    setWatchedIndexes(new Set(relevant.map((w) => w.index_number)));
    setWatchIdByIndex(new Map(relevant.map((w) => [w.index_number, w.id])));
  }, []);

  useEffect(() => {
    loadMySchedule().then(setMySchedule);
    refreshWatches();
  }, [refreshWatches]);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await searchCourses({
        term,
        query,
        minRating: minRating ?? undefined,
        includeUnratedWhenFiltering: includeUnrated,
        requireRmpMatch,
        sortByRating,
        locations: locations.size > 0 ? [...locations] : undefined,
        hideScheduleConflicts: hideConflicts,
        mySchedule,
      });
      setResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [query, minRating, includeUnrated, requireRmpMatch, sortByRating, locations, hideConflicts, mySchedule]);

  useEffect(() => {
    const handle = setTimeout(runSearch, 350); // debounce
    return () => clearTimeout(handle);
  }, [runSearch]);

  function toggleLocation(value: string) {
    setLocations((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function toggleWatch(section: SectionWithCourse) {
    const existingId = watchIdByIndex.get(section.index_number);
    if (existingId) {
      await removeWatch(existingId);
    } else {
      await addWatch(term, section.index_number, section.open);
    }
    await refreshWatches();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.termLabel}>{termLabel(term)}</Text>
      <TextInput
        style={styles.input}
        placeholder="Search by name, subject, course #, or core code (e.g. WCr)"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Min RMP rating</Text>
        <View style={styles.ratingChips}>
          {[null, 3, 3.5, 4, 4.5].map((r) => (
            <Text
              key={String(r)}
              onPress={() => setMinRating(r)}
              style={[styles.chip, minRating === r && styles.chipActive]}
            >
              {r == null ? "Any" : `${r}+`}
            </Text>
          ))}
        </View>
      </View>

      {minRating != null && (
        <View style={styles.switchRow}>
          <Text style={styles.filterLabel}>Include instructors with no RMP match</Text>
          <Switch value={includeUnrated} onValueChange={setIncludeUnrated} />
        </View>
      )}

      <View style={styles.switchRow}>
        <Text style={styles.filterLabel}>Hide conflicts with My Schedule ({mySchedule.length} blocks)</Text>
        <Switch value={hideConflicts} onValueChange={setHideConflicts} />
      </View>

      <Text style={styles.moreFiltersToggle} onPress={() => setShowMoreFilters((v) => !v)}>
        {showMoreFilters ? "▾ Fewer filters" : "▸ More filters (sort, location, online/async)"}
      </Text>

      {showMoreFilters && (
        <>
          <View style={styles.switchRow}>
            <Text style={styles.filterLabel}>Only show professors with an RMP profile</Text>
            <Switch value={requireRmpMatch} onValueChange={setRequireRmpMatch} />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.filterLabel}>Sort by highest-rated professor first</Text>
            <Switch value={sortByRating} onValueChange={setSortByRating} />
          </View>

          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Campus / online</Text>
            <View style={styles.ratingChips}>
              {LOCATION_OPTIONS.map((opt) => (
                <Text
                  key={opt.value}
                  onPress={() => toggleLocation(opt.value)}
                  style={[styles.chip, locations.has(opt.value) && styles.chipActive]}
                >
                  {opt.label}
                </Text>
              ))}
            </View>
          </View>
        </>
      )}

      {loading && <ActivityIndicator style={{ marginTop: 12 }} />}
      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        style={{ marginTop: 8 }}
        data={results}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <SectionRow
            section={item}
            isWatched={watchedIndexes.has(item.index_number)}
            onToggleWatch={() => toggleWatch(item)}
            onPress={() =>
              navigation.navigate("CourseDetail", { courseId: item.course_id, term })
            }
          />
        )}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No sections match yet — try a different search.</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: "#f6f8fa" },
  termLabel: { fontSize: 12, color: "#57606a", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#d0d7de",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  filterRow: { marginTop: 10 },
  filterLabel: { fontSize: 12, color: "#24292f", fontWeight: "600" },
  ratingChips: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  chip: {
    borderWidth: 1,
    borderColor: "#d0d7de",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    overflow: "hidden",
  },
  chipActive: { backgroundColor: "#0969da", color: "#fff", borderColor: "#0969da" },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  moreFiltersToggle: { fontSize: 12, color: "#0969da", fontWeight: "600", marginTop: 12 },
  error: { color: "#cf222e", marginTop: 8 },
  empty: { textAlign: "center", color: "#57606a", marginTop: 24 },
});
