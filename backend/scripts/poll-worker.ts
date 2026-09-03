// The persistent sniper loop — polls the SOC "open sections" endpoint every
// ~2.5-3.3 seconds, forever, instead of relying on an external per-minute
// cron trigger.
//
// Why this exists at all: every free scheduled-trigger service (GitHub
// Actions, cron-job.org, Cloudflare Cron Triggers) bottoms out at a 1-minute
// floor — verified, not assumed, back when this project first set up
// cron-job.org. There is no config change that gets a *triggered* job below
// that floor. Getting real single-digit-second notification latency needs a
// long-running process that loops on its own timer instead of waiting to be
// triggered — which in turn needs somewhere that stays on between loop
// iterations, unlike Vercel/GitHub Actions' one-shot functions. Hence: this
// script, meant to run under systemd (see README) on a free-tier always-on
// VM, not as a serverless function.
//
// This does NOT replace web/api/poll.ts + the cron-job.org 1-minute ping —
// that path keeps running as a slower fallback. If this worker's VM is ever
// down (reboot, host maintenance, connectivity blip), the 1-minute path
// still catches every open/close within 60s instead of a silent gap. Both
// write to the same `watches.last_status` column and both run against it
// concurrently, by design — that's genuinely safe now, but it wasn't just
// from "whichever one runs first wins" as this comment used to claim: a
// plain read-then-send-then-write let both of them read last_status=false
// in the same window and both send a push before either write landed,
// confirmed live as the actual cause of duplicate "seat opened"
// notifications. pollOnce.ts's UPDATE ... WHERE last_status = false is
// the real guard — an atomic claim, not a hope. Don't remove it.
//
// Politeness/self-preservation: jittered interval (not a robotic exact
// period) plus exponential backoff on repeated failures, so a rough patch
// on Rutgers' end (or, worse, an IP-level rate limit triggered by this very
// script) doesn't turn into a tight retry loop hammering it further.

import "dotenv/config";
import { pollOnce } from "../lib/pollOnce.js";
import { termLabel } from "../lib/term.js";

const BASE_INTERVAL_MS = 2500;
const JITTER_MS = 800;
const MAX_BACKOFF_MS = 30_000;
const HEARTBEAT_EVERY = 120; // ~ every 5-6 minutes at the base interval

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`[poll-worker] starting, base interval ${BASE_INTERVAL_MS}ms + up to ${JITTER_MS}ms jitter`);

  let consecutiveFailures = 0;
  let iteration = 0;

  while (!stopping) {
    iteration++;
    try {
      const result = await pollOnce();
      consecutiveFailures = 0;

      for (const { term, message } of result.termErrors) {
        console.error(`[poll-worker] fetch failed for ${termLabel(term)}: ${message}`);
      }
      for (const label of result.openedLabels) {
        console.log(`[poll-worker] OPENED: ${label}`);
      }
      if (result.closedAgain > 0) {
        console.log(`[poll-worker] ${result.closedAgain} watch(es) closed again`);
      }
      if (iteration % HEARTBEAT_EVERY === 0) {
        console.log(`[poll-worker] alive — iteration ${iteration}, ${result.checked} watch(es) tracked`);
      }
    } catch (err) {
      consecutiveFailures++;
      console.error(`[poll-worker] iteration failed (${consecutiveFailures} in a row):`, err);
    }

    const backoff = consecutiveFailures > 0 ? Math.min(MAX_BACKOFF_MS, BASE_INTERVAL_MS * 2 ** consecutiveFailures) : 0;
    const delay = Math.max(BASE_INTERVAL_MS, backoff) + Math.random() * JITTER_MS;
    await sleep(delay);
  }

  console.log("[poll-worker] stopping (signal received)");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("[poll-worker] fatal:", err);
    process.exit(1);
  },
);
