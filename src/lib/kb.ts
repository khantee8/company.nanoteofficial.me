// src/lib/kb.ts
//
// Read side of the knowledge base. Every agent run archives a KbEntry into
// Redis (`kb:entries`, see runner.ts + redis.ts). This is the stable seam that
// kb.nanoteofficial.me will consume later; swap the storage underneath without
// changing this shape or `/api/kb`.
import type { RedisRepo } from './redis';
import type { KbEntry } from './agents/types';
import type { DeptId } from './data/departments';

export interface KnowledgeQuery {
  dept?: DeptId;
  limit?: number;
}

/** Newest-first knowledge entries, optionally filtered by department. */
export async function getKnowledge(repo: RedisRepo, opts: KnowledgeQuery = {}): Promise<KbEntry[]> {
  const all = await repo.getKb();
  const filtered = opts.dept ? all.filter((e) => e.dept === opts.dept) : all;
  return typeof opts.limit === 'number' ? filtered.slice(0, opts.limit) : filtered;
}
