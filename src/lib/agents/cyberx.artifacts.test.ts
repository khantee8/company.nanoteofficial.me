import { describe, it, expect } from 'vitest';
import { cyberxArtifacts, cyberxTags } from './cyberx';
import type { KevEntry } from '@/lib/sources/threatintel';

const kev: KevEntry[] = [
  { cveId: 'CVE-2026-1', vendorProject: 'Ivanti', product: 'Connect', vulnerabilityName: 'Remote Code Execution', dateAdded: '2026-06-01', shortDescription: 'rce' },
  { cveId: 'CVE-2026-2', vendorProject: 'Fortinet', product: 'FortiOS', vulnerabilityName: 'Path Traversal', dateAdded: '2026-06-02', shortDescription: 'info leak' },
  { cveId: 'CVE-2026-3', vendorProject: 'Ivanti', product: 'Connect', vulnerabilityName: 'Authentication Bypass', dateAdded: '2026-06-02', shortDescription: 'x' },
];

describe('cyberxArtifacts', () => {
  it('buckets a coarse severity donut from keyword heuristic', () => {
    const donut = cyberxArtifacts(kev).find((a) => a.kind === 'donut');
    if (donut && donut.kind === 'donut') {
      // RCE + Auth Bypass => 2 high; Path Traversal => 1 medium
      expect(donut.series.map((s) => [s.label, s.value])).toEqual([['high', 2], ['medium', 1]]);
    } else {
      throw new Error('no donut');
    }
  });

  it('builds a new-CVE-per-day trend from dateAdded, ascending', () => {
    const line = cyberxArtifacts(kev).find((a) => a.kind === 'line');
    if (line && line.kind === 'line') {
      expect(line.points).toEqual([{ t: '06-01', value: 1 }, { t: '06-02', value: 2 }]);
    } else {
      throw new Error('no line');
    }
  });

  it('builds a CVE table', () => {
    const table = cyberxArtifacts(kev).find((a) => a.kind === 'table');
    if (table && table.kind === 'table') {
      expect(table.columns).toEqual(['CVE', 'product', 'added']);
      expect(table.rows[0]).toEqual(['CVE-2026-1', 'Ivanti Connect', '2026-06-01']);
    } else {
      throw new Error('no table');
    }
  });

  it('survives an empty feed', () => {
    expect(() => cyberxArtifacts([])).not.toThrow();
  });

  it('tags KEV charts as api provenance', () => {
    const a = cyberxArtifacts(kev);
    expect(a.every((x) => x.provenance === 'api')).toBe(true);
  });
});

describe('cyberxTags', () => {
  it('returns lowercased CVE IDs and vendors, deduped', () => {
    expect(cyberxTags(kev)).toEqual(['cve-2026-1', 'ivanti', 'cve-2026-2', 'fortinet', 'cve-2026-3']);
  });
});
