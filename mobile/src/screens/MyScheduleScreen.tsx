import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  addScheduleBlock,
  loadMySchedule,
  removeScheduleBlock,
  type ScheduleBlock,
} from "../lib/schedule";
import { DAY_LABELS, parseTimeToMilitary } from "../lib/time";

const DAYS = ["M", "T", "W", "H", "F"];

export function MyScheduleScreen() {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [label, setLabel] = useState("");
  const [day, setDay] = useState("M");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMySchedule().then(setBlocks);
  }, []);

  async function submit() {
    const startMilitary = parseTimeToMilitary(start);
    const endMilitary = parseTimeToMilitary(end);
    if (!label.trim()) return setError("Give it a name, e.g. \"CS 111\".");
    if (!startMilitary || !endMilitary) return setError('Use a time like "3:50 PM" or "15:50" for both fields.');
    setError(null);
    const next = await addScheduleBlock({ label: label.trim(), day, start: startMilitary, end: endMilitary });
    setBlocks(next);
    setLabel("");
    setStart("");
    setEnd("");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Add the classes you're already registered for so Search can hide anything that overlaps.
      </Text>

      <FlatList
        data={blocks}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{item.label}</Text>
              <Text style={styles.rowMeta}>
                {DAY_LABELS[item.day]} {item.start} – {item.end}
              </Text>
            </View>
            <Pressable
              onPress={async () => setBlocks(await removeScheduleBlock(item.id))}
              style={styles.removeBtn}
            >
              <Text style={styles.removeBtnText}>Remove</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No existing classes added yet.</Text>}
      />

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Course name (e.g. CS 111)"
          value={label}
          onChangeText={setLabel}
        />
        <View style={styles.dayRow}>
          {DAYS.map((d) => (
            <Text
              key={d}
              onPress={() => setDay(d)}
              style={[styles.dayChip, day === d && styles.dayChipActive]}
            >
              {DAY_LABELS[d]}
            </Text>
          ))}
        </View>
        <View style={styles.timeRow}>
          <TextInput
            style={[styles.input, styles.timeInput]}
            placeholder="Start, e.g. 3:50 PM"
            value={start}
            onChangeText={setStart}
          />
          <TextInput
            style={[styles.input, styles.timeInput]}
            placeholder="End, e.g. 5:10 PM"
            value={end}
            onChangeText={setEnd}
          />
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.addBtn} onPress={submit}>
          <Text style={styles.addBtnText}>Add to my schedule</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: "#f6f8fa" },
  hint: { fontSize: 12, color: "#57606a", marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d0d7de",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  rowLabel: { fontWeight: "700", fontSize: 14 },
  rowMeta: { fontSize: 12, color: "#57606a" },
  removeBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  removeBtnText: { color: "#cf222e", fontSize: 12, fontWeight: "600" },
  empty: { textAlign: "center", color: "#57606a", marginVertical: 12 },
  form: {
    borderTopWidth: 1,
    borderTopColor: "#d0d7de",
    paddingTop: 10,
    marginTop: 6,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d0d7de",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  dayRow: { flexDirection: "row", gap: 6 },
  dayChip: {
    borderWidth: 1,
    borderColor: "#d0d7de",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    overflow: "hidden",
  },
  dayChipActive: { backgroundColor: "#0969da", color: "#fff", borderColor: "#0969da" },
  timeRow: { flexDirection: "row", gap: 8 },
  timeInput: { flex: 1 },
  error: { color: "#cf222e", fontSize: 12 },
  addBtn: { backgroundColor: "#1a7f37", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  addBtnText: { color: "#fff", fontWeight: "600" },
});
