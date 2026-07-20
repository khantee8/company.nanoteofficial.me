import { describe, it, expect } from 'vitest';
import { makeMemoryPlanStore } from './planDb';

describe('PlanStore (memory)', () => {
  it('creates and lists plans newest-first', async () => {
    const s = makeMemoryPlanStore();
    const a = await s.createPlan({ title: 'A', brief: 'x', audience: 'board' });
    const b = await s.createPlan({ title: 'B', brief: 'y', audience: 'team' });
    const list = await s.listPlans();
    expect(list.map((p) => p.id)).toEqual([b.id, a.id]);
    expect(await s.getPlan(a.id)).toMatchObject({ title: 'A', audience: 'board' });
  });

  it('appends deck versions with incrementing version_no', async () => {
    const s = makeMemoryPlanStore();
    const p = await s.createPlan({ title: 'P', brief: '', audience: '' });
    const v1 = await s.addVersion(p.id, { theme: 'midnight', slides: [] }, { model: 'm' });
    const v2 = await s.addVersion(p.id, { theme: 'editorial', slides: [] }, {});
    expect([v1.versionNo, v2.versionNo]).toEqual([1, 2]);
    expect((await s.listVersions(p.id)).map((v) => v.versionNo)).toEqual([2, 1]);
    expect(await s.getVersion(p.id, 1)).toMatchObject({ versionNo: 1 });
  });

  it('getPlan returns null for unknown id', async () => {
    expect(await makeMemoryPlanStore().getPlan('nope')).toBeNull();
  });
});
