import { StyleSheet, Text, View } from "react-native";

export function SettingsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Seat-open notifications</Text>
        <Text style={styles.cardBody}>
          Real push notifications require Apple's paid Developer Program, so instead the backend emails you
          the moment a watched section opens (checked every ~5 minutes). Your phone's Mail app still gives
          you an instant lock-screen alert — just ask whoever set this up which address it's going to.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What this app stores</Text>
        <Text style={styles.cardBody}>
          No Rutgers account, no NetID, no password — ever. A random id for this install is used only to
          remember what you're watching. Your "My Schedule" list stays on this device only.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: "#f6f8fa", gap: 12 },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d0d7de",
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  cardTitle: { fontWeight: "700", fontSize: 14 },
  cardBody: { fontSize: 12, color: "#57606a", lineHeight: 17 },
});
