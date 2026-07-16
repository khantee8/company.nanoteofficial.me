// KB system of record (v1.13): kb_entry in the shared Neon Postgres.
// Raw SQL via the neon HTTP driver — same pattern as the Library's db.ts.
// Pure helpers up top (unit-tested); the store (network) half is below.
import type { KbEntry } from './agents/types';
import type { KbPatch, KbQuery } from './redis';

export const KB_COLUMNS =
  'id, slug, dept, date, ts, category, theme, status, pinned, incomplete, provenance, ' +
  'summary, highlight, highlight_en, flags, flags_en, tags, artifacts, sources, related, ' +
  'markdown, markdown_en';

const dateOnly = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '');
const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : String(v ?? '');

export function rowToKbEntry(r: Record<string, unknown>): KbEntry {
  return {
    id: String(r.id), slug: String(r.slug), dept: r.dept as KbEntry['dept'],
    date: dateOnly(r.date), ts: iso(r.ts),
    category: r.category as KbEntry['category'],
    theme: (r.theme as string | null) ?? undefined,
    status: r.status as KbEntry['status'],
    pinned: Boolean(r.pinned), incomplete: Boolean(r.incomplete),
    provenance: r.provenance as KbEntry['provenance'],
    summary: String(r.summary ?? ''), highlight: String(r.highlight ?? ''),
    highlightEn: String(r.highlight_en ?? ''),
    flags: (r.flags as string[]) ?? [], flagsEn: (r.flags_en as string[]) ?? [],
    tags: (r.tags as string[]) ?? [],
    artifacts: (r.artifacts as KbEntry['artifacts']) ?? [],
    sources: (r.sources as KbEntry['sources']) ?? [],
    related: (r.related as string[]) ?? [],
    markdown: String(r.markdown ?? ''), markdownEn: String(r.markdown_en ?? ''),
  };
}

/** Params in KB_COLUMNS order — pair with PUSH_SQL's $1..$22 placeholders. */
export function entryToParams(e: KbEntry): unknown[] {
  return [
    e.id, e.slug, e.dept, e.date, e.ts, e.category, e.theme ?? null, e.status,
    e.pinned ?? false, e.incomplete ?? false, e.provenance,
    e.summary, e.highlight, e.highlightEn ?? e.highlight,
    JSON.stringify(e.flags), JSON.stringify(e.flagsEn ?? e.flags),
    e.tags, JSON.stringify(e.artifacts), JSON.stringify(e.sources), e.related,
    e.markdown, e.markdownEn ?? e.markdown,
  ];
}

export function buildKbWhere(q: KbQuery): { clauses: string[]; params: unknown[] } {
  const clauses: string[] = []; const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (q.status) clauses.push(`status = ${p(q.status)}`);
  if (q.dept) clauses.push(`dept = ${p(q.dept)}`);
  if (q.category) clauses.push(`category = ${p(q.category)}`);
  if (typeof q.pinned === 'boolean') clauses.push(`pinned = ${p(q.pinned)}`);
  if (q.from) clauses.push(`date >= ${p(q.from)}`);
  if (q.to) clauses.push(`date <= ${p(q.to)}`);
  if (q.q && q.q.trim()) {
    const term = q.q.trim();
    // EN full-text (ranked at query time) OR Thai/any substring via trigram index.
    clauses.push(
      `(search @@ websearch_to_tsquery('english', ${p(term)}) ` +
      `OR (summary || ' ' || highlight || ' ' || markdown) ILIKE ${p(`%${term}%`)})`,
    );
  }
  return { clauses, params };
}

export interface KbStore {
  pushKb(e: KbEntry): Promise<void>;
  getKbEntry(id: string): Promise<KbEntry | null>;
  getKbBySlug(slug: string): Promise<KbEntry | null>;
  updateKbEntry(id: string, patch: KbPatch): Promise<KbEntry | null>;
  deleteKbEntry(id: string): Promise<void>;
  listKb(opts?: KbQuery): Promise<KbEntry[]>;
}

type SqlFn = (text: string, params?: unknown[]) => Promise<unknown>;
async function getSql(): Promise<SqlFn> {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL (or POSTGRES_URL) is not set');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  // neon() returns a tagged template with a .query(text, params) escape hatch.
  return (text, params) => (sql as unknown as { query: SqlFn }).query(text, params ?? []);
}

const PLACEHOLDERS = Array.from({ length: 22 }, (_, i) => `$${i + 1}`).join(', ');
const PUSH_SQL =
  `INSERT INTO kb_entry (${KB_COLUMNS}) VALUES (${PLACEHOLDERS})
   ON CONFLICT (id) DO UPDATE SET
     slug=EXCLUDED.slug, category=EXCLUDED.category, theme=EXCLUDED.theme, status=EXCLUDED.status, pinned=EXCLUDED.pinned,
     incomplete=EXCLUDED.incomplete, summary=EXCLUDED.summary,
     highlight=EXCLUDED.highlight, highlight_en=EXCLUDED.highlight_en,
     flags=EXCLUDED.flags, flags_en=EXCLUDED.flags_en, tags=EXCLUDED.tags,
     artifacts=EXCLUDED.artifacts, sources=EXCLUDED.sources, related=EXCLUDED.related,
     markdown=EXCLUDED.markdown, markdown_en=EXCLUDED.markdown_en, updated_at=now()`;

