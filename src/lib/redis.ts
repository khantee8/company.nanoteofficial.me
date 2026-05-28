import { Redis } from '@upstash/redis';
import type { DeptId } from '@/lib/data/departments';
import type { AgentStatus, AgentOutput, FeedEvent } from './agents/types';

const FEED_KEY = 'feed:events';
const FEED_CAP = 50;

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
  };
}

export type RedisRepo = ReturnType<typeof makeRedisRepo>;

let _repo: RedisRepo | null = null;
export function getRepo(): RedisRepo {
  if (!_repo) _repo = makeRedisRepo(Redis.fromEnv() as unknown as RedisClientLike);
  return _repo;
}
