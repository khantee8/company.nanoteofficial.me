import { describe, it, expect } from 'vitest';
import { parseCyberxFindings, cyberxAdvisoryArtifacts } from './cyberx';

const cite = { url: 'https://nvd.example/CVE', title: 'NVD', date: '2026-06-03' };
const item = { cve: 'CVE-2026-1', severity: 'high' as const, kev: true, summary: 's', mitigation: 'patch', citation: cite };

describe('parseCyberxFindings', () => {
  it('keeps items with a cve and citation', () => {
    const md = '```json findings\n' + JSON.stringify({ items: [item] }) + '\n```';
    expect(parseCyberxFindings(md)?.items).toHaveLength(1);
  });
  it('drops items missing a citation', () => {
    const md = '```json findings\n' + JSON.stringify({ items: [{ ...item, citation: undefined }] }) + '\n```';
    expect(parseCyberxFindings(md)?.items).toHaveLength(0);
  });
  it('drops items with an invalid severity', () => {
    const md = '```json findings\n' + JSON.stringify({ items: [{ ...item, severity: 'informational' }] }) + '\n```';
    expect(parseCyberxFindings(md)?.items).toHaveLength(0);
  });
  it('drops items missing a cve', () => {
    const md = '```json findings\n' + JSON.stringify({ items: [{ ...item, cve: undefined }] }) + '\n```';
    expect(parseCyberxFindings(md)?.items).toHaveLength(0);
  });
  it('returns empty items when items is not an array', () => {
    const md = '```json findings\n' + JSON.stringify({ items: 'oops' }) + '\n```';
    expect(parseCyberxFindings(md)).toEqual({ items: [] });
  });
  it('returns null when no findings block', () => {
    expect(parseCyberxFindings('nope')).toBeNull();
  });
});

describe('cyberxAdvisoryArtifacts', () => {
  it('builds a web·cited advisory table from 2 items', () => {
    const a = cyberxAdvisoryArtifacts({ items: [item, { ...item, cve: 'CVE-2026-2' }] });
    expect(a).toHaveLength(1);
    expect(a[0].provenance).toBe('web');
    expect(a[0].kind).toBe('table');
    expect(a[0].sources).toHaveLength(2);
    expect(a[0].sources?.[0].url).toBe(cite.url);
  });
  it('returns [] when no items', () => {
    expect(cyberxAdvisoryArtifacts({ items: [] })).toEqual([]);
  });
});
