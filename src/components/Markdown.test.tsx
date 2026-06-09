import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from './Markdown';

const html = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

describe('Markdown', () => {
  it('renders headings, lists and paragraphs', () => {
    const out = html('# Title\n\nA paragraph.\n\n- one\n- two');
    expect(out).toContain('Title');
    expect((out.match(/<li/g) ?? []).length).toBe(2);
    expect(out).toContain('A paragraph.');
  });

  it('renders a pipe table as a real <table>, not raw pipe text', () => {
    const md = [
      '| Fund | TER% | 1Y% |',
      '|---|---|---|',
      '| A | 0.5 | 8 |',
      '| B | 0.9 | 5 |',
    ].join('\n');
    const out = html(md);
    expect(out).toContain('<table');
    expect((out.match(/<th[ >]/g) ?? []).length).toBe(3); // header cells (not <thead>)
    expect((out.match(/<tr[ >]/g) ?? []).length).toBe(3); // header + 2 body rows
    expect(out).toContain('Fund');
    expect(out).toContain('0.9');
    // the |---| divider row must not leak into the output
    expect(out).not.toContain('---');
  });

  it('renders **bold** inline as <strong>, not literal asterisks', () => {
    const out = html('A **กองคุ้มที่สุด** here');
    expect(out).toMatch(/<strong[^>]*>กองคุ้มที่สุด<\/strong>/);
    expect(out).not.toContain('**');
  });
});
