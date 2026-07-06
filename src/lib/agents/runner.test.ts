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
    pushKb: vi.fn(async () => {}),
    getKb: vi.fn(async () => []),
    listKb: vi.fn(async () => []),
    recordUsage: vi.fn(async () => {}),
    getUsageSince: vi.fn(async () => []),
    pushSyncLog: vi.fn(async () => {}),
  } as unknown as RedisRepo;
}

describe('runAgent', () => {
  it('runs, stores output, pushes feed, notifies, sets done', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    const artifacts = [{ kind: 'tags' as const, title: 't', tags: ['btc'] }];
    const run = vi.fn(async (): Promise<AgentRunResult> => ({
      markdown: '# x\n\n## Highlight\nKey takeaway here.\n\n## Flags\n- Check deploy',
      summary: 's',
      feedMsg: 'did x',
      artifacts,
      tags: ['btc'],
    }));

    await runAgent({ dept: 'fin', run }, { repo, notify });

    expect(repo.setStatus).toHaveBeenCalledWith(expect.objectContaining({ dept: 'fin', state: 'running' }));
    expect(repo.setOutput).toHaveBeenCalledWith(expect.objectContaining({ dept: 'fin', category: 'market-brief', tags: ['btc'], artifacts }));
    expect(repo.pushEvent).toHaveBeenCalledWith(expect.objectContaining({ dept: 'fin', msg: 'did x' }));
    expect(repo.pushHistory).toHaveBeenCalledWith(expect.objectContaining({ dept: 'fin', highlight: 'Key takeaway here.' }));
    expect(repo.pushDigest).toHaveBeenCalledWith(expect.objectContaining({ dept: 'fin', flags: ['Check deploy'] }));
    expect(repo.pushKb).toHaveBeenCalledWith(expect.objectContaining({
      dept: 'fin', category: 'market-brief', status: 'draft', tags: ['btc'], artifacts,
      highlight: 'Key takeaway here.', flags: ['Check deploy'],
    }));
    expect(repo.pushKb).toHaveBeenCalledWith(expect.objectContaining({ id: expect.stringMatching(/^fin:/) }));
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

  it('normalizes head-first (v1.5) output into the legacy storage layout', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    const head = '```json findings\n{}\n```\n\n## Highlight\nHead verdict.\n\n## Flags\n- Follow up\n\n---';
    const run = vi.fn(async (): Promise<AgentRunResult> => ({
      markdown: `${head}\n\nรายงานไทย\n\n<!-- ===EN=== -->\n\nEnglish body`,
      summary: 's', feedMsg: 'm',
    }));

    await runAgent({ dept: 'fin', run }, { repo, notify });

    const stored = (repo.setOutput as ReturnType<typeof vi.fn>).mock.calls[0][0] as { markdown: string };
    expect(stored.markdown.startsWith('รายงานไทย')).toBe(true);
    expect(stored.markdown.indexOf('## Highlight')).toBeGreaterThan(stored.markdown.indexOf('รายงานไทย'));
    expect(repo.pushHistory).toHaveBeenCalledWith(expect.objectContaining({ highlight: 'Head verdict.' }));
    expect(repo.pushDigest).toHaveBeenCalledWith(expect.objectContaining({ flags: ['Follow up'] }));
  });

  it('stores both languages of highlight and flags from a bilingual head', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    const head =
      '```json findings\n{}\n```\n\n## Highlight\nสรุปไทย\n<!-- ===EN=== -->\nEnglish verdict.\n\n' +
      '## Flags\n- ใช่\n<!-- ===EN=== -->\n- Yes follow up\n\n---';
    const run = vi.fn(async (): Promise<AgentRunResult> => ({
      markdown: `${head}\n\nรายงานไทย\n\n<!-- ===EN=== -->\n\nEnglish body`,
      summary: 's', feedMsg: 'm',
    }));

    await runAgent({ dept: 'fin', run }, { repo, notify });

    expect(repo.pushDigest).toHaveBeenCalledWith(expect.objectContaining({
      highlight: 'สรุปไทย', highlightEn: 'English verdict.',
      flags: ['ใช่'], flagsEn: ['Yes follow up'],
    }));
    expect(repo.pushKb).toHaveBeenCalledWith(expect.objectContaining({
      highlightEn: 'English verdict.', flagsEn: ['Yes follow up'],
    }));
  });

  it('sends a second notify for a critical alert', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    const run = vi.fn(async (): Promise<AgentRunResult> => ({
      markdown: '# x\n\n## Highlight\nh\n\n## Flags\n- f',
      summary: 's', feedMsg: 'm',
      alert: { severity: 'critical', text: '🔴 OPS ALERT\nระบบ: FIN' },
    }));

    await runAgent({ dept: 'ops', run }, { repo, notify });

    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenLastCalledWith(expect.stringContaining('OPS ALERT'));
  });

  it('sends only one notify when there is no alert', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    const run = vi.fn(async (): Promise<AgentRunResult> => ({
      markdown: '# x\n\n## Highlight\nh\n\n## Flags\n- f',
      summary: 's', feedMsg: 'm',
    }));

    await runAgent({ dept: 'ops', run }, { repo, notify });

    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe('runAgent — v1.11 role branch', () => {
  const citedResult = (over: Partial<AgentRunResult> = {}): AgentRunResult => ({
    markdown: '# x\n\n## Highlight\nH.\n\n## Flags\n- f',
    summary: 's', feedMsg: 'm',
    sources: [{ url: 'https://a', title: 'A', date: '2026-07-01' }],
    ...over,
  });

  it('backend dept (ceo) never writes KB', async () => {
    const repo = fakeRepo();
    await runAgent({ dept: 'ceo', run: async () => citedResult() }, { repo, notify: vi.fn(async () => {}) });
    expect(repo.pushKb).not.toHaveBeenCalled();
    expect(repo.setOutput).toHaveBeenCalled(); // /admin still gets the report
  });

  it('frontend dept publishing: clean cited run → status published', async () => {
    const repo = fakeRepo();
    await runAgent({ dept: 'cyb', run: async () => citedResult() }, { repo, notify: vi.fn(async () => {}) });
    expect(repo.pushKb).toHaveBeenCalledWith(expect.objectContaining({ status: 'published' }));
  });

  it('frontend dept gate fail (incomplete) → status draft, no Library sync', async () => {
    const repo = fakeRepo();
    await runAgent({ dept: 'cyb', run: async () => citedResult({ incomplete: true }) }, { repo, notify: vi.fn(async () => {}) });
    expect(repo.pushKb).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
    expect(repo.pushSyncLog).not.toHaveBeenCalled();
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

  it('returns the English half of a bilingual highlight when lang=en', () => {
    const md = '## Highlight\nสรุปภาษาไทย\n<!-- ===EN=== -->\nEnglish verdict.\n\n## Flags\nNone.';
    expect(parseHighlight(md, 'en')).toBe('English verdict.');
    expect(parseHighlight(md, 'th')).toBe('สรุปภาษาไทย');
    expect(parseHighlight(md)).toBe('สรุปภาษาไทย'); // no-arg = Thai (legacy)
  });

  it('falls back to the Thai half for lang=en when there is no delimiter', () => {
    const md = '## Highlight\nThai only verdict\n\n## Flags\nNone.';
    expect(parseHighlight(md, 'en')).toBe('Thai only verdict');
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

  it('returns the English bullets of bilingual flags when lang=en', () => {
    const md = '## Flags\n- ก ข ค\n- ง จ\n<!-- ===EN=== -->\n- Alpha\n- Beta';
    expect(parseFlags(md, 'en')).toEqual(['Alpha', 'Beta']);
    expect(parseFlags(md, 'th')).toEqual(['ก ข ค', 'ง จ']);
    expect(parseFlags(md)).toEqual(['ก ข ค', 'ง จ']); // no-arg = Thai (legacy)
  });

  it('falls back to the Thai bullets for lang=en when there is no delimiter', () => {
    const md = '## Flags\n- only one list';
    expect(parseFlags(md, 'en')).toEqual(['only one list']);
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
      getUsageSince: vi.fn(async () => []),
    } as unknown as RedisRepo;

    const ctx = await buildContext('ops', repo);
    expect(ctx.todayPeers.some((p) => p.dept === 'cyb')).toBe(true);
  });
});

describe('buildContext ops snapshot', () => {
  it('populates statuses + slim output health for ops', async () => {
    const repo = {
      getHistory: vi.fn(async () => []),
      getDigest: vi.fn(async () => [
        { dept: 'fin', date: '2026-06-14', summary: 's', highlight: 'h', flags: ['watch'] },
      ]),
      getStatus: vi.fn(async (d: string) => ({
        dept: d, state: d === 'fin' ? 'error' : 'done', lastRun: '2026-06-14T00:00:00Z',
        error: d === 'fin' ? 'boom' : undefined,
      })),
      getOutput: vi.fn(async (d: string) =>
        d === 'fin'
          ? { dept: 'fin', markdown: 'x', summary: '', ts: '2026-06-14T00:00:00Z',
              artifacts: [], incomplete: true, meta: { stopReason: 'max_tokens' } }
          : { dept: d, markdown: 'x', summary: 'ok', ts: '2026-06-14T00:00:00Z',
              artifacts: [{ kind: 'tags', title: 't', tags: ['a'] }] },
      ),
      getUsageSince: vi.fn(async () => []),
    } as unknown as RedisRepo;

    const ctx = await buildContext('ops', repo);
    expect(ctx.companySnapshot).toBeDefined();
    const fin = ctx.companySnapshot!.outputs!.find((o) => o.dept === 'fin')!;
    expect(fin).toMatchObject({ incomplete: true, stopReason: 'max_tokens', artifactCount: 0, hasSummary: false });
    expect(ctx.companySnapshot!.statuses.length).toBeGreaterThan(0);
  });
});
