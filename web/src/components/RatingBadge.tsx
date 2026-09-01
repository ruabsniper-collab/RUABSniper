import type { ProfessorRmpMatch } from "../types/db";

const MIN_CONFIDENT_MATCH = 0.72; // keep in sync with src/lib/courses.ts

function ratingColor(rating: number): string {
  if (rating >= 4) return "#1a7f37";
  if (rating >= 3) return "#9a6700";
  return "#cf222e";
}

/**
 * Shows a professor's RMP rating when we have a confident match, and opens
 * their actual RMP profile on click. When the match is missing/low-confidence
 * we say so explicitly rather than guessing — see backend/lib/rmp.ts.
 */
export function RatingBadge({ rating }: { rating: ProfessorRmpMatch | null | undefined }) {
  const confident = rating && rating.confidence >= MIN_CONFIDENT_MATCH && rating.avg_rating != null;

  if (!confident) {
    return (
      <span className="badge unrated">RMP: unrated</span>
    );
  }

  const color = ratingColor(rating!.avg_rating!);

  return (
    <a
      className="badge"
      style={{ borderColor: color, color }}
      href={rating!.profile_url ?? undefined}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        if (!rating!.profile_url) e.preventDefault();
        e.stopPropagation();
      }}
    >
      <span style={{ fontWeight: 700 }}>★ {rating!.avg_rating!.toFixed(1)}</span>
      <span className="badge-sub">
        {rating!.num_ratings} rating{rating!.num_ratings === 1 ? "" : "s"}
        {rating!.match_method === "fuzzy" ? " · best guess" : ""}
      </span>
    </a>
  );
}
