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
  const full = markdown ?? '';
  const idx = full.indexOf(EN_DELIMITER);
  if (idx === -1) {
    const doc = full.trim();
    return { th: doc, en: doc };
  }

  const thRaw = full.slice(0, idx);
  const enRaw = full.slice(idx + EN_DELIMITER.length);

  // The shared tail lives in whichever side still contains it (the English side,
  // since the footer/findings follow the English narrative). Pull it from there.
  const { tail } = splitTail(enRaw);
  const thBody = splitTail(thRaw).body;
  const enBody = splitTail(enRaw).body;

  const th = join(thBody, tail);
  const en = enBody ? join(enBody, tail) : th;
  return { th, en };
}
