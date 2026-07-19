import type { Deck, Slide } from './deck';

export interface LintIssue { slideIndex: number; rule: string; detail: string }

const FILLER = [
  'fast-paced world', 'leverage synergies', 'synergy', "it's not just", 'it is not just',
  'at the end of the day', 'game-changer', 'game changer', 'revolutionize', 'paradigm shift',
  'unlock value', 'take it to the next level', 'move the needle', 'best-in-class', 'cutting-edge',
];
const CONTENT_LAYOUTS = new Set<Slide['layout']>(['bulletsVisual', 'data', 'comparison', 'agenda']);

function slideText(s: Slide): string {
  return JSON.stringify(s).toLowerCase();
}

// evidence = a digit, a %, a $, or a capitalized token that also appears in the brief
function hasEvidence(s: Slide, brief: string): boolean {
  const t = slideText(s);
  if (/\d/.test(t) || t.includes('%') || t.includes('$')) return true;
  const briefWords = new Set(brief.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const proper = JSON.stringify(s).match(/[A-Z][a-z]{3,}/g) ?? [];
  return proper.some((w) => briefWords.has(w.toLowerCase()));
}

export function lintDeck(deck: Deck, brief: string): LintIssue[] {
  const issues: LintIssue[] = [];
  deck.slides.forEach((s, i) => {
    const t = slideText(s);
    for (const phrase of FILLER) {
      if (t.includes(phrase)) issues.push({ slideIndex: i, rule: 'filler', detail: phrase });
    }
    const emDashes = (t.match(/—/g) ?? []).length;
    if (emDashes > 2) issues.push({ slideIndex: i, rule: 'em-dash', detail: `${emDashes} em-dashes` });
    if (s.layout === 'bulletsVisual' && s.bullets.length > 5) {
      issues.push({ slideIndex: i, rule: 'bullet-wall', detail: `${s.bullets.length} bullets` });
    }
    if (CONTENT_LAYOUTS.has(s.layout) && !hasEvidence(s, brief)) {
      issues.push({ slideIndex: i, rule: 'no-evidence', detail: 'no number/proper-noun traceable to brief' });
    }
    if (i >= 2 && deck.slides[i - 1].layout === s.layout && deck.slides[i - 2].layout === s.layout) {
      issues.push({ slideIndex: i, rule: 'monotony', detail: `3rd ${s.layout} in a row` });
    }
  });
  return issues;
}
