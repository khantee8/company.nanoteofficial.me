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

  it('calls Claude with webSearch enabled and a capped token budget on the shared default model', async () => {
    await run(emptyCtx);
    // No model override — CyberX now tracks the company default (Sonnet 4.6) like the other agents.
    expect(completeMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 1800, webSearch: true }),
    );
    const firstCallArgs = completeMock.mock.calls[0] as unknown[];
    expect(firstCallArgs[0]).not.toHaveProperty('model');
  });

  it('returns a populated AgentRunResult', async () => {
    const result = await run(emptyCtx);
    expect(result.markdown).toContain('Brief');
    expect(result.summary).toContain('CVE');
    expect(result.feedMsg).toContain('Big breach');
  });
});
