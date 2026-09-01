// One-shot version of the poller — checks every watched section once and
// exits. Useful for manual testing and as a documented reference for what
// a single pass does. The thing actually running in production is
// scripts/poll-worker.ts (a persistent loop) — see that file for why.
//
// Run manually: `npm run poll-and-notify`

import "dotenv/config";
import { pollOnce } from "../lib/pollOnce.js";
import { termLabel } from "../lib/term.js";

async function main() {
  const result = await pollOnce();

  if (result.checked === 0) {
    console.log("[poll] no active watches, nothing to do");
    return;
  }

  for (const { term, openCount } of result.termsChecked) {
    console.log(`[poll] ${termLabel(term)}: ${openCount} open indexes`);
  }
  for (const { term, message } of result.termErrors) {
    console.error(`[poll] failed to fetch open sections for ${termLabel(term)}:`, message);
  }
  for (const label of result.openedLabels) {
    console.log(`[poll] OPENED: ${label}`);
  }

  console.log(`[poll] done: ${result.opened} newly opened, ${result.closedAgain} closed again, ${result.checked} watches checked`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
