import { Redis } from '@upstash/redis';
import type { DeptId } from '@/lib/data/departments';
import { DEPARTMENTS } from '@/lib/data/departments';
import type { AgentStatus, AgentOutput, FeedEvent, HistoryEntry, DigestEntry, KbEntry, UsageEntry } from './agents/types';
import { CATEGORY_BY_DEPT } from './agents/artifacts';
import { focusKey } from './telegram';
import type { FocusSession } from './telegram';
import type { SyncLogEntry } from './librarySync';

export interface SweepLogEntry { dept: DeptId; ok: boolean; detail: string; ts: number }

const FEED_KEY = 'feed:events';
const FEED_CAP = 50;
const USAGE_KEY = 'usage:ledger';
const USAGE_CAP = 1000; // ~months of runs at the current cadence; window-filtered on read
const SYNCLOG_KEY = 'library:synclog';
const SYNCLOG_CAP = 20;
const SWEEPLOG_KEY = 'ops:sweeplog';
const SWEEPLOG_CAP = 50;
const HISTORY_CAP = 7;
const DIGEST_KEY = 'company:digest';
const DIGEST_CAP = 25;
// Knowledge base: entries are individually addressable (`kb:entry:<id>`) with a
// newest-first id index (`kb:index`) so a single entry can be published /
// archived / pinned / deleted. `kb:entries` is the pre-v1.3 flat list, read as a
// fallback and normalized on the fly until it ages out.
const KB_INDEX = 'kb:index';
const KB_LEGACY = 'kb:entries';
const KB_CAP = 300;
const kbKey = (id: string) => `kb:entry:${id}`;
const retriedKey = (dept: DeptId, date: string) => `agent:retried:${dept}:${date}`;

