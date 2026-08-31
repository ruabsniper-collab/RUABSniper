import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { listWatches, removeWatch } from "../lib/watches";
import { termLabel } from "../lib/term";
import type { Watch } from "../types/db";

export function WatchesScreen() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setWatches(await listWatches());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <View style={styles.container}>
      <FlatList
        data={watches}
        keyExtractor={(w) => w.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.term}>{termLabel({ year: item.term_year, code: item.term_code })}</Text>
              <Text style={styles.index}>Index {item.index_number}</Text>
              <Text style={styles.status}>
                {item.last_status ? "Currently open" : "Currently closed — watching for an opening"}
              </Text>
            </View>
            <Pressable
              style={styles.removeBtn}
              onPress={async () => {
                await removeWatch(item.id);
                refresh();
              }}
            >
              <Text style={styles.removeBtnText}>Stop watching</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nothing watched yet. Find a closed section in Search and tap "Notify me" to get a push the moment a
            seat opens.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: "#f6f8fa" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d0d7de",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  term: { fontSize: 11, color: "#57606a" },
  index: { fontSize: 15, fontWeight: "700" },
  status: { fontSize: 12, color: "#24292f", marginTop: 2 },
  removeBtn: { borderWidth: 1, borderColor: "#cf222e", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  removeBtnText: { color: "#cf222e", fontSize: 12, fontWeight: "600" },
  empty: { textAlign: "center", color: "#57606a", marginTop: 24, paddingHorizontal: 16 },
});
