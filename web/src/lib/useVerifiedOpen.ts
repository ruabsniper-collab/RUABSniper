import { useEffect, useState } from "react";
import type { SectionWithCourse } from "../types/db";

export function useVerifiedOpen(section: SectionWithCourse | null): boolean | null {
  const [, update] = useState(0);
  const expiresAt = section?.availabilityCheckedAt ? Date.parse(section.availabilityCheckedAt) + 45_000 : 0;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(() => update((value) => value + 1), Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);
  return expiresAt > Date.now() ? section?.open ?? null : null;
}
