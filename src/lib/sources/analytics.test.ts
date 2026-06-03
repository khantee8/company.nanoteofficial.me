import { describe, it, expect } from 'vitest';
import { shapeReach, type ReachResponse } from './analytics';

describe('shapeReach', () => {
  it('shapes timeseries data to day/visits points', () => {
    const raw: ReachResponse = { data: [{ key: '2026-06-01', total: 100 }, { key: '2026-06-02', total: 140 }] };
    expect(shapeReach(raw)).toEqual([{ day: '06-01', visits: 100 }, { day: '06-02', visits: 140 }]);
  });

  it('handles a missing/empty payload', () => {
    expect(shapeReach({})).toEqual([]);
  });
});
