// The 1-minute poller — a Vercel serverless function instead of a GitHub
// Actions script, triggered by an external free cron-ping service (e.g.
// cron-job.org) hitting this URL every minute. GitHub Actions' own
// scheduler was the actual bottleneck, not our code: verified live, its
// */5 * * * * cron was really landing 9-21 minutes apart under GitHub's
// free-tier runner queue, and Cloudflare Workers' free 10ms-CPU-per-request
// cap is too tight for this workload (SOC fetch + parse, several Supabase
// round-trips, VAPID/push encryption). A Vercel serverless function has no
// such queue -- it runs immediately when hit over HTTP -- so moving the
// trigger to an external per-minute pinger is the actual fix.
//
// Deliberately self-contained rather than importing from backend/ — this
// deploys as part of the `web` Vercel project, a separate deployable from
// backend/, so the handful of things it needs (Term helpers, SOC's
// openSections endpoint, sending one push) are duplicated here rather than
// reaching across a project boundary Vercel doesn't build.
//
// One-time setup (see README): add SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, and POLL_SECRET as
// *plain* (non-VITE_-prefixed) environment variables on the Vercel project
// — those never reach the client bundle, only this server-side function.
// Then point a free per-minute cron-ping service at
// https://<your-domain>/api/poll?secret=<POLL_SECRET>.

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Minimal local stand-ins for @vercel/node's request/response types --
// pulling in the real package for two type names isn't worth it: its
// current version drags in transitive deps (ajv, path-to-regexp, undici)
// with several known advisories, none of which actually run in production
// since this is a type-only import anyway (Vercel's platform provides the
// real runtime regardless of what we depend on here).
type VercelRequest = { query: Record<string, string | string[] | undefined> };
type VercelResponse = { status: (code: number) => { json: (body: unknown) => void } };

const REQUEST_TIMEOUT_MS = 20_000;
const SOC_BASE = "https://sis.rutgers.edu/soc/api";
const TERM_CODES = { WINTER: 0, SPRING: 1, SUMMER: 7, FALL: 9 } as const;

type Term = { year: number; code: number };
function termKey(t: Term): string {
  return `${t.year}-${t.code}`;
}
function termLabel(t: Term): string {
  const name =
    t.code === TERM_CODES.SPRING ? "Spring" : t.code === TERM_CODES.SUMMER ? "Summer" : t.code === TERM_CODES.FALL ? "Fall" : "Winter";
  return `${name} ${t.year}`;
}

/** Mirrors backend/lib/soc.ts's fetchOpenIndexes — the lightweight "just the open ones" endpoint. */
async function fetchOpenIndexes(term: Term, campus = "NB"): Promise<Set<string>> {
  const url = `${SOC_BASE}/openSections.json?year=${term.year}&term=${term.code}&campus=${campus}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "ruabsniper/0.1 (personal course tracker)" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`SOC openSections.json ${res.status} ${res.statusText} (${url})`);
  const data = (await res.json()) as unknown;
  const arr = Array.isArray(data) ? data : [];
  return new Set(arr.map((v) => String(v)));
}

type WatchRow = {
  id: string;
  device_id: string;
  term_year: number;
  term_code: number;
  index_number: string;
  last_status: boolean;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.POLL_SECRET;
  if (!secret || req.query.secret !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
    return;
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  const pushConfigured = Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject);
  if (pushConfigured) webpush.setVapidDetails(vapidSubject!, vapidPublicKey!, vapidPrivateKey!);

  async function sendPushToDevice(deviceId: string, payload: { title: string; body: string; url: string }) {
    if (!pushConfigured) {
      console.warn("[poll] VAPID_* not set — skipping push send");
      return;
    }
    const { data, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("device_id", deviceId)
      .maybeSingle();
    if (error) {
      console.error(`[poll] failed to look up subscription for ${deviceId}:`, error);
      return;
    }
    if (!data) return; // no subscription for this device — opt-in, not an error

    try {
      await webpush.sendNotification(
        { endpoint: data.endpoint, keys: { p256dh: data.p256dh, auth: data.auth } },
        JSON.stringify(payload),
      );
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("device_id", deviceId);
      } else {
        console.error(`[poll] push send failed for ${deviceId}:`, err);
      }
    }
  }

  async function sectionLabel(termYear: number, termCode: number, indexNumber: string): Promise<string> {
    const { data } = await supabaseAdmin
      .from("sections")
      .select("section_number, courses(subject_code, course_number, title)")
      .eq("term_year", termYear)
      .eq("term_code", termCode)
      .eq("index_number", indexNumber)
      .maybeSingle();
    const course = (data as { courses?: { subject_code?: string; course_number?: string; title?: string } | null })
      ?.courses;
    if (!course) return `index ${indexNumber}`;
    return `${course.subject_code}:${course.course_number} ${course.title} (sec ${
      (data as { section_number?: string })?.section_number ?? "?"
    }, index ${indexNumber})`;
  }

  const { data: watchData, error: watchError } = await supabaseAdmin.from("watches").select("*");
  if (watchError) {
    res.status(500).json({ error: watchError.message });
    return;
  }
  const watches = (watchData ?? []) as WatchRow[];
  if (watches.length === 0) {
    res.status(200).json({ opened: 0, closedAgain: 0, checked: 0, note: "no active watches" });
    return;
  }

  const termsToCheck = new Map<string, Term>();
  for (const w of watches) termsToCheck.set(termKey({ year: w.term_year, code: w.term_code }), { year: w.term_year, code: w.term_code });

  const openByTerm = new Map<string, Set<string>>();
  const termErrors: string[] = [];
  for (const term of termsToCheck.values()) {
    try {
      openByTerm.set(termKey(term), await fetchOpenIndexes(term));
    } catch (err) {
      termErrors.push(`${termLabel(term)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let opened = 0;
  let closedAgain = 0;

  for (const w of watches) {
    const openSet = openByTerm.get(termKey({ year: w.term_year, code: w.term_code }));
    if (!openSet) continue; // that term's fetch failed this run; leave the watch untouched

    const isOpenNow = openSet.has(w.index_number);

    if (isOpenNow && !w.last_status) {
      // Atomic claim via UPDATE ... WHERE last_status = false -- this
      // duplicates backend/lib/pollOnce.ts's own version of the same guard
      // (see its comment for the full story: this endpoint and
      // poll-worker.ts's persistent loop run concurrently by design, and a
      // plain read-then-send-then-write let both notify for the same
      // flip). Keep both copies in sync if this logic ever changes.
      const { data: claimed, error: claimErr } = await supabaseAdmin
        .from("watches")
        .update({ last_status: true, notified_at: new Date().toISOString() })
        .eq("id", w.id)
        .eq("last_status", false)
        .select("id");
      if (claimErr) {
        console.error(`[poll] failed to claim watch ${w.id}:`, claimErr);
        continue;
      }
      if (claimed && claimed.length > 0) {
        opened++;
        const label = await sectionLabel(w.term_year, w.term_code, w.index_number);
        await sendPushToDevice(w.device_id, {
          title: "A seat opened up!",
          body: label,
          url: `/register?index=${w.index_number}&label=${encodeURIComponent(label)}`,
        });
      }
    } else if (!isOpenNow && w.last_status) {
      closedAgain++;
      await supabaseAdmin.from("watches").update({ last_status: false, notified_at: null }).eq("id", w.id);
    }
  }

  res.status(200).json({ opened, closedAgain, checked: watches.length, termErrors });
}
