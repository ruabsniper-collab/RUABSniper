import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { addScheduleBlock } from "../lib/schedule";
import { runScheduleOcr, parseScheduleText, type ScheduleBlockDraft } from "../lib/scheduleOcr";
import { DAY_LABELS, formatMilitaryTime, parseTimeToMilitary } from "../lib/time";

const DAYS = ["M", "T", "W", "H", "F", "S", "U"];

type DraftRow = {
  label: string;
  day: string;
  startText: string;
  endText: string;
  included: boolean;
  sourceLine: string;
};

function toDraftRow(d: ScheduleBlockDraft): DraftRow {
  return {
    label: d.label,
    day: d.day,
    startText: d.start ? formatMilitaryTime(d.start) : "",
    endText: d.end ? formatMilitaryTime(d.end) : "",
    included: true,
    sourceLine: d.sourceLine,
  };
}

/**
 * "Import from screenshot": pick a photo, OCR it (see lib/scheduleOcr.ts),
 * then show every guessed class as an editable row so nothing gets added
 * to My Schedule without the user looking at it first.
 */
export function ScreenshotImport({ onImported }: { onImported: () => void }) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [skippedMsg, setSkippedMsg] = useState<string | null>(null);

  async function pickAndScan() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo library access is needed to pick a screenshot.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.6,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setImageUri(asset.uri);
    setStatus("scanning");
    setError(null);
    setSkippedMsg(null);
    setDrafts([]);
    setRawText("");

    try {
      if (!asset.base64) throw new Error("Couldn't read that image.");
      const text = await runScheduleOcr(asset.base64);
      setRawText(text);
      setDrafts(parseScheduleText(text).map(toDraftRow));
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
      setStatus("error");
    }
  }

  function updateDraft(index: number, patch: Partial<DraftRow>) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function removeDraft(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  async function commitSelected() {
    const included = drafts.filter((d) => d.included);
    let added = 0;
    let skipped = 0;
    for (const d of included) {
      const start = parseTimeToMilitary(d.startText);
      const end = parseTimeToMilitary(d.endText);
      if (!start || !end || !d.label.trim()) {
        skipped += 1;
        continue;
      }
      await addScheduleBlock({ label: d.label.trim(), day: d.day, start, end });
      added += 1;
    }
    setSkippedMsg(
      skipped > 0
        ? `Added ${added}, skipped ${skipped} (couldn't read a time like "3:50 PM" — fix and retry, or add manually).`
        : null,
    );
    if (added > 0) onImported();
    setDrafts((prev) => prev.filter((d) => !d.included)); // keep unselected/failed rows to retry
  }

  const includedCount = drafts.filter((d) => d.included).length;

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Pick a screenshot of your schedule — WebReg, Schedule Planner, a calendar app, even a photo of a
        printout. Text recognition is best-effort, so review every row below before adding anything.
      </Text>

      <Pressable style={styles.pickBtn} onPress={pickAndScan}>
        <Text style={styles.pickBtnText}>{imageUri ? "Choose a different screenshot" : "Choose screenshot"}</Text>
      </Pressable>

      {imageUri && <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />}

      {status === "scanning" && (
        <View style={styles.scanningRow}>
          <ActivityIndicator />
          <Text style={styles.scanningText}>Reading text off the image…</Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      {skippedMsg && <Text style={styles.warning}>{skippedMsg}</Text>}

      {status === "done" && drafts.length === 0 && !error && (
        <View>
          <Text style={styles.warning}>
            Couldn't find any "day + time" patterns in that image. Raw text it read is below — use Manual
            entry if this isn't useful.
          </Text>
          {rawText ? (
            <ScrollView style={styles.rawTextBox}>
              <Text style={styles.rawText}>{rawText}</Text>
            </ScrollView>
          ) : null}
        </View>
      )}

      {drafts.map((d, i) => (
        <View key={i} style={styles.draftRow}>
          <View style={styles.draftHeader}>
            <Pressable onPress={() => updateDraft(i, { included: !d.included })} style={styles.checkbox}>
              <Text style={styles.checkboxText}>{d.included ? "☑" : "☐"}</Text>
            </Pressable>
            <TextInput
              style={styles.draftLabelInput}
              value={d.label}
              onChangeText={(v) => updateDraft(i, { label: v })}
            />
            <Pressable onPress={() => removeDraft(i)} style={styles.removeBtn}>
              <Text style={styles.removeBtnText}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.sourceLine} numberOfLines={1}>
            from: "{d.sourceLine}"
          </Text>
          <View style={styles.dayRow}>
            {DAYS.map((day) => (
              <Text
                key={day}
                onPress={() => updateDraft(i, { day })}
                style={[styles.dayChip, d.day === day && styles.dayChipActive]}
              >
                {DAY_LABELS[day]}
              </Text>
            ))}
          </View>
          <View style={styles.timeRow}>
            <TextInput
              style={[styles.input, styles.timeInput]}
              placeholder="Start, e.g. 3:50 PM"
              value={d.startText}
              onChangeText={(v) => updateDraft(i, { startText: v })}
            />
            <TextInput
              style={[styles.input, styles.timeInput]}
              placeholder="End, e.g. 5:10 PM"
              value={d.endText}
              onChangeText={(v) => updateDraft(i, { endText: v })}
            />
          </View>
        </View>
      ))}

      {drafts.length > 0 && (
        <Pressable style={styles.commitBtn} onPress={commitSelected} disabled={includedCount === 0}>
          <Text style={styles.commitBtnText}>
            Add {includedCount} class{includedCount === 1 ? "" : "es"} to my schedule
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  hint: { fontSize: 12, color: "#57606a" },
  pickBtn: { backgroundColor: "#0969da", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  pickBtnText: { color: "#fff", fontWeight: "600" },
  preview: { width: "100%", height: 160, borderRadius: 8, backgroundColor: "#eaeef2" },
  scanningRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  scanningText: { fontSize: 12, color: "#57606a" },
  error: { color: "#cf222e", fontSize: 12 },
  warning: { fontSize: 12, color: "#9a6700", backgroundColor: "#fff8c5", padding: 8, borderRadius: 6 },
  rawTextBox: { maxHeight: 120, backgroundColor: "#f6f8fa", borderRadius: 6, padding: 8 },
  rawText: { fontSize: 11, color: "#57606a", fontFamily: "monospace" },
  draftRow: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d0d7de",
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  draftHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: { padding: 4 },
  checkboxText: { fontSize: 16 },
  draftLabelInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d0d7de",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontWeight: "600",
  },
  removeBtn: { padding: 4 },
  removeBtnText: { color: "#cf222e", fontSize: 14 },
  sourceLine: { fontSize: 10, color: "#8c959f", fontStyle: "italic" },
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
  input: {
    borderWidth: 1,
    borderColor: "#d0d7de",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  timeInput: { flex: 1 },
  commitBtn: { backgroundColor: "#1a7f37", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  commitBtnText: { color: "#fff", fontWeight: "600" },
});
