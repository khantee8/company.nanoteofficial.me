// Hacker News via the free Algolia API (no key). Used by Marketing as a demand
// signal — trending stories in NaNote's niche with real engagement (points,
// comments). Pure `selectHN` is the tested unit; `fetchHN` swallows errors → [].
export interface HNItem {
  title: string;
  url: string;
  points: number;
  comments: number;
}

export interface HNResponse {
  hits?: Array<{ title?: string; url?: string; points?: number; num_comments?: number; objectID?: string }>;
}

export function selectHN(raw: HNResponse, limit = 8): HNItem[] {
  return (raw.hits ?? [])
    .filter((h) => h.title)
    .slice(0, limit)
    .map((h) => ({
      title: h.title as string,
      url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID ?? ''}`,
      points: h.points ?? 0,
      comments: h.num_comments ?? 0,
    }));
}

export async function fetchHN(query = 'AI agents'): Promise<HNItem[]> {
  try {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&numericFilters=points%3E20`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) return [];
    return selectHN((await res.json()) as HNResponse);
  } catch {
    return [];
  }
}
