import { describe, it, expect } from 'vitest';
import { PERSONAS } from './personas';
import { DEPARTMENTS } from '@/lib/data/departments';

describe('personas', () => {
  it('every department persona ends with the mandatory Highlight/Flags contract', () => {
    for (const d of DEPARTMENTS) {
      const p = PERSONAS[d.id];
      expect(p, `${d.id} persona`).toBeTruthy();
      expect(p).toContain('MANDATORY OUTPUT CONTRACT');
      // The two English headers the runner parses must be present, in order.
      const hi = p.indexOf('## Highlight');
      const fl = p.indexOf('## Flags');
      expect(hi).toBeGreaterThan(-1);
      expect(fl).toBeGreaterThan(hi);
    }
  });

  it('every persona instructs emitting a json findings block before the footer', () => {
    for (const p of Object.values(PERSONAS)) {
      expect(p).toMatch(/```json findings/);
      expect(p.indexOf('```json findings')).toBeLessThan(p.indexOf('## Highlight'));
    }
  });

  it('every persona instructs the bilingual TH→EN narrative with the delimiter', () => {
    for (const p of Object.values(PERSONAS)) {
      expect(p).toContain('<!-- ===EN=== -->');
      // The bilingual narrative comes before the findings block + footer.
      expect(p.indexOf('<!-- ===EN=== -->')).toBeLessThan(p.indexOf('## Highlight'));
    }
  });
});
