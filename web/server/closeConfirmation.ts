// A single CLOSED snapshot must not re-arm an alert. Rutgers snapshots and
// independent pollers can briefly disagree. Opening alerts remain immediate;
// only re-arming requires repeated CLOSED observations spanning six seconds.
// No dependencies: the laptop installs backend/node_modules only.
export class CloseConfirmationState {
  private pending = new Map<string, { generation: string | null; since: number }>();

  constructor(private now: () => number = Date.now) {}

  observe(id: string, isOpen: boolean, lastStatus: boolean, notifiedAt: string | null): boolean {
    if (isOpen || !lastStatus) {
      this.pending.delete(id);
      return false;
    }
    const previous = this.pending.get(id);
    if (!previous || previous.generation !== notifiedAt) {
      this.pending.set(id, { generation: notifiedAt, since: this.now() });
      return false;
    }
    return this.now() - previous.since >= 6_000;
  }

  retain(ids: Set<string>): void {
    for (const id of this.pending.keys()) if (!ids.has(id)) this.pending.delete(id);
  }
}
