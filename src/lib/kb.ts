// src/lib/kb.ts
//
// Read side of the knowledge base. Every agent run archives a KbEntry into
// Redis (`kb:entry:<id>` + `kb:index`, see runner.ts + redis.ts). This is the
// stable seam that kb.nanoteofficial.me will consume later; swap the storage
// underneath without changing this shape or `/api/kb`.
//
// Public reads return PUBLISHED entries only — drafts/archived stay internal to
// the Admin KB Manager (v1.3.1).
import type { RedisRepo } from './redis';
import type { KbEntry } from './agents/types';
import type { DeptId } from './data/departments';

export interface KnowledgeQuery {
  dept?: DeptId;
  category?: KbEntry['category'];
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
}

/** Newest-first PUBLISHED knowledge entries, optionally filtered. */
export async function getKnowledge(repo: RedisRepo, opts: KnowledgeQuery = {}): Promise<KbEntry[]> {
  return repo.listKb({ ...opts, status: 'published' });
}
