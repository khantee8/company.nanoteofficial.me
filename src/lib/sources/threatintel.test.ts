import { describe, it, expect } from 'vitest';
import { selectKev, parseRss, formatThreatIntel, type KevCatalog } from './threatintel';

describe('selectKev', () => {
  it('sorts by dateAdded desc and slices', () => {
    const raw: KevCatalog = {
      vulnerabilities: [
        { cveID: 'CVE-1', vendorProject: 'A', product: 'p1', vulnerabilityName: 'n1', dateAdded: '2026-05-01', shortDescription: 'd1' },
        { cveID: 'CVE-2', vendorProject: 'B', product: 'p2', vulnerabilityName: 'n2', dateAdded: '2026-06-01', shortDescription: 'd2' },
      ],
    };
    const out = selectKev(raw, 1);
    expect(out).toHaveLength(1);
    expect(out[0].cveId).toBe('CVE-2');
  });
});

describe('parseRss', () => {
  it('extracts item titles and links, including CDATA', () => {
    const xml = `<rss><channel>
      <item><title><![CDATA[Breach at Acme]]></title><link>https://x/1</link></item>
      <item><title>Zero-day in Foo</title><link>https://x/2</link></item>
    </channel></rss>`;
    const out = parseRss(xml, 5);
    expect(out).toEqual([
      { title: 'Breach at Acme', link: 'https://x/1' },
      { title: 'Zero-day in Foo', link: 'https://x/2' },
    ]);
  });

  it('respects the limit', () => {
    const xml = '<item><title>a</title><link>l</link></item>'.repeat(10);
    expect(parseRss(xml, 3)).toHaveLength(3);
  });
});

describe('formatThreatIntel', () => {
  it('renders KEV lines then news lines', () => {
    const lines = formatThreatIntel(
      [{ cveId: 'CVE-9', vendorProject: 'Acme', product: 'Widget', vulnerabilityName: 'RCE', dateAdded: '2026-06-01', shortDescription: 'x' }],
      [{ title: 'Big breach', link: 'l' }],
    );
    expect(lines[0]).toBe('CVE-9 — Acme Widget: RCE (added 2026-06-01)');
    expect(lines[1]).toBe('news: Big breach');
  });
});
