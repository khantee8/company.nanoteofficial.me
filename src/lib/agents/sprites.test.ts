// src/lib/agents/sprites.test.ts
import { describe, it, expect } from 'vitest';
import { spriteRects, SPRITE_VIEWBOX_W, SPRITE_VIEWBOX_H } from './sprites';
import { DEPARTMENTS } from '@/lib/data/departments';

describe('chibi sprite data', () => {
  it('viewbox is the 14x18 chibi grid', () => {
    expect([SPRITE_VIEWBOX_W, SPRITE_VIEWBOX_H]).toEqual([14, 18]);
  });
  for (const d of DEPARTMENTS) {
    it(`${d.id} has a substantial in-bounds sprite with valid colors`, () => {
      const rects = spriteRects(d.id);
      expect(rects.length).toBeGreaterThan(20); // chibi detail, not the old 9x11 blob
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(SPRITE_VIEWBOX_W);
        expect(r.y + r.h).toBeLessThanOrEqual(SPRITE_VIEWBOX_H);
        expect(r.fill).toMatch(/^#[0-9a-fA-F]{3,8}$/);
      }
    });
  }
});
