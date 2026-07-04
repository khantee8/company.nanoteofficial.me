import type { Citation } from './artifacts';

/** Extract and JSON-parse the model's ```json findings block. Returns null if
 *  the block is absent or unparseable — the run still ships its narrative.
 *
 *  Tolerant of two observed model drifts (R&D in prod, 2026-07-02) that
 *  otherwise silently discard every finding: a plain ```json fence instead of
 *  ```json findings, and the payload wrapped in a top-level { findings: … }
 *  key. No dept schema has its own `findings` field, so unwrapping is safe. */
export function extractFindingsBlock<T>(markdown: string): T | null {
  const m =
    markdown.match(/```json\s+findings\s*\n([\s\S]*?)\n```/i) ??
    markdown.match(/```json\s*\n([\s\S]*?)\n```/i);
  if (!m) return null;
  try {
    const parsed: unknown = JSON.parse(m[1]);
    if (parsed && typeof parsed === 'object' && 'findings' in parsed) {
      const inner = (parsed as { findings: unknown }).findings;
      if (inner && typeof inner === 'object') return inner as T;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

/** A web-sourced figure is only trustworthy if it carries a real citation. */
export function hasCitation(x: { citation?: Partial<Citation> }): boolean {
  return !!x.citation?.url && !!x.citation?.date;
}
