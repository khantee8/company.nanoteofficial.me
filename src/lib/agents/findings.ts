import type { Citation } from './artifacts';

/** Extract and JSON-parse the model's ```json findings block. Returns null if
 *  the block is absent or unparseable — the run still ships its narrative. */
export function extractFindingsBlock<T>(markdown: string): T | null {
  const m = markdown.match(/```json\s+findings\s*\n([\s\S]*?)\n```/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as T;
  } catch {
    return null;
  }
}

/** A web-sourced figure is only trustworthy if it carries a real citation. */
export function hasCitation(x: { citation?: Partial<Citation> }): boolean {
  return !!x.citation?.url && !!x.citation?.date;
}
