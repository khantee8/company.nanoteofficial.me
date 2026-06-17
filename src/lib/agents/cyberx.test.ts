import { describe, it, expect, vi, beforeEach } from 'vitest';

const { completeRawMock } = vi.hoisted(() => ({
  completeRawMock: vi.fn(async () => ({
    text: '# Brief\n\n## Highlight\nx\n\n## Flags\nNone',
    stopReason: 'end_turn',
    usage: { input: 1, output: 100 },
    model: 'claude-haiku-4-5-20251001',
  })),
}));

vi.mock('@/lib/claude', async (orig) => ({
  ...(await orig<typeof import('@/lib/claude')>()),
  completeRaw: completeRawMock,
}));
vi.mock('@/lib/sources/threatintel', () => ({
  fetchKev: vi.fn(async () => [
    { cveId: 'CVE-9', vendorProject: 'Acme', product: 'Widget', vulnerabilityName: 'RCE', dateAdded: '2026-06-01', shortDescription: 'x' },
  ]),
  fetchSecurityNews: vi.fn(async () => [{ title: 'Big breach', link: 'l' }]),
  formatThreatIntel: vi.fn(() => ['CVE-9 line', 'news: Big breach']),
}));

import { run } from './cyberx';
import { WEB_REPORT_MAX_TOKENS } from '@/lib/claude';
import type { AgentContext } from './types';

const emptyCtx: AgentContext = { ownHistory: [], companyDigest: [], todayPeers: [] };

describe('cyberx.run', () => {
  beforeEach(() => completeRawMock.mockClear());

  it('calls Claude with webSearch enabled and a budget that fits a full dual-language report', async () => {
    await run(emptyCtx);
    // No model override — CyberX tracks the company default like the other agents.
    expect(completeRawMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: WEB_REPORT_MAX_TOKENS, webSearch: true }),
    );
    const firstCallArgs = completeRawMock.mock.calls[0] as unknown[];
    expect(firstCallArgs[0]).not.toHaveProperty('model');
  });

  it('returns a populated AgentRunResult', async () => {
    const result = await run(emptyCtx);
    expect(result.markdown).toContain('Brief');
    expect(result.summary).toContain('CVE');
    expect(result.feedMsg).toContain('Big breach');
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
