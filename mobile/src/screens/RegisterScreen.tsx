import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import * as Clipboard from "expo-clipboard";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SearchStackParamList } from "../navigation/types";
import { buildFillScript } from "../lib/webregFillScript";

type Props = NativeStackScreenProps<SearchStackParamList, "Register">;

const WEBREG_URL = "https://sims.rutgers.edu/webreg/";

export function RegisterScreen({ route }: Props) {
  const { indexNumber, label } = route.params;
  const webviewRef = useRef<WebView>(null);
  const [fillStatus, setFillStatus] = useState<"pending" | "found" | "not-found">("pending");

  function tryFill() {
    webviewRef.current?.injectJavaScript(buildFillScript(indexNumber));
  }

  function onMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "fillResult") setFillStatus(msg.found ? "found" : "not-found");
    } catch {
      // ignore anything that isn't our own message
    }
  }

  async function copyIndex() {
    await Clipboard.setStringAsync(indexNumber);
  }

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          Log in with your own NetID below — your password goes straight to Rutgers, never through this app.
        </Text>
      </View>

      <View style={styles.indexBar}>
        <View>
          <Text style={styles.indexLabel}>{label}</Text>
          <Text style={styles.indexNumber}>Index {indexNumber}</Text>
        </View>
        <View style={styles.indexActions}>
          <Pressable style={styles.smallBtn} onPress={copyIndex}>
            <Text style={styles.smallBtnText}>Copy index</Text>
          </Pressable>
          <Pressable style={styles.smallBtn} onPress={tryFill}>
            <Text style={styles.smallBtnText}>Fill it in</Text>
          </Pressable>
        </View>
      </View>

      {fillStatus === "not-found" && (
        <Text style={styles.warning}>
          Couldn't find the index box automatically — tap "Copy index" above and paste it into WebReg yourself.
        </Text>
      )}

      <WebView
        ref={webviewRef}
        source={{ uri: WEBREG_URL }}
        style={styles.webview}
        onMessage={onMessage}
        onLoadEnd={() => setTimeout(tryFill, 800)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  banner: { backgroundColor: "#fff8c5", padding: 8 },
  bannerText: { fontSize: 11, color: "#57606a", textAlign: "center" },
  indexBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#d0d7de",
  },
  indexLabel: { fontSize: 12, color: "#57606a" },
  indexNumber: { fontSize: 16, fontWeight: "700" },
  indexActions: { flexDirection: "row", gap: 8 },
  smallBtn: { backgroundColor: "#0969da", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  smallBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  warning: { fontSize: 12, color: "#9a6700", padding: 8, backgroundColor: "#fff8c5" },
  webview: { flex: 1 },
});
