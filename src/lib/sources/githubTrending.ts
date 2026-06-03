// Trending repositories for AI R&D — recently-created repos in NaNote's niche
// ranked by stars, via the free GitHub Search API (no key required; uses
// GITHUB_TOKEN when present for a higher rate limit). The pure `selectTrending`
// is the tested unit; `fetchTrending` swallows errors → [] so the agent simply
// omits its charts when the API is unavailable.
export interface TrendingRepo {
  name: string;
  url: string;
  stars: number;
  language: string;
}

export interface TrendingResponse {
  items?: Array<{
    full_name?: string;
    html_url?: string;
    stargazers_count?: number;
    language?: string | null;
  }>;
}

export function selectTrending(raw: TrendingResponse, limit = 8): TrendingRepo[] {
  return (raw.items ?? [])
    .filter((r) => r.full_name)
    .slice(0, limit)
    .map((r) => ({
      name: r.full_name as string,
      url: r.html_url ?? `https://github.com/${r.full_name}`,
      stars: r.stargazers_count ?? 0,
      language: r.language ?? 'other',
    }));
}

export async function fetchTrending(topic = 'ai-agents'): Promise<TrendingRepo[]> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const q = encodeURIComponent(`topic:${topic} created:>${since}`);
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=10`,
      { headers },
    );
    if (!res.ok) return [];
    return selectTrending((await res.json()) as TrendingResponse);
  } catch {
    return [];
  }
}
