import { describe, it, expect } from 'vitest';
import { extractFindingsBlock, hasCitation } from './findings';

describe('extractFindingsBlock', () => {
  it('parses a fenced json findings block', () => {
    const md = 'report text\n```json findings\n{"funds":[{"name":"A"}]}\n```\nmore text';
    expect(extractFindingsBlock<{ funds: { name: string }[] }>(md)).toEqual({ funds: [{ name: 'A' }] });
  });

  it('parses a plain ```json fence (model drift, R&D 2026-07-02)', () => {
    const md = 'preamble\n```json\n{"theme":"llm-infra","items":[{"name":"vLLM"}]}\n```\nnarrative';
    expect(extractFindingsBlock<{ theme: string }>(md)).toEqual({ theme: 'llm-infra', items: [{ name: 'vLLM' }] });
  });

  it('unwraps a top-level { findings: … } wrapper (model drift, R&D 2026-07-02)', () => {
    const md = '```json\n{"findings":{"theme":"llm-infra","items":[]}}\n```';
    expect(extractFindingsBlock<{ theme: string }>(md)).toEqual({ theme: 'llm-infra', items: [] });
  });

  it('prefers the tagged findings fence over an earlier plain json block', () => {
    const md = '```json\n{"unrelated":true}\n```\n```json findings\n{"funds":[]}\n```';
    expect(extractFindingsBlock<{ funds: unknown[] }>(md)).toEqual({ funds: [] });
  });

  it('returns null when no block present', () => {
    expect(extractFindingsBlock('just a report')).toBeNull();
  });

  it('returns null on malformed json', () => {
    expect(extractFindingsBlock('```json findings\n{not json}\n```')).toBeNull();
  });
});

describe('hasCitation', () => {
  it('true when url and date present', () => {
    expect(hasCitation({ citation: { url: 'https://e.com', title: 't', date: '2026-06-01' } })).toBe(true);
  });
  it('false when citation missing or urlless', () => {
    expect(hasCitation({})).toBe(false);
    expect(hasCitation({ citation: { url: '', title: 't', date: '2026-06-01' } })).toBe(false);
    expect(hasCitation({ citation: { url: 'https://e.com', title: 't', date: '' } })).toBe(false);
  });
});
