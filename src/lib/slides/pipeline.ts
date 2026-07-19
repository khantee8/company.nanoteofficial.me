import { completeRaw } from '@/lib/claude';
import { costOf, PLAN_MODEL } from '@/lib/cost';
import { validateDeck, type Deck, type ThemeId } from './deck';
import { lintDeck } from './slopLint';
import { outlinePrompt, draftPrompt, criticPrompt, extractJson } from './prompts';

// claude-sonnet-5 runs adaptive thinking by default when no thinking param is sent,
// and thinking tokens count against max_tokens — these budgets are scaled to avoid truncation.
export const STEP_BUDGET = { outline: 2500, draft: 10000, critic: 6000 } as const;

export interface GenParams { theme: ThemeId; slideCount: number; audience: string; brief: string; extra?: string }
export interface StepNote { step: 'outline' | 'draft' | 'lint' | 'critic'; note: string; data?: unknown }
export interface GenResult {
  deck: Deck;
  meta: { model: string; theme: ThemeId; slideCount: number; usage: { input: number; output: number }; costUsd: number; trace: StepNote[]; lintFixed: number };
}

type Complete = typeof completeRaw;

// rough pre-generate estimate: ~ (outline + draft + critic) budgets at Sonnet output price
export function estimateCost(slideCount: number): number {
  const outTokens = STEP_BUDGET.outline + slideCount * 500 + STEP_BUDGET.critic * 0.5;
  return costOf(PLAN_MODEL, { input: 1500 + slideCount * 120, output: outTokens });
}

function parseDeck(text: string, theme: ThemeId, truncated = false): Deck {
  const parsed = extractJson(text);
  const v = validateDeck(parsed);
  if (!v.ok) {
    const msg = `deck parse failed: ${v.error}${truncated ? ' (output hit max_tokens)' : ''}`;
    throw new Error(msg);
  }
  if (v.deck.theme !== theme) v.deck.theme = theme; // force requested theme
  return v.deck;
}

export async function generateDeck(p: GenParams, complete: Complete = completeRaw, onStep?: (n: StepNote) => void): Promise<GenResult> {
  const trace: StepNote[] = [];
  let inTok = 0, outTok = 0;
  const emit = (n: StepNote) => { trace.push(n); onStep?.(n); };
  let lastStopReason: string | null = null;
  const call = async (step: StepNote['step'], args: { system: string; prompt: string }, maxTokens: number) => {
    const r = await complete({ ...args, model: PLAN_MODEL, maxTokens });
    inTok += r.usage.input; outTok += r.usage.output;
    lastStopReason = r.stopReason;
    return r.text;
  };

  // 1. outline
  const outline = await call('outline', outlinePrompt(p), STEP_BUDGET.outline);
  emit({ step: 'outline', note: 'Narrative arc drafted' });

  // 2. draft (one repair retry on parse failure)
  let deck: Deck;
  try {
    deck = parseDeck(await call('draft', draftPrompt({ brief: p.brief, theme: p.theme, outline }), STEP_BUDGET.draft), p.theme, lastStopReason === 'max_tokens');
  } catch {
    deck = parseDeck(await call('draft', draftPrompt({ brief: p.brief, theme: p.theme, outline }), STEP_BUDGET.draft), p.theme, lastStopReason === 'max_tokens');
  }
  emit({ step: 'draft', note: `Drafted ${deck.slides.length} slides` });

  // 3. lint (free)
  const issues = lintDeck(deck, p.brief);
  emit({ step: 'lint', note: issues.length ? `${issues.length} quality issues found` : 'No AI-slop detected', data: issues });

  // 4. critic-revise (only if issues)
  let lintFixed = 0;
  if (issues.length) {
    const issueText = issues.map((i) => `slide ${i.slideIndex}: ${i.rule} — ${i.detail}`).join('\n');
    const revised = parseDeck(await call('critic', criticPrompt({ deck, brief: p.brief, issues: issueText }), STEP_BUDGET.critic), p.theme, lastStopReason === 'max_tokens');
    lintFixed = issues.length - lintDeck(revised, p.brief).length;
    deck = revised;
    emit({ step: 'critic', note: `Revised ${issues.length} flagged slide(s); ${lintFixed} issue(s) cleared` });
  } else {
    emit({ step: 'critic', note: 'Skipped — nothing flagged' });
  }

  const usage = { input: inTok, output: outTok };
  return { deck, meta: { model: PLAN_MODEL, theme: p.theme, slideCount: deck.slides.length, usage, costUsd: costOf(PLAN_MODEL, usage), trace, lintFixed } };
}
