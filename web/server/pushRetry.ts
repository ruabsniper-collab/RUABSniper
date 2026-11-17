// Pure server-side retry policy shared with the laptop worker. Keep this free
// of package imports: the laptop only installs backend/node_modules.
export type PushDeliveryResult = "sent" | "skipped" | "retry";

export class PushRetryState {
  private failures = new Map<string, { count: number; after: number }>();

  constructor(private now: () => number = Date.now) {}

  canAttempt(deviceId: string): boolean {
    return this.now() >= (this.failures.get(deviceId)?.after ?? 0);
  }

  failed(deviceId: string, retryAfter?: string): PushDeliveryResult {
    const count = Math.min((this.failures.get(deviceId)?.count ?? 0) + 1, 5);
    const requestedDelay = retryAfter === undefined ? 0 : /^\d+$/.test(retryAfter)
      ? Number(retryAfter) * 1_000
      : Date.parse(retryAfter) - this.now();
    this.failures.set(deviceId, {
      count,
      after: this.now() + Math.max(
        Math.min(60_000, 5_000 * 2 ** (count - 1)),
        Number.isFinite(requestedDelay) ? requestedDelay : 0,
      ),
    });
    return "retry";
  }

  reset(deviceId: string): void {
    this.failures.delete(deviceId);
  }
}
