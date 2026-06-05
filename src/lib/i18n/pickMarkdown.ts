import type { Lang } from './messages';

/** Pick the active-language narrative, falling back to the canonical (TH). */
export function pickMarkdown(o: { markdown?: string; markdownEn?: string } | null | undefined, lang: Lang): string {
  if (!o) return '';
  if (lang === 'en') return o.markdownEn ?? o.markdown ?? '';
  return o.markdown ?? '';
}
