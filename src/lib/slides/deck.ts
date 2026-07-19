export type ThemeId = 'midnight' | 'editorial' | 'grid';
export const THEMES: ThemeId[] = ['midnight', 'editorial', 'grid'];

export type Slide =
  | { layout: 'title'; title: string; subtitle?: string }
  | { layout: 'agenda'; heading: string; items: string[] }
  | { layout: 'section'; title: string; kicker?: string }
  | { layout: 'bulletsVisual'; heading: string; bullets: string[]; note?: string }
  | { layout: 'quote'; quote: string; attribution?: string }
  | { layout: 'data'; heading: string; stat: string; caption?: string }
  | { layout: 'comparison'; heading: string; left: { title: string; points: string[] }; right: { title: string; points: string[] } }
  | { layout: 'closing'; title: string; cta?: string };

export interface Deck { theme: ThemeId; slides: Slide[] }

const LAYOUTS = new Set<Slide['layout']>(['title','agenda','section','bulletsVisual','quote','data','comparison','closing']);

export function validateDeck(x: unknown): { ok: true; deck: Deck } | { ok: false; error: string } {
  if (!x || typeof x !== 'object') return { ok: false, error: 'not an object' };
  const d = x as Record<string, unknown>;
  if (!THEMES.includes(d.theme as ThemeId)) return { ok: false, error: `bad theme: ${String(d.theme)}` };
  if (!Array.isArray(d.slides)) return { ok: false, error: 'slides must be an array' };
  for (const [i, s] of d.slides.entries()) {
    if (!s || typeof s !== 'object' || !LAYOUTS.has((s as Record<string, unknown>).layout as Slide['layout'])) {
      return { ok: false, error: `slide ${i}: bad layout` };
    }
  }
  return { ok: true, deck: x as Deck };
}
