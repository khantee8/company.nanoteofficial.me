import { describe, it, expect } from 'vitest';
import { splitBilingual, narrativeOf, EN_DELIMITER } from './bilingual';

const TAIL = '```json findings\n{}\n```\n\n## Highlight\nสรุป\n\n## Flags\nNone.';

describe('splitBilingual', () => {
  it('splits TH and EN narratives and shares the findings+footer tail', () => {
    const md = `รายงานภาษาไทย\n\n${EN_DELIMITER}\n\nEnglish report\n\n${TAIL}`;
    const { th, en } = splitBilingual(md);
    expect(th).toContain('รายงานภาษาไทย');
    expect(th).not.toContain('English report');
    expect(en).toContain('English report');
    expect(en).not.toContain('รายงานภาษาไทย');
    // Both carry the shared tail so the footer/findings parse on either language.
    expect(th).toContain('## Highlight');
    expect(en).toContain('## Highlight');
    expect(th).toContain('```json findings');
    expect(en).toContain('```json findings');
  });

  it('returns identical docs when the delimiter is absent', () => {
    const md = `เนื้อหาเดียว\n\n${TAIL}`;
    const { th, en } = splitBilingual(md);
    expect(th).toBe(en);
    expect(en).toContain('เนื้อหาเดียว');
  });

  it('falls back to the Thai doc when the English narrative is empty', () => {
    const md = `ไทยล้วน\n\n${EN_DELIMITER}\n\n${TAIL}`;
    const { th, en } = splitBilingual(md);
    expect(en).toBe(th);
    expect(en).toContain('ไทยล้วน');
  });

  it('handles a report with no tail (narratives run to the end)', () => {
    const md = `ไทย${'\n\n'}${EN_DELIMITER}\n\nEnglish only`;
    const { th, en } = splitBilingual(md);
    expect(th).toBe('ไทย');
    expect(en).toBe('English only');
  });

  it('never throws on empty input', () => {
    expect(splitBilingual('')).toEqual({ th: '', en: '' });
  });
});

describe('narrativeOf', () => {
  it('strips the findings block and Highlight/Flags footer', () => {
    const md = `English report body\n\n${TAIL}`;
    const out = narrativeOf(md);
    expect(out).toBe('English report body');
    expect(out).not.toContain('## Highlight');
    expect(out).not.toContain('```json findings');
  });

  it('returns the whole text when there is no tail', () => {
    expect(narrativeOf('just prose')).toBe('just prose');
  });
});
