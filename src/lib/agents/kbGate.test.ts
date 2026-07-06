import { describe, it, expect } from 'vitest';
import { qualityGate } from './kbGate';
import type { AgentRunResult } from './types';

const base: AgentRunResult = {
  markdown: '# report', summary: 'good run', feedMsg: 'x',
  sources: [{ url: 'https://a', title: 'A', date: '2026-07-01' }],
};

describe('qualityGate', () => {
  it('passes a clean run with cited sources', () => {
    expect(qualityGate(base)).toBe(true);
  });
  it('passes when citations live on a web artifact instead of result.sources', () => {
    expect(qualityGate({ ...base, sources: [], artifacts: [
      { kind: 'tags', title: 't', tags: ['x'], provenance: 'web',
        sources: [{ url: 'https://a', title: 'A', date: '2026-07-01' }] },
    ] })).toBe(true);
  });
  it('fails an incomplete (truncated/errored) run', () => {
    expect(qualityGate({ ...base, incomplete: true })).toBe(false);
  });
  it('fails a run with no cited material at all', () => {
    expect(qualityGate({ ...base, sources: [], artifacts: [
      { kind: 'tags', title: 't', tags: ['x'], provenance: 'api' },
    ] })).toBe(false);
  });
  it('fails an empty summary', () => {
    expect(qualityGate({ ...base, summary: '  ' })).toBe(false);
  });
});
