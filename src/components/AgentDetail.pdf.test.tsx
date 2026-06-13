import { describe, it, expect } from 'vitest';
import { buildPdfDoc } from './AgentDetail';
import type { Citation } from '@/lib/agents/types';

// Fresh standalone HTML document — mirrors the window.document buildPdfDoc fills.
const freshDoc = () => document.implementation.createHTMLDocument('test');

// A stand-in for the live .agent-art-grid: a div with K child "chart" nodes.
function fakeChartsEl(k: number): HTMLDivElement {
  const grid = document.createElement('div');
  for (let i = 0; i < k; i++) {
    const art = document.createElement('section');
    art.className = 'agent-art';
    art.setAttribute('data-i', String(i));
    grid.appendChild(art);
  }
  return grid;
}

describe('buildPdfDoc', () => {
  it('renders the title as <h1>', () => {
    const d = freshDoc();
    buildPdfDoc(d, { title: 'Finance', narrative: '' });
    const h1 = d.querySelector('h1');
    expect(h1?.textContent).toBe('Finance');
  });

  it('renders the verdict box when highlight is present, omits it otherwise', () => {
    const withH = freshDoc();
    buildPdfDoc(withH, { title: 'T', narrative: '', highlight: 'Buy fund X' });
    expect(withH.querySelector('.pdf-verdict')?.textContent).toBe('Buy fund X');

    const without = freshDoc();
    buildPdfDoc(without, { title: 'T', narrative: '' });
    expect(without.querySelector('.pdf-verdict')).toBeNull();
  });

  it('renders one <li> per flag, omits the block when empty', () => {
    const d = freshDoc();
    buildPdfDoc(d, { title: 'T', narrative: '', flags: ['a', 'b', 'c'] });
    const items = d.querySelectorAll('.pdf-flags li');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('a');

    const empty = freshDoc();
    buildPdfDoc(empty, { title: 'T', narrative: '', flags: [] });
    expect(empty.querySelector('.pdf-flags')).toBeNull();
  });

  it('clones (not moves) each chart child into .pdf-charts', () => {
    const d = freshDoc();
    const grid = fakeChartsEl(2);
    buildPdfDoc(d, { title: 'T', narrative: '', chartsEl: grid });
    const clones = d.querySelectorAll('.pdf-charts .agent-art');
    expect(clones.length).toBe(2);
    // originals remain parented to the source grid (clone, not move)
    expect(grid.querySelectorAll('.agent-art').length).toBe(2);
    // distinct node instances
    expect(clones[0]).not.toBe(grid.children[0]);
  });

  it('omits .pdf-charts when chartsEl is null or empty', () => {
    const nul = freshDoc();
    buildPdfDoc(nul, { title: 'T', narrative: '', chartsEl: null });
    expect(nul.querySelector('.pdf-charts')).toBeNull();

    const empty = freshDoc();
    buildPdfDoc(empty, { title: 'T', narrative: '', chartsEl: fakeChartsEl(0) });
    expect(empty.querySelector('.pdf-charts')).toBeNull();
  });

  it('renders sources with hrefs + date, omits the block when empty', () => {
    const d = freshDoc();
    const sources: Citation[] = [
      { url: 'https://a.test', title: 'A', date: '2026-06-01' },
      { url: 'https://b.test', title: '', date: '' },
    ];
    buildPdfDoc(d, { title: 'T', narrative: '', sources });
    const links = d.querySelectorAll('.pdf-sources a');
    expect(links.length).toBe(2);
    expect(links[0].getAttribute('href')).toBe('https://a.test');
    expect(links[0].textContent).toBe('A');
    // falls back to url as text when title empty
    expect(links[1].textContent).toBe('https://b.test');
    // date span only when date present
    expect(d.querySelector('.pdf-sources')?.textContent).toContain('2026-06-01');

    const empty = freshDoc();
    buildPdfDoc(empty, { title: 'T', narrative: '', sources: [] });
    expect(empty.querySelector('.pdf-sources')).toBeNull();
  });

  it('renders a javascript: source as plain text, never as a clickable href', () => {
    const d = freshDoc();
    buildPdfDoc(d, { title: 'T', narrative: '', sources: [
      { url: 'javascript:alert(1)', title: 'Bad', date: '2026-06-01' },
    ] });
    const li = d.querySelector('.pdf-sources li');
    expect(li?.querySelector('a')).toBeNull();           // no anchor
    expect(li?.textContent).toContain('Bad');             // still shows the label
    expect(d.body.innerHTML).not.toContain('javascript:'); // no js url emitted
  });

  it('renders the narrative markdown and does NOT include a raw "## Highlight" head', () => {
    const d = freshDoc();
    buildPdfDoc(d, { title: 'T', narrative: '## Section\n\nBody text.' });
    const heads = Array.from(d.querySelectorAll('h2')).map((h) => h.textContent);
    expect(heads).toContain('Section');
    expect(d.body.textContent).toContain('Body text.');
    expect(d.body.textContent).not.toContain('Highlight');
  });
});