export interface KbQuery {
  status?: KbEntry['status'];
  dept?: DeptId;
  category?: KbEntry['category'];
  pinned?: boolean;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export type KbPatch = Partial<Pick<KbEntry, 'status' | 'tags' | 'pinned' | 'category' | 'theme'>>;

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Stable public slug for an entry: <dept>-<theme|category>-<date>. */
export function deriveSlug(e: { dept: DeptId; date?: string; ts?: string; theme?: string; category?: KbEntry['category'] }): string {
  const date = e.date ?? (e.ts ? e.ts.slice(0, 10) : '');
  const mid = (e.theme ? slugify(e.theme) : '') || (e.category ?? CATEGORY_BY_DEPT[e.dept]);
  return `${e.dept}-${mid}-${date}`;
}

/** Fill any fields missing on a pre-v1.3/v1.4 (or partial) KB record. */
export function normalizeKbEntry(raw: Partial<KbEntry> & { dept: DeptId; ts: string }): KbEntry {
  const date = raw.date ?? raw.ts.slice(0, 10);
  const category = raw.category ?? CATEGORY_BY_DEPT[raw.dept];
  return {
    id: raw.id ?? `${raw.dept}:${raw.ts}`,
    slug: raw.slug ?? deriveSlug({ dept: raw.dept, date, theme: raw.theme, category }),
    dept: raw.dept,
    date,
    ts: raw.ts,
    category,
    theme: raw.theme,
    tags: raw.tags ?? [],
    status: raw.status ?? 'published',
    pinned: raw.pinned,
    summary: raw.summary ?? '',
    highlight: raw.highlight ?? '',
    // Pre-v1.5.1 entries are single-language; serve the Thai text for EN too.
    highlightEn: raw.highlightEn ?? raw.highlight ?? '',
    flags: raw.flags ?? [],
    flagsEn: raw.flagsEn ?? raw.flags ?? [],
    artifacts: raw.artifacts ?? [],
    sources: raw.sources ?? [],
    provenance: raw.provenance ?? 'api',
    related: raw.related ?? [],
    markdown: raw.markdown ?? '',
    // Pre-v1.4.1 entries are single-language; serve the same text for EN.
    markdownEn: raw.markdownEn ?? raw.markdown ?? '',
  };
}

function matchesKbQuery(e: KbEntry, q: KbQuery): boolean {
  if (q.status && e.status !== q.status) return false;
  if (q.dept && e.dept !== q.dept) return false;
  if (q.category && e.category !== q.category) return false;
  if (typeof q.pinned === 'boolean' && Boolean(e.pinned) !== q.pinned) return false;
  if (q.from && e.date < q.from) return false;
  if (q.to && e.date > q.to) return false;
  if (q.q) {
    const needle = q.q.toLowerCase();
    const hay = `${e.summary} ${e.highlight} ${e.markdown} ${e.tags.join(' ')}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

export interface RedisClientLike {
  set(key: string, value: unknown, options?: unknown): Promise<unknown>;
  get<T = unknown>(key: string): Promise<T | null>;
  del(...keys: string[]): Promise<unknown>;
  mget<T = unknown>(keys: string[]): Promise<(T | null)[]>;
  lpush(key: string, value: unknown): Promise<number>;
  lrem(key: string, count: number, value: unknown): Promise<unknown>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>;
}

// A run hard-killed by the platform (function timeout is 300s) never reaches the
// runner's catch, leaving `running` stuck in Redis. Normalize on read: anything
// `running` for longer than this was interrupted.
export const STALE_RUNNING_MS = 15 * 60_000;

export function normalizeStatus(s: AgentStatus, nowMs = Date.now()): AgentStatus {
  if (s.state !== 'running') return s;
  const startedMs = s.lastRun ? Date.parse(s.lastRun) : NaN;
  if (Number.isFinite(startedMs) && nowMs - startedMs <= STALE_RUNNING_MS) return s;
  return { ...s, state: 'error', error: 'run interrupted (timed out before completing)' };
}

export function makeRedisRepo(client: RedisClientLike) {
  const repo = {
    async setStatus(s: AgentStatus) { await client.set(`agent:${s.dept}:status`, s); },
    async getStatus(dept: DeptId): Promise<AgentStatus> {
      const v = await client.get<AgentStatus>(`agent:${dept}:status`);
      return v ? normalizeStatus(v) : { dept, state: 'idle', lastRun: null };
    },
    async setOutput(o: AgentOutput) { await client.set(`agent:${o.dept}:output`, o); },
    async getOutput(dept: DeptId): Promise<AgentOutput | null> {
      return (await client.get<AgentOutput>(`agent:${dept}:output`)) ?? null;
    },
    async pushEvent(e: FeedEvent) {
      await client.lpush(FEED_KEY, e);
      await client.ltrim(FEED_KEY, 0, FEED_CAP - 1);
    },
    async getFeed(limit = FEED_CAP): Promise<FeedEvent[]> {
      return await client.lrange<FeedEvent>(FEED_KEY, 0, limit - 1);
    },
    async pushHistory(entry: HistoryEntry) {
      const key = `agent:${entry.dept}:history`;
      await client.lpush(key, entry);
      await client.ltrim(key, 0, HISTORY_CAP - 1);
    },
    async getHistory(dept: DeptId): Promise<HistoryEntry[]> {
      return await client.lrange<HistoryEntry>(`agent:${dept}:history`, 0, HISTORY_CAP - 1);
    },
    async pushDigest(entry: DigestEntry) {
      await client.lpush(DIGEST_KEY, entry);
      await client.ltrim(DIGEST_KEY, 0, DIGEST_CAP - 1);
    },
    async getDigest(): Promise<DigestEntry[]> {
      return await client.lrange<DigestEntry>(DIGEST_KEY, 0, DIGEST_CAP - 1);
    },
    async recordUsage(entry: UsageEntry) {
      await client.lpush(USAGE_KEY, entry);
      await client.ltrim(USAGE_KEY, 0, USAGE_CAP - 1);
    },
    async getUsageSince(sinceTs: number): Promise<UsageEntry[]> {
      const all = await client.lrange<UsageEntry>(USAGE_KEY, 0, USAGE_CAP - 1);
      return all.filter((e) => e && typeof e.ts === 'number' && e.ts >= sinceTs);
    },
    async setAgentDisabled(dept: DeptId, disabled: boolean) {
      if (disabled) await client.set(`agent:disabled:${dept}`, '1');
      else await client.del(`agent:disabled:${dept}`);
    },
    async isAgentDisabled(dept: DeptId): Promise<boolean> {
      return (await client.get<string>(`agent:disabled:${dept}`)) === '1';
    },
    async getDisabledDepts(): Promise<DeptId[]> {
      const flags = await Promise.all(
        DEPARTMENTS.map(async (d) => ((await client.get<string>(`agent:disabled:${d.id}`)) === '1' ? d.id : null)),
      );
      return flags.filter((d): d is DeptId => d !== null);
    },
    async pushKb(entry: KbEntry) {
      await client.set(kbKey(entry.id), entry);
      await client.lpush(KB_INDEX, entry.id);
      await client.ltrim(KB_INDEX, 0, KB_CAP - 1);
    },
    async getKbEntry(id: string): Promise<KbEntry | null> {
      const v = await client.get<KbEntry>(kbKey(id));
      return v ? normalizeKbEntry(v) : null;
    },
    async updateKbEntry(id: string, patch: KbPatch): Promise<KbEntry | null> {
      const cur = await client.get<KbEntry>(kbKey(id));
      if (!cur) return null;
      const next = normalizeKbEntry({ ...cur, ...patch });
      await client.set(kbKey(id), next);
      return next;
    },
    async deleteKbEntry(id: string) {
      await client.del(kbKey(id));
      await client.lrem(KB_INDEX, 0, id);
    },
    async listKb(opts: KbQuery = {}): Promise<KbEntry[]> {
      const ids = await client.lrange<string>(KB_INDEX, 0, KB_CAP - 1);
      let entries: KbEntry[];
      if (ids.length > 0) {
        const raw = await client.mget<KbEntry>(ids.map(kbKey));
        entries = raw.filter((e): e is KbEntry => e != null).map(normalizeKbEntry);
      } else {
        // Pre-v1.3 fallback: the flat list, normalized on read.
        const legacy = await client.lrange<KbEntry>(KB_LEGACY, 0, KB_CAP - 1);
        entries = legacy.map(normalizeKbEntry);
      }
      const filtered = entries.filter((e) => matchesKbQuery(e, opts));
      return typeof opts.limit === 'number' ? filtered.slice(0, opts.limit) : filtered;
    },
    /** Find a PUBLISHED entry by slug, with its graph neighbours resolved.
     *  Related = same dept+theme (series) ∪ shared-tag ∪ explicit entry.related. */
    async getKbBySlug(slug: string): Promise<{ entry: KbEntry; related: KbEntry[] } | null> {
      const all = await repo.listKb({ status: 'published' });
      const entry = all.find((e) => e.slug === slug);
      if (!entry) return null;
      const relatedIds = new Set(entry.related);
      const related = all.filter((e) => {
        if (e.id === entry.id) return false;
        if (relatedIds.has(e.id)) return true;
        if (entry.theme && e.dept === entry.dept && e.theme === entry.theme) return true; // series
        if (e.tags.some((t) => entry.tags.includes(t))) return true;                       // tag graph
        return false;
      }).slice(0, 12);
      return { entry, related };
    },
    async setFocus(chatId: string | number, s: FocusSession) { await client.set(focusKey(chatId), s); },
    async getFocus(chatId: string | number): Promise<FocusSession | null> {
      return (await client.get<FocusSession>(focusKey(chatId))) ?? null;
    },
    async clearFocus(chatId: string | number) { await client.del(focusKey(chatId)); },
    async pushSyncLog(e: SyncLogEntry) {
      await client.lpush(SYNCLOG_KEY, e);
      await client.ltrim(SYNCLOG_KEY, 0, SYNCLOG_CAP - 1);
    },
    async getSyncLog(): Promise<SyncLogEntry[]> {
      return await client.lrange<SyncLogEntry>(SYNCLOG_KEY, 0, SYNCLOG_CAP - 1);
    },
    async markRetried(dept: DeptId, date: string) {
      await client.set(retriedKey(dept, date), '1', { ex: 172800 }); // self-expires after 2 days
    },
    async wasRetriedToday(dept: DeptId, date: string): Promise<boolean> {
      return (await client.get<string>(retriedKey(dept, date))) === '1';
    },
    async pushSweepLog(e: SweepLogEntry) {
      await client.lpush(SWEEPLOG_KEY, e);
      await client.ltrim(SWEEPLOG_KEY, 0, SWEEPLOG_CAP - 1);
    },
    async getSweepLog(): Promise<SweepLogEntry[]> {
      return await client.lrange<SweepLogEntry>(SWEEPLOG_KEY, 0, SWEEPLOG_CAP - 1);
    },
  };
  return repo;
}

export type RedisRepo = ReturnType<typeof makeRedisRepo>;

let _repo: RedisRepo | null = null;
export function getRepo(): RedisRepo {
  if (!_repo) _repo = makeRedisRepo(Redis.fromEnv() as unknown as RedisClientLike);
  return _repo;
}
