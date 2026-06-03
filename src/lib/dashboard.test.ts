import { describe, it, expect } from 'vitest';
import { getDashboardData, emptyDashboard } from './dashboard';
import { makeRedisRepo, type RedisClientLike } from './redis';
import { DEPARTMENTS } from './data/departments';

// Minimal in-memory Redis stand-in covering the methods the repo uses.
function memoryClient(): RedisClientLike {
  const store = new Map<string, unknown>();
  const lists = new Map<string, unknown[]>();
  return {
    async set(key, value) { store.set(key, value); return 'OK'; },
    async get<T>(key: string) { return (store.get(key) as T) ?? null; },
    async lpush(key, value) { const l = lists.get(key) ?? []; l.unshift(value); lists.set(key, l); return l.length; },
    async ltrim() { return 'OK'; },
    async lrange<T>(key: string, start: number, stop: number) {
      const l = (lists.get(key) ?? []) as T[];
      return l.slice(start, stop === -1 ? undefined : stop + 1);
    },
  };
}

describe('getDashboardData', () => {
  it('returns one entry per department, plus digest + timestamp', async () => {
    const repo = makeRedisRepo(memoryClient());
    const data = await getDashboardData(repo);

    expect(data.agents).toHaveLength(DEPARTMENTS.length);
    expect(data.agents.map((a) => a.dept).sort()).toEqual(DEPARTMENTS.map((d) => d.id).sort());
    expect(Array.isArray(data.digest)).toBe(true);
    expect(typeof data.generatedAt).toBe('string');
    // Idle defaults when nothing has run yet
    expect(data.agents.every((a) => a.status.state === 'idle')).toBe(true);
    expect(data.agents.every((a) => a.output === null)).toBe(true);
  });

  it('surfaces stored output + history for a department', async () => {
    const repo = makeRedisRepo(memoryClient());
    const ts = new Date().toISOString();
    await repo.setStatus({ dept: 'ceo', state: 'done', lastRun: ts, summary: 'standup ready' });
    await repo.setOutput({ dept: 'ceo', markdown: '# Standup\n## Highlight\nShipped v1.1', summary: 'standup ready', ts, category: 'exec-brief', tags: [], artifacts: [] });
    await repo.pushHistory({ dept: 'ceo', date: '2026-06-02', summary: 'standup ready', highlight: 'Shipped v1.1', markdown: '...' });

    const data = await getDashboardData(repo);
    const ceo = data.agents.find((a) => a.dept === 'ceo')!;
    expect(ceo.status.state).toBe('done');
    expect(ceo.output?.markdown).toContain('Highlight');
    expect(ceo.history).toHaveLength(1);
  });

  it('emptyDashboard is a safe fallback shape', () => {
    const e = emptyDashboard();
    expect(e.agents).toEqual([]);
    expect(e.digest).toEqual([]);
    expect(typeof e.generatedAt).toBe('string');
  });
});
