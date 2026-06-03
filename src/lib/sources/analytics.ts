// Owned reach for Marketing: Vercel Web Analytics timeseries (visits/day).
// Best-effort — `fetchReach` returns [] when no token or when the endpoint is
// unavailable on the plan, so the agent simply omits the reach chart. The pure
// `shapeReach` is the tested unit.
export interface ReachPoint {
  day: string;
  visits: number;
}

export interface ReachResponse {
  data?: Array<{ key?: string; total?: number }>;
}

export function shapeReach(raw: ReachResponse): ReachPoint[] {
  return (raw.data ?? [])
    .filter((d) => d.key)
    .map((d) => ({ day: (d.key as string).slice(5), visits: d.total ?? 0 }));
}

export async function fetchReach(): Promise<ReachPoint[]> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return [];
  try {
    const res = await fetch('https://api.vercel.com/v1/web/insights/timeseries?environment=production', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return shapeReach((await res.json()) as ReachResponse);
  } catch {
    return [];
  }
}
