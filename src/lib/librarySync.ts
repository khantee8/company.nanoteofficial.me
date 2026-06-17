import type { RedisRepo } from './redis';

export interface SyncLogEntry { slug: string; ok: boolean; detail: string; ts: number }

/**
 * Fire-and-forget push to the Library's POST /api/sync (idempotent runSync).
 * Fail-soft: never throws — a failed push is logged; the Library's daily cron
 * is the backstop. No-op when env unset (like other optional integrations).
 */
export async function pushLibrarySync(entrySlug: string, repo: RedisRepo): Promise<{ ok: boolean; detail: string }> {
  const url = process.env.LIBRARY_SYNC_URL;
  const secret = process.env.LIBRARY_SYNC_SECRET;
  if (!url || !secret) return { ok: false, detail: 'Library sync not configured' };
  let ok = false; let detail = '';
  try {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
    ok = res.ok; detail = ok ? `synced (${res.status})` : `push failed (${res.status})`;
  } catch (err) {
    detail = `push error: ${err instanceof Error ? err.message : String(err)}`;
  }
  await repo.pushSyncLog({ slug: entrySlug, ok, detail, ts: Date.now() });
  return { ok, detail };
}
