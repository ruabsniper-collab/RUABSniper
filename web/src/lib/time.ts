/** Minutes since midnight from a 24h "HHMM" string (SOC's `*Military` fields). Null-safe. */
export function militaryToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm || hhmm.length < 3) return null;
  const n = Number(hhmm);
  if (Number.isNaN(n)) return null;
  const hours = Math.floor(n / 100);
  const minutes = n % 100;
  return hours * 60 + minutes;
}

/** "1550" -> "3:50 PM" */
export function formatMilitaryTime(hhmm: string | null | undefined): string {
  const mins = militaryToMinutes(hhmm);
  if (mins == null) return "";
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** "3:50 PM" / "3:50pm" / "15:50" -> "1550" (24h military). Returns null if unparseable. */
export function parseTimeToMilitary(input: string): string | null {
  const trimmed = input.trim();

  const twelveHour = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (twelveHour) {
    let hours = Number(twelveHour[1]);
    const minutes = Number(twelveHour[2]);
    const period = twelveHour[3].toLowerCase();
    if (hours < 1 || hours > 12 || minutes > 59) return null;
    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
  }

  const twentyFourHour = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHour) {
    const hours = Number(twentyFourHour[1]);
    const minutes = Number(twentyFourHour[2]);
    if (hours > 23 || minutes > 59) return null;
    return `${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
  }

  return null;
}

export const DAY_LABELS: Record<string, string> = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  H: "Thu",
  F: "Fri",
  S: "Sat",
  U: "Sun",
};
