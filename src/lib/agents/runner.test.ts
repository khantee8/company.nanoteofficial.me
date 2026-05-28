import { describe, it, expect, vi } from 'vitest';
import { runAgent } from './runner';
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
  } as unknown as RedisRepo;
}

describe('runAgent', () => {
  it('runs, stores output, pushes feed, notifies, sets done', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    const run = vi.fn(async (): Promise<AgentRunResult> => ({ markdown: '# x', summary: 's', feedMsg: 'did x' }));

    await runAgent({ dept: 'fin', run }, { repo, notify });

    expect(repo.setStatus).toHaveBeenCalledWith(expect.objectContaining({ dept: 'fin', state: 'running' }));
    expect(repo.setOutput).toHaveBeenCalledWith(expect.objectContaining({ dept: 'fin', markdown: '# x' }));
    expect(repo.pushEvent).toHaveBeenCalledWith(expect.objectContaining({ dept: 'fin', msg: 'did x' }));
    expect(notify).toHaveBeenCalledOnce();
    expect(repo.setStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'done', summary: 's' }));
  });

  it('on error sets error state, notifies, does not store output', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    const run = vi.fn(async (): Promise<AgentRunResult> => { throw new Error('boom'); });

    await expect(runAgent({ dept: 'rnd', run }, { repo, notify })).rejects.toThrow('boom');

    expect(repo.setOutput).not.toHaveBeenCalled();
    expect(repo.setStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'error', error: 'boom' }));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('failed'));
  });
});