/**
 * Real Neon-backed store. Missing env / network errors on READS are fail-soft
 * (caught, logged, `null`/`[]` returned) so a DB outage degrades the KB rather
 * than 500ing every route that reads it. WRITE methods propagate errors —
 * fail-soft handling for writes lives in the caller (Task 5).
 */
export function makeKbDbStore(): KbStore {
  const rows = async (text: string, params?: unknown[]) =>
    (await (await getSql())(text, params)) as Record<string, unknown>[];

  // Raw (throwing) read helpers — used internally by writes (e.g. updateKbEntry's
  // pre-read) where an error must propagate rather than be swallowed.
  const rawGetKbEntry = async (id: string): Promise<KbEntry | null> => {
    const r = await rows(`SELECT ${KB_COLUMNS} FROM kb_entry WHERE id = $1`, [id]);
    return r[0] ? rowToKbEntry(r[0]) : null;
  };

  const failSoftRead = async <T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      console.warn(`[kbDb] read failed: ${label}:`, err);
      return fallback;
    }
  };

  return {
    async pushKb(e) { await rows(PUSH_SQL, entryToParams(e)); },
    async getKbEntry(id) {
      return failSoftRead('getKbEntry', null, () => rawGetKbEntry(id));
    },
    async getKbBySlug(slug) {
      return failSoftRead('getKbBySlug', null, async () => {
        const r = await rows(
          `SELECT ${KB_COLUMNS} FROM kb_entry WHERE slug = $1 ORDER BY ts DESC LIMIT 1`, [slug]);
        return r[0] ? rowToKbEntry(r[0]) : null;
      });
    },
    async updateKbEntry(id, patch) {
      const cur = await rawGetKbEntry(id);
      if (!cur) return null;
      const next: KbEntry = { ...cur, ...patch };
      await this.pushKb(next); // upsert
      return next;
    },
    async deleteKbEntry(id) { await rows(`DELETE FROM kb_entry WHERE id = $1`, [id]); },
    async listKb(opts = {}) {
      return failSoftRead('listKb', [] as KbEntry[], async () => {
        const { clauses, params } = buildKbWhere(opts);
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 500) : 100;
        const r = await rows(
          `SELECT ${KB_COLUMNS} FROM kb_entry ${where} ORDER BY ts DESC LIMIT ${limit}`, params);
        return r.map(rowToKbEntry);
      });
    },
  };
}

/** In-memory KbStore for tests — mirrors listKb filter semantics. */
export function makeMemoryKbStore(seed: KbEntry[] = []): KbStore {
  let entries: KbEntry[] = [...seed];
  const matches = (e: KbEntry, q: KbQuery) => {
    if (q.status && e.status !== q.status) return false;
    if (q.dept && e.dept !== q.dept) return false;
    if (q.category && e.category !== q.category) return false;
    if (typeof q.pinned === 'boolean' && Boolean(e.pinned) !== q.pinned) return false;
    if (q.from && e.date < q.from) return false;
    if (q.to && e.date > q.to) return false;
    if (q.q && q.q.trim()) {
      const t = q.q.trim().toLowerCase();
      const hay = `${e.summary} ${e.highlight} ${e.highlightEn ?? ''} ${e.markdown} ${e.markdownEn ?? ''} ${e.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(t)) return false;
    }
    return true;
  };
  return {
    async pushKb(e) { entries = [e, ...entries.filter((x) => x.id !== e.id)]; },
    async getKbEntry(id) { return entries.find((e) => e.id === id) ?? null; },
    async getKbBySlug(slug) {
      const slugMatches = entries.filter((e) => e.slug === slug);
      if (!slugMatches.length) return null;
      // Return newest by ts DESC (same as the real store)
      return slugMatches.sort((a, b) => (a.ts < b.ts ? 1 : -1))[0];
    },
    async updateKbEntry(id, patch) {
      const cur = entries.find((e) => e.id === id);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      entries = entries.map((e) => (e.id === id ? next : e));
      return next;
    },
    async deleteKbEntry(id) { entries = entries.filter((e) => e.id !== id); },
    async listKb(opts = {}) {
      const out = entries
        .filter((e) => matches(e, opts))
        .sort((a, b) => (a.ts < b.ts ? 1 : -1));
      return out.slice(0, opts.limit && opts.limit > 0 ? opts.limit : 100);
    },
  };
}
