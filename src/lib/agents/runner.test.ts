import { describe, it, expect, vi } from 'vitest';
import { runAgent, parseHighlight, parseFlags, buildContext } from './runner';
import type { AgentRunResult } from './types';
import type { RedisRepo } from '@/lib/redis';

function fakeRepo() {
  return {
    setStatus: vi.fn(async () => {}),
    getStatus: vi.fn(async () => ({ dept: 'fin' as const, state: 'idle' as const, lastRun: null })),
    setOutput: vi.fn(async () => {}),
    getOutput: vi.fn(async () => null),
    pushEvent: vi.fn(async () => {}),
    getFeed: vi.fn(async () => []),
    pushHistory: vi.fn(async () => {}),
    getHistory: vi.fn(async () => []),
    pushDigest: vi.fn(async () => {}),
    getDigest: vi.fn(async () => []),
  } as unknown as RedisRepo;
}

describe('runAgent', () => {
  it('runs, stores output, pushes feed, notifies, sets done', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    const run = vi.fn(async (): Promise<AgentRunResult> => ({
      markdown: '# x\n\n## Highlight\nKey takeaway here.\n\n## Flags\n- Check deploy',
      summary: 's',
      feedMsg: 'did x',
    }));

    await runAgent({ dept: 'fin', run }, { repo, notify });

    expect(repo.setStatus).toHaveBeenCalledWith(expect.objectContaining({ dept: 'fin', state: 'running' }));
    expect(repo.setOutput).toHaveBeenCalledWith(expect.objectContaining({ dept: 'fin' }));
    expect(repo.pushEvent).toHaveBeenCalledWith(expect.objectContaining({ dept: 'fin', msg: 'did x' }));
    expect(repo.pushHistory).toHaveBeenCalledWith(expect.objectContaining({ dept: 'fin', highlight: 'Key takeaway here.' }));
    expect(repo.pushDigest).toHaveBeenCalledWith(expect.objectContaining({ dept: 'fin', flags: ['Check deploy'] }));
    expect(notify).toHaveBeenCalledOnce();
    expect(repo.setStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'done', summary: 's' }));
  });

  it('on error sets error state, notifies, does not store output', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    const run = vi.fn(async (): Promise<AgentRunResult> => { throw new Error('boom'); });

    await expect(runAgent({ dept: 'rnd', run }, { repo, notify })).rejects.toThrow('boom');

    expect(repo.setOutput).not.toHaveBeenCalled();
    expect(repo.pushHistory).not.toHaveBeenCalled();
    expect(repo.setStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'error', error: 'boom' }));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('failed'));
  });
});

describe('parseHighlight', () => {
  it('extracts highlight section', () => {
    const md = '# Report\nStuff\n\n## Highlight\nThis is the key point.\n\n## Flags\n- none';
    expect(parseHighlight(md)).toBe('This is the key point.');
  });

  it('returns empty string when no highlight section', () => {
    expect(parseHighlight('# Just a report\nNo sections')).toBe('');
  });
});

describe('parseFlags', () => {
  it('extracts flag items', () => {
    const md = '# Report\n\n## Flags\n- Deploy blocked\n- Check API keys\n- Review budget';
    expect(parseFlags(md)).toEqual(['Deploy blocked', 'Check API keys', 'Review budget']);
  });

  it('handles "None" flag', () => {
    const md = '## Flags\nNone.';
    expect(parseFlags(md)).toEqual(['None.']);
  });

  it('returns empty array when no flags section', () => {
    expect(parseFlags('no flags here')).toEqual([]);
  });
});

describe('buildContext', () => {
  it('builds context with history and digest', async () => {
    const repo = fakeRepo();
    (repo.getHistory as ReturnType<typeof vi.fn>).mockResolvedValue([
      { dept: 'fin', date: '2026-05-31', summary: 'tracked 5 assets', highlight: 'BTC up 3%', markdown: '...' },
    ]);
    (repo.getDigest as ReturnType<typeof vi.fn>).mockResolvedValue([
      { dept: 'rnd', date: '2026-05-31', summary: 'trend brief', highlight: 'AI agents growing', flags: [] },
      { dept: 'fin', date: '2026-05-31', summary: 'tracked 5', highlight: 'BTC up', flags: ['watch ETH'] },
    ]);

    const ctx = await buildContext('fin', repo);
    expect(ctx.ownHistory).toHaveLength(1);
    expect(ctx.companyDigest).toHaveLength(1);
    expect(ctx.companyDigest[0].dept).toBe('rnd');
  });
});

describe('buildContext run order', () => {
  it('exposes cyb as an earlier-run peer to later departments', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const repo = {
      getHistory: vi.fn(async () => []),
      getDigest: vi.fn(async () => []),
      getStatus: vi.fn(async (d: string) => ({
        dept: d, state: 'done', lastRun: d === 'cyb' ? `${today}T10:00:00Z` : null,
      })),
      getOutput: vi.fn(async (d: string) =>
        d === 'cyb'
          ? { dept: 'cyb', markdown: '## Highlight\nThreat up.\n\n## Flags\n- Patch Foo', summary: 'cyb sum', ts: today }
          : null,
      ),
    } as unknown as RedisRepo;

    const ctx = await buildContext('ops', repo);
    expect(ctx.todayPeers.some((p) => p.dept === 'cyb')).toBe(true);
  });
});
