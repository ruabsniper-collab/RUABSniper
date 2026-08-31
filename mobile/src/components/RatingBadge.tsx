import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { ProfessorRmpMatch } from "../types/db";

const MIN_CONFIDENT_MATCH = 0.72; // keep in sync with mobile/src/lib/courses.ts

function ratingColor(rating: number): string {
  if (rating >= 4) return "#1a7f37";
  if (rating >= 3) return "#9a6700";
  return "#cf222e";
}

/**
 * Shows a professor's RMP rating when we have a confident match, and opens
 * their actual RMP profile on tap. When the match is missing/low-confidence
 * we say so explicitly rather than guessing — see backend/lib/rmp.ts.
 */
export function RatingBadge({ rating }: { rating: ProfessorRmpMatch | null | undefined }) {
  const confident = rating && rating.confidence >= MIN_CONFIDENT_MATCH && rating.avg_rating != null;

  if (!confident) {
    return (
      <View style={[styles.badge, styles.unrated]}>
        <Text style={styles.unratedText}>RMP: unrated</Text>
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.badge, { borderColor: ratingColor(rating!.avg_rating!) }]}
      onPress={() => rating!.profile_url && Linking.openURL(rating!.profile_url)}
    >
      <Text style={[styles.ratingText, { color: ratingColor(rating!.avg_rating!) }]}>
        ★ {rating!.avg_rating!.toFixed(1)}
      </Text>
      <Text style={styles.ratingSub}>
        {rating!.num_ratings} rating{rating!.num_ratings === 1 ? "" : "s"}
        {rating!.match_method === "fuzzy" ? " · best guess" : ""}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  ratingText: { fontWeight: "700", fontSize: 13 },
  ratingSub: { fontSize: 11, color: "#57606a" },
  unrated: { borderColor: "#d0d7de", backgroundColor: "#f6f8fa" },
  unratedText: { fontSize: 12, color: "#57606a" },
});
