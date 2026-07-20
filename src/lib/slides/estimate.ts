import { costOf, PLAN_MODEL } from '@/lib/cost';

// claude-sonnet-5 runs adaptive thinking by default when no thinking param is sent,
// and thinking tokens count against max_tokens — these budgets are scaled to avoid truncation.
export const STEP_BUDGET = { outline: 2500, draft: 10000, critic: 6000 } as const;

// rough pre-generate estimate: ~ (outline + draft + critic) budgets at Sonnet output price
export function estimateCost(slideCount: number): number {
  const outTokens = STEP_BUDGET.outline + slideCount * 500 + STEP_BUDGET.critic * 0.5;
  return costOf(PLAN_MODEL, { input: 1500 + slideCount * 120, output: outTokens });
}
