import { readFileSync } from 'fs';
import { join } from 'path';
import type { Lang } from '@/lib/i18n/messages';
import { DOC_NAV, type DocPage } from '../../content/doc/nav';

export { DOC_NAV, DOC_HOME } from '../../content/doc/nav';
export type { DocPage, DocSection } from '../../content/doc/nav';

/** Every page slug, in sidebar order — drives generateStaticParams. */
export function getDocSlugs(): string[] {
  return DOC_NAV.flatMap((s) => s.pages.map((p) => p.slug));
}

/** Pure manifest lookup. Returns the page meta, or null for an unknown slug. */
export function resolveDoc(slug: string): DocPage | null {
  for (const section of DOC_NAV) {
    const page = section.pages.find((p) => p.slug === slug);
    if (page) return page;
  }
  return null;
}

// The markdown files ship to the serverless bundle via outputFileTracingIncludes
// (next.config.ts) — the same mechanism the .agents briefs use.
const docPath = (lang: Lang, slug: string) =>
  join(process.cwd(), 'content', 'doc', lang, `${slug}.md`);

/** Read a page's markdown for a language, falling back to English. Empty if absent. */
export function readDoc(slug: string, lang: Lang): string {
  if (!resolveDoc(slug)) return '';
  try {
    return readFileSync(docPath(lang, slug), 'utf8');
  } catch {
    if (lang !== 'en') {
      try { return readFileSync(docPath('en', slug), 'utf8'); } catch { /* fall through */ }
    }
    return '';
  }
}
