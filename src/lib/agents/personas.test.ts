import { describe, it, expect } from 'vitest';
import { PERSONAS, CHAT_PERSONAS } from './personas';
import { DEPARTMENTS } from '@/lib/data/departments';

describe('personas', () => {
  it('every persona carries the mandatory head contract: findings → Highlight → Flags', () => {
    for (const d of DEPARTMENTS) {
      const p = PERSONAS[d.id];
      expect(p, `${d.id} persona`).toBeTruthy();
      expect(p).toContain('MANDATORY OUTPUT CONTRACT');
      const fence = p.indexOf('```json findings');
      const hi = p.indexOf('## Highlight');
      const fl = p.indexOf('## Flags');
      expect(fence).toBeGreaterThan(-1);
      expect(hi).toBeGreaterThan(fence);
      expect(fl).toBeGreaterThan(hi);
    }
  });

  it('every persona instructs the bilingual narrative with the delimiter', () => {
    for (const p of Object.values(PERSONAS)) {
      expect(p).toContain('<!-- ===EN=== -->');
    }
  });

  it('chat personas carry no report scaffolding', () => {
    for (const d of DEPARTMENTS) {
      const c = CHAT_PERSONAS[d.id];
      expect(c, `${d.id} chat persona`).toBeTruthy();
      expect(c).not.toContain('MANDATORY OUTPUT CONTRACT');
      expect(c).not.toContain('```json findings');
      expect(c).not.toContain('<!-- ===EN=== -->');
    }
  });

  it('the head contract instructs a bilingual Highlight and Flags', () => {
    for (const p of Object.values(PERSONAS)) {
      // Scope the assertion to the head-contract block (from the MANDATORY
      // marker onward) — the bilingual-narrative rule that precedes it already
      // mentions the delimiter, so we must check the head contract itself.
      const headContract = p.slice(p.indexOf('MANDATORY OUTPUT CONTRACT'));
      expect(headContract).toContain('## Highlight');
      expect(headContract).toContain('## Flags');
      expect(headContract).toContain('<!-- ===EN=== -->');
    }
  });
});
