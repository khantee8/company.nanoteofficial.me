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
});
