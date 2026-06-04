import { describe, it, expect } from 'vitest';
import { parseMarketingFindings, marketingSignalArtifacts, marketingPlanArtifacts } from './marketing';

const cite = { url: 'https://news.example/x', title: 'HN', date: '2026-06-03' };
const sig = { topic: 'rust web', source: 'web' as const, score: 120, citation: cite };
const plan = { channel: 'blog' as const, idea: 'why rust on the edge', tiedTo: 'rust web' };

describe('parseMarketingFindings', () => {
  it('keeps valid signals + plan items', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'dev-demand', signals: [sig], plan: [plan] }) + '\n```';
    const f = parseMarketingFindings(md);
    expect(f?.signals).toHaveLength(1);
    expect(f?.plan).toHaveLength(1);
  });
  it('drops signals missing citation', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'dev-demand', signals: [{ ...sig, citation: undefined }], plan: [] }) + '\n```';
    expect(parseMarketingFindings(md)?.signals).toHaveLength(0);
  });
  it('drops signals with invalid source or non-finite score', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'dev-demand', signals: [
      { ...sig, source: 'reddit' }, { ...sig, score: null },
    ], plan: [] }) + '\n```';
    expect(parseMarketingFindings(md)?.signals).toHaveLength(0);
  });
  it('drops plan items with invalid channel or missing idea', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'dev-demand', signals: [], plan: [
      { ...plan, channel: 'tiktok' }, { ...plan, idea: undefined },
    ] }) + '\n```';
    expect(parseMarketingFindings(md)?.plan).toHaveLength(0);
  });
  it('returns empty arrays when signals/plan not arrays', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'dev-demand', signals: 'x', plan: 'y' }) + '\n```';
    expect(parseMarketingFindings(md)).toEqual({ theme: 'dev-demand', signals: [], plan: [] });
  });
  it('returns null when no block', () => {
    expect(parseMarketingFindings('nope')).toBeNull();
  });
});

describe('marketing findings artifacts', () => {
  it('signals → one web·cited table with sources', () => {
    const a = marketingSignalArtifacts({ theme: 'dev-demand', signals: [sig, { ...sig, topic: 'go' }], plan: [] });
    expect(a).toHaveLength(1);
    expect(a[0].provenance).toBe('web');
    expect(a[0].kind).toBe('table');
    expect(a[0].sources).toHaveLength(2);
    expect(a[0].sources?.[0].url).toBe(cite.url);
  });
  it('plan → one api checklist', () => {
    const a = marketingPlanArtifacts({ theme: 'dev-demand', signals: [], plan: [plan, { ...plan, idea: 'b' }] });
    expect(a).toHaveLength(1);
    expect(a[0].provenance).toBe('api');
    expect(a[0].kind).toBe('checklist');
  });
  it('both return [] when empty', () => {
    const f = { theme: 'dev-demand', signals: [], plan: [] };
    expect(marketingSignalArtifacts(f)).toEqual([]);
    expect(marketingPlanArtifacts(f)).toEqual([]);
  });
});
