import { supabase } from "./supabase";
import type { Term } from "./term";

export type CatalogOptions = { subjects: { code: string; name: string }[]; cores: { code: string; name: string }[] };
type OptionRow = { subject_code: string; subject_description: string | null; core_codes: string[] | null;
  core_details?: { coreCode?: string; coreCodeDescription?: string }[] | null;
  section_listings?: Record<string, { core_codes?: string[] }> | null };

export function buildCatalogOptions(rows: OptionRow[]): CatalogOptions {
  const subjects = new Map<string, string>(), cores = new Map<string, { code: string; name: string }>();
  for (const row of rows) {
    subjects.set(row.subject_code, row.subject_description || row.subject_code);
    for (const code of [...(row.core_codes ?? []), ...Object.values(row.section_listings ?? {}).flatMap(listing => listing.core_codes ?? [])]) {
      const name = row.core_details?.find(core => core.coreCode?.toLowerCase() === code.toLowerCase())?.coreCodeDescription;
      const key = code.toLowerCase();
      if (!cores.has(key) || name) cores.set(key, { code, name: name || cores.get(key)?.name || code });
    }
  }
  return { subjects: [...subjects].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name)),
    cores: [...cores.values()].sort((a, b) => a.code.localeCompare(b.code)) };
}

const cache = new Map<string, { expires: number; options: CatalogOptions }>();
export async function getCatalogOptions(term: Term, signal: AbortSignal): Promise<CatalogOptions> {
  const key = `${term.year}:${term.code}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.options;
  const rows: OptionRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("courses")
      .select("subject_code,subject_description,core_codes,core_details:raw->coreCodes,section_listings:raw->section_listings")
      .eq("term_year", term.year).eq("term_code", term.code).eq("campus", "NB")
      .order("id").range(offset, offset + 999).abortSignal(signal);
    if (error) throw error;
    rows.push(...((data ?? []) as OptionRow[]));
    if (!data || data.length < 1000) break;
  }
  signal.throwIfAborted();
  const options = buildCatalogOptions(rows);
  cache.set(key, { options, expires: Date.now() + 5 * 60_000 });
  return options;
}
