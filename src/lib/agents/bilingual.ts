// v1.4.1 — agents dual-generate their narrative in Thai then English, separated
// by a hard delimiter, with the shared `json findings` block + `## Highlight` /
// `## Flags` footer appearing ONCE after both narratives. `splitBilingual`
// reconstructs two clean, self-contained per-language documents that each still
// carry the shared tail, so parseHighlight / parseFlags / extractFindingsBlock
// keep working unchanged on either language.

/** Delimiter the persona emits between the Thai and English narratives. */
export const EN_DELIMITER = '<!-- ===EN=== -->';

// The shared tail = everything from the findings block OR the Highlight footer
// onward (whichever comes first). It is language-neutral (findings JSON) /
// English-headed (footer) and belongs to both documents.
const TAIL_RE = /(\n```json\s+findings|\n##\s+Highlight)/i;

function splitTail(text: string): { body: string; tail: string } {
  const m = text.match(TAIL_RE);
  if (!m || m.index === undefined) return { body: text.trim(), tail: '' };
  return { body: text.slice(0, m.index).trim(), tail: text.slice(m.index).trim() };
}

const join = (body: string, tail: string) => (tail ? `${body}\n\n${tail}` : body);

/**
 * The narrative only — strips the shared `json findings` block + Highlight/Flags
 * footer for clean display. Highlight/flags render in their own UI, so the
 * Analysis pane should show just the prose (and avoid mixing a Thai footer into
 * an English document).
 */
export function narrativeOf(markdown: string): string {
  return splitTail(markdown ?? '').body;
}

/**
 * Split a dual-generated report into clean `{ th, en }` documents.
 * - No delimiter → the model didn't comply; both languages = the whole input.
 * - Empty English narrative → fall back to the Thai document.
 * Never throws.
 */
export function splitBilingual(markdown: string): { th: string; en: string } {
  // Split the shared tail off FIRST, then look for the narrative delimiter in
  // the body only: the head's own Highlight/Flags sections are bilingual (they
  // carry internal EN delimiters), so on a truncated report — which ends before
  // the narrative's delimiter — searching the full document splits inside the
  // tail and discards the whole findings/Highlight/Flags head.
  const { body, tail } = splitTail(markdown ?? '');
  const idx = body.indexOf(EN_DELIMITER);
  if (idx === -1) {
    const doc = join(body, tail);
    return { th: doc, en: doc };
  }

  const thBody = body.slice(0, idx).trim();
  const enBody = body.slice(idx + EN_DELIMITER.length).trim();

  const th = join(thBody, tail);
  const en = enBody ? join(enBody, tail) : th;
  return { th, en };
}

// v1.5.0 — agents EMIT the machine-readable head first (findings → Highlight →
// Flags → ---) so truncation can't destroy it, but storage keeps the legacy
// narrative-first layout. Normalized once on ingest (runner.ts), so every
// downstream consumer — splitBilingual, narrativeOf, dashboards, exports, and
// all pre-v1.5 KB entries — keeps seeing one canonical shape.
const HEAD_SEP_RE = /\n---[ \t]*(\n|$)/;

export function normalizeReportOrder(raw: string): string {
  const text = (raw ?? '').replace(/\r\n/g, '\n').trim();
  // The head should START the report, but web_search agents sometimes emit an
  // "I'll search…" preamble first, so the findings block isn't at position 0.
  // Locate it wherever it is and drop anything before it (the preamble is noise,
  // never part of the report). A plain startsWith guard here would leave the head
  // ahead of the narrative and splitBilingual would store only the preamble.
  const headStart = text.search(/```json\s+findings/);
  if (headStart === -1) return text;
  const flagsIdx = text.search(/\n##\s+Flags/i);
  if (flagsIdx === -1) return text;
  const sep = text.slice(flagsIdx).match(HEAD_SEP_RE);
  if (!sep || sep.index === undefined) return text;
  const head = text.slice(headStart, flagsIdx + sep.index).trim();
  const body = text.slice(flagsIdx + sep.index + sep[0].length).trim();
  if (!body) return text;
  return `${body}\n\n${head}`;
}
