import { describe, it, expect } from 'vitest';
import { DEPARTMENTS, DEPT_ZONE_BOUNDS, type DeptId } from './departments';
import { ROOM_W } from '@/lib/iso/engine';

describe('department layout', () => {
  it('has six departments with cyb second (right of CEO)', () => {
    expect(DEPARTMENTS).toHaveLength(6);
    expect(DEPARTMENTS[0].id).toBe('ceo');
    expect(DEPARTMENTS[1].id).toBe('cyb');
  });

  it('zone bounds do not overlap and fit within ROOM_W', () => {
    const order: DeptId[] = ['ceo', 'cyb', 'mkt', 'rnd', 'ops', 'fin'];
    for (let i = 0; i < order.length; i++) {
      const z = DEPT_ZONE_BOUNDS[order[i]];
      expect(z.x1).toBeLessThanOrEqual(ROOM_W);
      if (i > 0) {
        const prev = DEPT_ZONE_BOUNDS[order[i - 1]];
        expect(z.x0).toBeGreaterThan(prev.x1);
      }
    }
  });
});
