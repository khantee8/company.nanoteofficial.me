import { describe, it, expect } from 'vitest';
import { extractFindingsBlock, hasCitation } from './findings';

describe('extractFindingsBlock', () => {
  it('parses a fenced json findings block', () => {
    const md = 'report text\n```json findings\n{"funds":[{"name":"A"}]}\n```\nmore text';
    expect(extractFindingsBlock<{ funds: { name: string }[] }>(md)).toEqual({ funds: [{ name: 'A' }] });
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
