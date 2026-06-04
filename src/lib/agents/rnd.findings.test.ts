import { describe, it, expect } from 'vitest';
import { parseRndFindings, rndResearchArtifacts, themeForToday } from './rnd';

const cite = { url: 'https://arxiv.example/x', title: 'paper', date: '2026-06-03' };
const item = { name: 'cool-agent', kind: 'repo' as const, why: 'fast', lang: 'TypeScript', citation: cite };

describe('themeForToday', () => {
  it('Tue→agents, Thu→llm-infra, else agents', () => {
    expect(themeForToday(new Date('2026-06-02T12:00:00Z')).theme).toBe('agents');    // Tue
    expect(themeForToday(new Date('2026-06-04T12:00:00Z')).theme).toBe('llm-infra'); // Thu
    expect(themeForToday(new Date('2026-06-07T12:00:00Z')).theme).toBe('agents');    // Sun fallback
  });
});

describe('parseRndFindings', () => {
  it('keeps items with name, valid kind, citation', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'agents', items: [item] }) + '\n```';
    expect(parseRndFindings(md)?.items).toHaveLength(1);
  });
  it('drops items with invalid kind', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'agents', items: [{ ...item, kind: 'tweet' }] }) + '\n```';
    expect(parseRndFindings(md)?.items).toHaveLength(0);
  });
  it('drops items missing a name', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'agents', items: [{ ...item, name: undefined }] }) + '\n```';
    expect(parseRndFindings(md)?.items).toHaveLength(0);
  });
  it('drops items missing citation', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'agents', items: [{ ...item, citation: undefined }] }) + '\n```';
    expect(parseRndFindings(md)?.items).toHaveLength(0);
  });
  it('returns empty items when items not an array', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'agents', items: 'oops' }) + '\n```';
    expect(parseRndFindings(md)).toEqual({ theme: 'agents', items: [] });
  });
  it('returns null when no block', () => {
    expect(parseRndFindings('nope')).toBeNull();
  });
});

describe('rndResearchArtifacts', () => {
  it('builds a web·cited radar table from 2 items', () => {
    const a = rndResearchArtifacts({ theme: 'agents', items: [item, { ...item, name: 'b' }] });
    expect(a).toHaveLength(1);
    expect(a[0].provenance).toBe('web');
    expect(a[0].kind).toBe('table');
    expect(a[0].sources).toHaveLength(2);
    expect(a[0].sources?.[0].url).toBe(cite.url);
  });
  it('returns [] when no items', () => {
    expect(rndResearchArtifacts({ theme: 'agents', items: [] })).toEqual([]);
  });
});
