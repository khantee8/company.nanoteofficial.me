export interface KevEntry {
  cveId: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
}

export interface NewsItem {
  title: string;
  link: string;
}

export interface KevCatalog {
  vulnerabilities: Array<{
    cveID: string;
    vendorProject: string;
    product: string;
    vulnerabilityName: string;
    dateAdded: string;
    shortDescription: string;
  }>;
}

const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const NEWS_URL = 'https://feeds.feedburner.com/TheHackersNews';

export function selectKev(raw: KevCatalog, limit = 10): KevEntry[] {
  return [...(raw.vulnerabilities ?? [])]
    .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
    .slice(0, limit)
    .map((v) => ({
      cveId: v.cveID,
      vendorProject: v.vendorProject,
      product: v.product,
      vulnerabilityName: v.vulnerabilityName,
      dateAdded: v.dateAdded,
      shortDescription: v.shortDescription,
    }));
}

export function parseRss(xml: string, limit = 5): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  const field = (block: string, tag: string): string => {
    const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`));
    return m ? m[1].trim() : '';
  };
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
    const title = field(m[1], 'title');
    if (title) items.push({ title, link: field(m[1], 'link') });
  }
  return items;
}

export function formatThreatIntel(kev: KevEntry[], news: NewsItem[]): string[] {
  const lines: string[] = [];
  for (const k of kev) {
    lines.push(`${k.cveId} — ${k.vendorProject} ${k.product}: ${k.vulnerabilityName} (added ${k.dateAdded})`);
  }
  for (const n of news) {
    lines.push(`news: ${n.title}`);
  }
  return lines;
}

export async function fetchKev(): Promise<KevEntry[]> {
  try {
    const res = await fetch(KEV_URL, { headers: { accept: 'application/json' } });
    if (!res.ok) return [];
    return selectKev((await res.json()) as KevCatalog);
  } catch {
    return [];
  }
}

export async function fetchSecurityNews(): Promise<NewsItem[]> {
  try {
    const res = await fetch(NEWS_URL, { headers: { accept: 'application/rss+xml, application/xml' } });
    if (!res.ok) return [];
    return parseRss(await res.text());
  } catch {
    return [];
  }
}
