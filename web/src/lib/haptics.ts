// Thin wrapper around the Vibration API. Android Chrome (and other Android
// browsers) buzz for real on navigator.vibrate() -- iOS Safari has never
// implemented it, even for a PWA installed to the home screen, so every call
// here is a silent no-op there. Feature-detected and try/caught so a purely
// cosmetic buzz can never throw and break the real action it's attached to
// (some browsers throw if it's called outside a direct user gesture).
const PATTERNS = {
  tap: 15, // light tick -- copying the index, dismissing something
  confirm: [20, 40, 20], // a snipe armed or disarmed
  success: [15, 60, 15, 60, 30], // a watched section just opened -- the payoff moment
} satisfies Record<string, number | number[]>;

export function haptic(kind: keyof typeof PATTERNS) {
  try {
    navigator.vibrate?.(PATTERNS[kind]);
  } catch {
    // ignore -- see comment above
  }
}
