import { APP_VERSION } from "../src/lib/appVersion";

const EVENTS = new Set(["sw-push", "sw-click-data", "sw-click-tag", "sw-stored", "sw-client", "sw-navigated", "sw-navigation-failed", "sw-opened", "app-start", "app-inbox", "app-ack", "route-rendered"]);
type Request = { query: Record<string, string | string[] | undefined> };
type Response = { setHeader(name: string, value: string): void; status(code: number): { json(body: unknown): void } };

export default function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const { event, trace, index, version } = req.query;
  if (!event) { res.status(200).json({ version: APP_VERSION }); return; }
  if (typeof event !== "string" || !EVENTS.has(event) || typeof trace !== "string" || !/^[a-f0-9-]{36}$/.test(trace) ||
      typeof index !== "string" || !/^\d{1,6}$/.test(index) || typeof version !== "string" || !/^[\d.]{1,20}$/.test(version)) {
    res.status(400).json({ error: "Invalid test event" });
    return;
  }
  console.log(`[notification-route] ${JSON.stringify({ event, trace, index, version })}`);
  res.status(200).json({ ok: true });
}
