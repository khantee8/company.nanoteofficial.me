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

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

function isStrArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isStr);
}

function optStr(v: unknown): boolean {
  return v === undefined || isStr(v);
}

function isPanel(v: unknown): v is { title: string; points: string[] } {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return isStr(p.title) && isStrArray(p.points);
}

/**
 * Per-layout required-field checks. Each entry validates the fields specific
 * to that layout; optional fields (subtitle, kicker, note, attribution,
 * caption, cta) are checked for type only when present, at the call site.
 */
function validateSlideFields(s: Record<string, unknown>): string | null {
  switch (s.layout as Slide['layout']) {
    case 'title':
      if (!isStr(s.title)) return 'missing/invalid title';
      if (!optStr(s.subtitle)) return 'missing/invalid subtitle';
      return null;
    case 'agenda':
      if (!isStr(s.heading)) return 'missing/invalid heading';
      if (!isStrArray(s.items)) return 'missing/invalid items';
      return null;
    case 'section':
      if (!isStr(s.title)) return 'missing/invalid title';
      if (!optStr(s.kicker)) return 'missing/invalid kicker';
      return null;
    case 'bulletsVisual':
      if (!isStr(s.heading)) return 'missing/invalid heading';
      if (!isStrArray(s.bullets)) return 'missing/invalid bullets';
      if (!optStr(s.note)) return 'missing/invalid note';
      return null;
    case 'quote':
      if (!isStr(s.quote)) return 'missing/invalid quote';
      if (!optStr(s.attribution)) return 'missing/invalid attribution';
      return null;
    case 'data':
      if (!isStr(s.heading)) return 'missing/invalid heading';
      if (!isStr(s.stat)) return 'missing/invalid stat';
      if (!optStr(s.caption)) return 'missing/invalid caption';
      return null;
    case 'comparison':
      if (!isStr(s.heading)) return 'missing/invalid heading';
      if (!isPanel(s.left)) return 'missing/invalid left';
      if (!isPanel(s.right)) return 'missing/invalid right';
      return null;
    case 'closing':
      if (!isStr(s.title)) return 'missing/invalid title';
      if (!optStr(s.cta)) return 'missing/invalid cta';
      return null;
    default:
      return 'bad layout';
  }
}

export function validateDeck(x: unknown): { ok: true; deck: Deck } | { ok: false; error: string } {
  if (!x || typeof x !== 'object') return { ok: false, error: 'not an object' };
  const d = x as Record<string, unknown>;
  if (!THEMES.includes(d.theme as ThemeId)) return { ok: false, error: `bad theme: ${String(d.theme)}` };
  if (!Array.isArray(d.slides)) return { ok: false, error: 'slides must be an array' };
  for (const [i, s] of d.slides.entries()) {
    if (!s || typeof s !== 'object') {
      return { ok: false, error: `slide ${i}: not an object` };
    }
    const rec = s as Record<string, unknown>;
    if (!LAYOUTS.has(rec.layout as Slide['layout'])) {
      return { ok: false, error: `slide ${i}: bad layout` };
    }
    const fieldError = validateSlideFields(rec);
    if (fieldError) {
      return { ok: false, error: `slide ${i}: ${fieldError}` };
    }
  }
  return { ok: true, deck: x as Deck };
}
