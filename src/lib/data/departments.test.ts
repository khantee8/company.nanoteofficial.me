import { describe, it, expect } from 'vitest';
import {
  DEPARTMENTS,
  DEPT_ZONE_BOUNDS,
  MEZZANINE_ELEVATION,
  RAISED_DEPTS,
  isRaised,
  type DeptId,
} from './departments';
import { ROOM_W } from '@/lib/iso/engine';

describe('department layout', () => {
  it('has six departments led by the executives (CEO, Finance)', () => {
    expect(DEPARTMENTS).toHaveLength(6);
    expect(DEPARTMENTS[0].id).toBe('ceo');
    expect(DEPARTMENTS[1].id).toBe('fin');
  });

  it('renames marketing and R&D to their real roles', () => {
    const byId = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d]));
    expect(byId.mkt.name).toBe('Marketing & Social Media');
    expect(byId.rnd.name).toBe('AI R&D');
  });

  it('raises only the CEO and Finance onto the 2nd-floor mezzanine', () => {
    for (const d of DEPARTMENTS) {
      const raised = RAISED_DEPTS.includes(d.id);
      expect(isRaised(d.id)).toBe(raised);
      expect(d.elevation).toBe(raised ? MEZZANINE_ELEVATION : 0);
    }
    expect(MEZZANINE_ELEVATION).toBeGreaterThan(0);
  });

  it('keeps zones within ROOM_W and non-overlapping per floor', () => {
    for (const id of Object.keys(DEPT_ZONE_BOUNDS) as DeptId[]) {
      const z = DEPT_ZONE_BOUNDS[id];
      expect(z.x0).toBeGreaterThanOrEqual(0);
      expect(z.x1).toBeLessThanOrEqual(ROOM_W);
      expect(z.x1).toBeGreaterThan(z.x0);
    }
    // 2nd floor: CEO left of Finance
    expect(DEPT_ZONE_BOUNDS.ceo.x1).toBeLessThan(DEPT_ZONE_BOUNDS.fin.x0);
    // Ground floor: cyb → mkt → rnd → ops, left to right, no overlap
    const ground: DeptId[] = ['cyb', 'mkt', 'rnd', 'ops'];
    for (let i = 1; i < ground.length; i++) {
      expect(DEPT_ZONE_BOUNDS[ground[i]].x0).toBeGreaterThan(DEPT_ZONE_BOUNDS[ground[i - 1]].x1);
    }
  });
});
