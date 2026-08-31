import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { registerForPushNotificationsAsync } from "../lib/notifications";

export function SettingsScreen() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function enableNotifications() {
    setStatus("loading");
    const result = await registerForPushNotificationsAsync();
    if (result.ok) {
      setStatus("ok");
      setMessage("Notifications are on. You'll get a push the moment a watched section opens.");
    } else {
      setStatus("error");
      setMessage(result.reason ?? "Something went wrong.");
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Seat-open notifications</Text>
        <Text style={styles.cardBody}>
          Enable push notifications so you hear about an opening the moment our background check (every ~5
          minutes) sees it.
        </Text>
        <Pressable style={styles.btn} onPress={enableNotifications} disabled={status === "loading"}>
          {status === "loading" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Enable notifications</Text>
          )}
        </Pressable>
        {message && (
          <Text style={[styles.message, status === "error" && styles.messageError]}>{message}</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What this app stores</Text>
        <Text style={styles.cardBody}>
          No Rutgers account, no NetID, no password — ever. A random id for this install is used only to
          remember what you're watching and where to send a notification. Your "My Schedule" list stays on
          this device only.
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
  btn: { backgroundColor: "#0969da", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  message: { fontSize: 12, color: "#1a7f37" },
  messageError: { color: "#cf222e" },
});
