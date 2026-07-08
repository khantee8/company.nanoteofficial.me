import { describe, it, expect, vi, beforeEach } from 'vitest';

const { completeRawMock } = vi.hoisted(() => ({
  completeRawMock: vi.fn(async () => ({
    text: 'รายงาน rnd\n\n## Highlight\nx\n\n## Flags\nNone',
    stopReason: 'end_turn',
    usage: { input: 1, output: 100 },
    model: 'claude-haiku-4-5-20251001',
  })),
}));

vi.mock('@/lib/claude', async (orig) => ({
  ...(await orig<typeof import('@/lib/claude')>()),
  completeRaw: completeRawMock,
}));
vi.mock('@/lib/sources/githubTrending', () => ({ fetchTrending: vi.fn(async () => []) }));

import { run, prepare, finalize } from './rnd';
import { WEB_REPORT_MAX_TOKENS } from '@/lib/claude';
import type { AgentContext } from './types';

const emptyCtx: AgentContext = { ownHistory: [], companyDigest: [], todayPeers: [] };

describe('rnd.run — truncation flag', () => {
  beforeEach(() => completeRawMock.mockClear());

  it('requests a budget that fits a full dual-language report', async () => {
    await run(emptyCtx);
    expect(completeRawMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: WEB_REPORT_MAX_TOKENS, webSearch: true }),
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

describe('prepare/finalize split', () => {
  it('prepare returns webSearch request opts + theme/repos meta; finalize flags max_tokens as incomplete', async () => {
    const { opts, meta } = await prepare(emptyCtx);
    expect(opts).toMatchObject({ webSearch: true, maxSearches: 5, maxTokens: WEB_REPORT_MAX_TOKENS });
    expect(meta.theme).toBeTruthy();
    expect(meta.repos).toEqual([]);
    const result = finalize(emptyCtx, meta, {
      text: 'รายงานถูกตัดกลางคัน', stopReason: 'max_tokens', usage: { input: 1, output: 4000 }, model: 'claude-haiku-4-5-20251001',
    });
    expect(result.incomplete).toBe(true);
  });
});
