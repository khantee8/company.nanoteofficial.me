import { describe, it, expect, vi, beforeEach } from 'vitest';

const { completeRawMock } = vi.hoisted(() => ({
  completeRawMock: vi.fn(async () => ({
    text: 'รายงาน mkt\n\n## Highlight\nx\n\n## Flags\nNone',
    stopReason: 'end_turn',
    usage: { input: 1, output: 100 },
    model: 'claude-haiku-4-5-20251001',
  })),
}));

vi.mock('@/lib/claude', () => ({ completeRaw: completeRawMock }));
vi.mock('@/lib/sources/hackernews', () => ({ fetchHN: vi.fn(async () => []) }));
vi.mock('@/lib/sources/devto', () => ({ fetchDevto: vi.fn(async () => []) }));
vi.mock('@/lib/sources/analytics', () => ({ fetchReach: vi.fn(async () => []) }));

import { run } from './marketing';
import type { AgentContext } from './types';

const emptyCtx: AgentContext = { ownHistory: [], companyDigest: [], todayPeers: [] };

describe('marketing.run — truncation flag', () => {
  beforeEach(() => completeRawMock.mockClear());

  it('requests a budget that fits a full dual-language report', async () => {
    await run(emptyCtx);
    expect(completeRawMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 8000, webSearch: true }),
    );
  });

  it('sets incomplete=true when the model stops on max_tokens', async () => {
    completeRawMock.mockResolvedValueOnce({
      text: 'รายงานถูกตัดกลางคัน',
      stopReason: 'max_tokens',
      usage: { input: 1, output: 4000 },
      model: 'claude-haiku-4-5-20251001',
    });
    const result = await run(emptyCtx);
    expect(result.incomplete).toBe(true);
  });

  it('does not flag a clean end_turn run as incomplete', async () => {
    const result = await run(emptyCtx);
    expect(result.incomplete).toBe(false);
  });
});
