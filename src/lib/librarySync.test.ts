import { describe, it, expect, vi, afterEach } from 'vitest';
import { pushLibrarySync } from './librarySync';

const repo = { pushSyncLog: vi.fn(async () => {}) } as unknown as import('./redis').RedisRepo;
afterEach(() => { vi.restoreAllMocks(); delete process.env.LIBRARY_SYNC_URL; delete process.env.LIBRARY_SYNC_SECRET; });

describe('pushLibrarySync', () => {
  it('no-ops when env is unset', async () => {
    const r = await pushLibrarySync('fin-2026-06-17-x', repo);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/not configured/i);
  });
  it('posts to the Library and logs success on 2xx', async () => {
    process.env.LIBRARY_SYNC_URL = 'https://kb.example/api/sync';
    process.env.LIBRARY_SYNC_SECRET = 'secret';
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    const r = await pushLibrarySync('fin-2026-06-17-x', repo);
    expect(fetchMock).toHaveBeenCalledWith('https://kb.example/api/sync', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
    }));
    expect(r.ok).toBe(true);
    expect(repo.pushSyncLog).toHaveBeenCalled();
  });
  it('is fail-soft on non-2xx (resolves, ok=false)', async () => {
    process.env.LIBRARY_SYNC_URL = 'https://kb.example/api/sync';
    process.env.LIBRARY_SYNC_SECRET = 'secret';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response));
    const r = await pushLibrarySync('fin-2026-06-17-x', repo);
    expect(r.ok).toBe(false);
  });
});
