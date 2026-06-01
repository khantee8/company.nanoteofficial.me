import { Redis } from '@upstash/redis';
import type { DeptId } from '@/lib/data/departments';
import type { AgentStatus, AgentOutput, FeedEvent, HistoryEntry, DigestEntry } from './agents/types';

const FEED_KEY = 'feed:events';
const FEED_CAP = 50;
const HISTORY_CAP = 7;
const DIGEST_KEY = 'company:digest';
const DIGEST_CAP = 25;

export interface RedisClientLike {
  set(key: string, value: unknown): Promise<unknown>;
  get<T = unknown>(key: string): Promise<T | null>;
  lpush(key: string, value: unknown): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>;
}

export function makeRedisRepo(client: RedisClientLike) {
  return {
    async setStatus(s: AgentStatus) { await client.set(`agent:${s.dept}:status`, s); },
    async getStatus(dept: DeptId): Promise<AgentStatus> {
      const v = await client.get<AgentStatus>(`agent:${dept}:status`);
      return v ?? { dept, state: 'idle', lastRun: null };
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
  };
}

export type RedisRepo = ReturnType<typeof makeRedisRepo>;

let _repo: RedisRepo | null = null;
export function getRepo(): RedisRepo {
  if (!_repo) _repo = makeRedisRepo(Redis.fromEnv() as unknown as RedisClientLike);
  return _repo;
}
