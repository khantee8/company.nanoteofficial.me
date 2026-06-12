import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deploymentsUrl, resolveTeamId, _resetTeamIdCache } from './vercelApi';

describe('deploymentsUrl', () => {
  it('scopes the query to the team when a teamId is known', () => {
    const url = deploymentsUrl('company.nanoteofficial.me', 'team_123');
    expect(url).toContain('app=company.nanoteofficial.me');
    expect(url).toContain('teamId=team_123');
  });

  it('omits teamId when none is resolved (personal-scoped token)', () => {
    const url = deploymentsUrl('company.nanoteofficial.me', null);
    expect(url).not.toContain('teamId');
  });
});

describe('resolveTeamId', () => {
  const realFetch = global.fetch;
  beforeEach(() => _resetTeamIdCache());
  afterEach(() => { global.fetch = realFetch; });

  it('resolves the first team id and caches it', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ teams: [{ id: 'team_abc' }] }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await resolveTeamId('tok')).toBe('team_abc');
    expect(await resolveTeamId('tok')).toBe('team_abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null (and caches it) when the teams endpoint fails', async () => {
    global.fetch = vi.fn(async () => ({ ok: false })) as unknown as typeof fetch;
    expect(await resolveTeamId('tok')).toBeNull();
  });
});
