// Dev.to via the free public API (no key). A second demand signal for Marketing
// — top articles by tag with real reactions/comments and their topic tags.
export interface DevtoItem {
  title: string;
  url: string;
  reactions: number;
  comments: number;
  tags: string[];
}

export interface DevtoArticle {
  title?: string;
  url?: string;
  public_reactions_count?: number;
  comments_count?: number;
  tag_list?: string[] | string;
}

function toTags(tagList: DevtoArticle['tag_list']): string[] {
  if (Array.isArray(tagList)) return tagList;
  if (typeof tagList === 'string') return tagList.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

export function selectDevto(raw: DevtoArticle[], limit = 8): DevtoItem[] {
  return (raw ?? [])
    .filter((a) => a.title)
    .slice(0, limit)
    .map((a) => ({
      title: a.title as string,
      url: a.url ?? '',
      reactions: a.public_reactions_count ?? 0,
      comments: a.comments_count ?? 0,
      tags: toTags(a.tag_list),
    }));
}

export async function fetchDevto(tag = 'ai'): Promise<DevtoItem[]> {
  try {
    const res = await fetch(`https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&top=7&per_page=10`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return [];
    return selectDevto((await res.json()) as DevtoArticle[]);
  } catch {
    return [];
  }
}
