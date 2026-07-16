// KB system of record (v1.13): kb_entry in the shared Neon Postgres.
// Raw SQL via the neon HTTP driver — same pattern as the Library's db.ts.
// Pure helpers up top (unit-tested); the store (network) half is below.
import type { KbEntry } from './agents/types';
import type { KbQuery } from './redis';

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
