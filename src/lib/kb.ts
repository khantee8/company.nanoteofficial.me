// src/lib/kb.ts
//
// Read side of the knowledge base. Every agent run archives a KbEntry into
// the shared Neon `kb_entry` table (see runner.ts + kbDb.ts; the repo's KB
// methods are delegated there via redis.ts's makeRedisRepo). This is the
// stable seam that kb.nanoteofficial.me also reads; swap the storage
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

/** Single published entry by slug (or id), with graph neighbours resolved.
 *  Powers /api/kb?slug=… for kb.nanoteofficial.me. */
export async function getKnowledgeEntry(
  repo: RedisRepo,
  q: { slug?: string; id?: string },
): Promise<{ entry: KbEntry; related: KbEntry[] } | null> {
  if (q.slug) return repo.getKbBySlug(q.slug);
  if (q.id) {
    const e = await repo.getKbEntry(q.id);
    if (!e || e.status !== 'published') return null;
    return repo.getKbBySlug(e.slug);
  }
  return null;
}
