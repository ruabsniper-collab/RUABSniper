type Request = { query: Record<string, string | string[] | undefined> };
type Response = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
};

export default async function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const year = Number(req.query.year);
  const term = Number(req.query.term);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || ![0, 1, 7, 9].includes(term)) {
    res.status(400).json({ error: "Invalid semester" });
    return;
  }
  try {
    const response = await fetch(
      `https://sis.rutgers.edu/soc/api/openSections.json?year=${year}&term=${term}&campus=NB`,
      { signal: AbortSignal.timeout(10_000), cache: "no-store" },
    );
    if (!response.ok) throw new Error("Rutgers seat feed unavailable");
    const data: unknown = await response.json();
    if (!Array.isArray(data) || !data.every((index) => /^[0-9]{1,6}$/.test(String(index)))) {
      throw new Error("Invalid Rutgers seat feed");
    }
    res.status(200).json({ openIndexes: data.map(String), checkedAt: new Date().toISOString() });
  } catch {
    res.status(502).json({ error: "Could not verify seat availability with Rutgers" });
  }
}
