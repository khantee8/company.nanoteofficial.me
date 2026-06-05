import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocMarkdown } from './DocMarkdown';

const html = (text: string) => renderToStaticMarkup(<DocMarkdown text={text} />);

describe('DocMarkdown', () => {
  it('renders headings, bold, inline code and lists', () => {
    const out = html('# Title\n\nSome **bold** and `code`.\n\n- one\n- two');
    expect(out).toContain('<h1>Title</h1>');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<code class="doc-code">code</code>');
    expect((out.match(/<li>/g) ?? []).length).toBe(2);
  });

  it('renders safe links with an href and external rel', () => {
    const out = html('see [docs](/doc/overview) and [ext](https://x.com)');
    expect(out).toContain('href="/doc/overview"');
    expect(out).toContain('href="https://x.com"');
    expect(out).toContain('rel="noreferrer"');
  });

  it('refuses a javascript: URL — renders the label as plain text, no anchor', () => {
    const out = html('[click](javascript:alert(1))');
    expect(out).not.toContain('<a ');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('click');
  });

  it('renders fenced code blocks as <pre>', () => {
    const out = html('```\nnpm run build\n```');
    expect(out).toContain('<pre');
    expect(out).toContain('npm run build');
  });
});
