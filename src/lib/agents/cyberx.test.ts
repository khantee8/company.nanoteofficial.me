import { describe, it, expect, vi, beforeEach } from 'vitest';

const { completeMock } = vi.hoisted(() => ({ completeMock: vi.fn(async () => '# Brief\n\n## Highlight\nx\n\n## Flags\nNone') }));

vi.mock('@/lib/claude', () => ({ complete: completeMock }));
vi.mock('@/lib/sources/threatintel', () => ({
  fetchKev: vi.fn(async () => [
    { cveId: 'CVE-9', vendorProject: 'Acme', product: 'Widget', vulnerabilityName: 'RCE', dateAdded: '2026-06-01', shortDescription: 'x' },
  ]),
  fetchSecurityNews: vi.fn(async () => [{ title: 'Big breach', link: 'l' }]),
  formatThreatIntel: vi.fn(() => ['CVE-9 line', 'news: Big breach']),
}));

import { run } from './cyberx';
import type { AgentContext } from './types';

const emptyCtx: AgentContext = { ownHistory: [], companyDigest: [], todayPeers: [] };

describe('cyberx.run', () => {
  beforeEach(() => completeMock.mockClear());

  it('calls Claude Haiku with a capped token budget', async () => {
    await run(emptyCtx);
    expect(completeMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001', maxTokens: 600 }),
    );
  });

  it('returns a populated AgentRunResult', async () => {
    const result = await run(emptyCtx);
    expect(result.markdown).toContain('Brief');
    expect(result.summary).toContain('CVE');
    expect(result.feedMsg).toContain('Big breach');
  });
});
