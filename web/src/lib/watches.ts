import { supabase } from "./supabase";
import { getDeviceId } from "./deviceId";
import type { Term } from "./term";
import type { Watch } from "../types/db";

export async function listWatches(): Promise<Watch[]> {
  const deviceId = getDeviceId();
  const { data, error } = await supabase
    .from("watches")
    .select("*")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Watch[];
}

export async function addWatch(term: Term, indexNumber: string, currentlyOpen: boolean): Promise<void> {
  const deviceId = getDeviceId();
  const { error } = await supabase.from("watches").upsert(
    {
      device_id: deviceId,
      term_year: term.year,
      term_code: term.code,
      index_number: indexNumber,
      last_status: currentlyOpen,
      // If it's already open when you add the watch, don't fire an
      // immediate "it opened!" push — only notify on the next real flip.
      notified_at: currentlyOpen ? new Date().toISOString() : null,
    },
    { onConflict: "device_id,term_year,term_code,index_number" },
  );
  if (error) throw error;
}

export async function removeWatch(watchId: string): Promise<void> {
  const { error } = await supabase.from("watches").delete().eq("id", watchId);
  if (error) throw error;
}
