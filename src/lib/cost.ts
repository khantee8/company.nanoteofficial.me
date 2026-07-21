// USD per 1,000,000 tokens. Authored from Anthropic public pricing (2026-06).
// Cost is computed at read time from stored token counts, so updating a rate
// re-prices all history. Confirm rates via the claude-api skill before shipping.
//
// Verified rates (claude-api skill, 2026-06-15):
//   claude-haiku-4-5:   $1.00 input / $5.00 output
//   claude-sonnet-4-6:  $3.00 input / $15.00 output
//   claude-opus-4-8:    $5.00 input / $25.00 output
// NOTE: The plan spec listed opus at $15/$75 — those are incorrect (Fable 5 pricing).
// Using verified values above.
export interface ModelPrice { input: number; output: number }

// One shared const for Haiku so the dated id and the undated alias resolve to
// the same object (and DEFAULT_MODEL_PRICE === PRICING['claude-haiku-4-5-20251001']).
const HAIKU_PRICE: ModelPrice = { input: 1, output: 5 };

export const PRICING: Record<string, ModelPrice> = {
  'claude-haiku-4-5-20251001': HAIKU_PRICE,
  'claude-haiku-4-5': HAIKU_PRICE,
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-8': { input: 5, output: 25 },
};

// Fallback when a model id is absent from PRICING — use the default agent model
// (Haiku) so an unknown model still yields a non-zero, clearly-estimated cost.
export const DEFAULT_MODEL_PRICE: ModelPrice = PRICING['claude-haiku-4-5-20251001'];

export function isKnownModel(model: string): boolean {
  return model in PRICING;
}

export function costOf(model: string, usage: { input: number; output: number }, batch = false): number {
  const price = PRICING[model] ?? DEFAULT_MODEL_PRICE;
  const std = (usage.input / 1_000_000) * price.input + (usage.output / 1_000_000) * price.output;
  // Message Batches bill at 50% of standard token pricing (v1.12 substrate).
  return batch ? std / 2 : std;
}
