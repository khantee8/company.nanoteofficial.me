# v1.5.2 PDF Chart Embedding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `AgentDetail`'s PDF export into a real analyst deliverable — title → verdict → flags → charts → narrative → sources → footer — by cloning the live on-screen chart nodes into the print document.

**Architecture:** Extract the PDF body-population from the untestable `exportPdf` (which opens a window) into a pure `buildPdfDoc(d, args)` that populates any `Document`. It builds structured `textContent`-only sections (verdict/flags/sources) and clones each on-screen chart node via `d.importNode(node, true)` — real node copy, no `innerHTML`. A `useRef` on the existing `.agent-art-grid` gives `exportPdf` the live chart nodes; charts render in dark panels via a print stylesheet with `print-color-adjust: exact`.

**Tech Stack:** React 19, TypeScript, Next.js 16, Vitest + jsdom (`environment: 'jsdom'`, `globals: true`), `react-dom/server` for component test rendering.

---

## File Structure

- **Modify** `src/components/AgentDetail.tsx`:
  - Extract `buildPdfDoc(d, args)` (exported for tests) from `exportPdf`.
  - Change `exportPdf` signature to `exportPdf(title, narrative, extras?)`; it opens the window, injects the (expanded) stylesheet, calls `buildPdfDoc`, prints.
  - Add `useRef` on `.agent-art-grid`; update the PDF button to pass `narrativeOf(md)` + `{ highlight, flags, sources, chartsEl }`.
- **Create** `src/components/AgentDetail.pdf.test.tsx` — jsdom unit tests for `buildPdfDoc`.

`renderMarkdownToDoc` (already in the file), `narrativeOf` (`@/lib/agents/bilingual`), and `Citation` (`@/lib/agents/types`) are already present/imported — no new imports beyond `useRef` from `react`.

---

## Task 1: Extract `buildPdfDoc` and add the new sections

**Files:**
- Modify: `src/components/AgentDetail.tsx` (the `exportPdf` function, currently lines ~110-130, and its imports line ~ top)
- Test: `src/components/AgentDetail.pdf.test.tsx` (create)

This task is TDD: write the test against the not-yet-exported `buildPdfDoc`, watch it fail to import, then implement.

- [ ] **Step 1: Write the failing test**

Create `src/components/AgentDetail.pdf.test.tsx`:

```tsx
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

  it('renders the narrative markdown and does NOT include a raw "## Highlight" head', () => {
    const d = freshDoc();
    buildPdfDoc(d, { title: 'T', narrative: '## Section\n\nBody text.' });
    const heads = Array.from(d.querySelectorAll('h2')).map((h) => h.textContent);
    expect(heads).toContain('Section');
    expect(d.body.textContent).toContain('Body text.');
    expect(d.body.textContent).not.toContain('Highlight');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/AgentDetail.pdf.test.tsx`
Expected: FAIL — `buildPdfDoc` is not exported from `./AgentDetail` (import error / "is not a function").

- [ ] **Step 3: Add the `useRef` import**

In `src/components/AgentDetail.tsx`, the top is currently:

```tsx
'use client';

import { Markdown } from './Markdown';
```

Change the first import block so `useRef` is available (it currently imports no React hooks directly — `useLang` is the only hook). Add at the top of the import list:

```tsx
'use client';

import { useRef } from 'react';
import { Markdown } from './Markdown';
```

- [ ] **Step 4: Replace `exportPdf` with `buildPdfDoc` + a thin `exportPdf`**

Find the current function (lines ~110-130):

```tsx
function exportPdf(title: string, markdown: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const d = w.document;
  const style = d.createElement('style');
  style.textContent =
    `body{font-family:Georgia,'Times New Roman',serif;max-width:760px;margin:36px auto;padding:0 28px;line-height:1.6;color:#111}` +
    `h1{font-size:22px;border-bottom:3px solid #1f3a6a;padding-bottom:8px;margin:0 0 4px}` +
    `h2{font-size:16px;margin:20px 0 6px;color:#1f3a6a}h3{font-size:13px;margin:14px 0 4px}` +
    `table{border-collapse:collapse;width:100%;margin:10px 0;font-size:12px}` +
    `th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}th{background:#eef2fa}` +
    `p,li{font-size:13px}footer{margin-top:28px;color:#888;font-size:11px;border-top:1px solid #ddd;padding-top:8px}`;
  d.head.appendChild(style);
  d.title = `${title} — NaNote Corp`;
  const h1 = d.createElement('h1'); h1.textContent = title; d.body.appendChild(h1);
  renderMarkdownToDoc(d, markdown);
  const footer = d.createElement('footer');
  footer.textContent = `NaNote Corp · company.nanoteofficial.me · ${new Date().toLocaleString()}`;
  d.body.appendChild(footer);
  setTimeout(() => w.print(), 350);
}
```

Replace the whole thing with:

```tsx
export interface PdfArgs {
  title: string;
  narrative: string;
  highlight?: string;
  flags?: string[];
  sources?: Citation[];
  chartsEl?: HTMLElement | null;
}

// Populate a print Document with the analyst deliverable — textContent only for
// the prose blocks (no innerHTML), and importNode clones for the live charts
// (real node copy, never string parsing). Pure + DOM-only so it is unit-testable
// in jsdom without opening a window.
export function buildPdfDoc(d: Document, args: PdfArgs) {
  const { title, narrative, highlight, flags = [], sources = [], chartsEl } = args;

  const h1 = d.createElement('h1'); h1.textContent = title; d.body.appendChild(h1);

  if (highlight) {
    const v = d.createElement('div');
    v.className = 'pdf-verdict';
    v.textContent = highlight;
    d.body.appendChild(v);
  }

  if (flags.length > 0) {
    const h2 = d.createElement('h2'); h2.textContent = 'Flags'; d.body.appendChild(h2);
    const ul = d.createElement('ul'); ul.className = 'pdf-flags';
    for (const f of flags) {
      const li = d.createElement('li'); li.textContent = `⚑ ${f}`; ul.appendChild(li);
    }
    d.body.appendChild(ul);
  }

  const chartNodes = chartsEl ? Array.from(chartsEl.children) : [];
  if (chartNodes.length > 0) {
    const wrap = d.createElement('div'); wrap.className = 'pdf-charts';
    for (const node of chartNodes) wrap.appendChild(d.importNode(node, true));
    d.body.appendChild(wrap);
  }

  renderMarkdownToDoc(d, narrative);

  if (sources.length > 0) {
    const h2 = d.createElement('h2'); h2.textContent = 'Sources'; d.body.appendChild(h2);
    const ul = d.createElement('ul'); ul.className = 'pdf-sources';
    for (const c of sources) {
      const li = d.createElement('li');
      const a = d.createElement('a');
      a.setAttribute('href', c.url);
      a.textContent = c.title || c.url;
      li.appendChild(a);
      if (c.date) {
        const span = d.createElement('span');
        span.textContent = ` — ${c.date}`;
        li.appendChild(span);
      }
      ul.appendChild(li);
    }
    d.body.appendChild(ul);
  }

  const footer = d.createElement('footer');
  footer.textContent = `NaNote Corp · company.nanoteofficial.me · ${new Date().toLocaleString()}`;
  d.body.appendChild(footer);
}

function exportPdf(args: PdfArgs) {
  const w = window.open('', '_blank');
  if (!w) return;
  const d = w.document;
  const style = d.createElement('style');
  style.textContent =
    `*{-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `body{font-family:Georgia,'Times New Roman',serif;max-width:760px;margin:36px auto;padding:0 28px;line-height:1.6;color:#111}` +
    `h1{font-size:22px;border-bottom:3px solid #1f3a6a;padding-bottom:8px;margin:0 0 4px}` +
    `h2{font-size:16px;margin:20px 0 6px;color:#1f3a6a}h3{font-size:13px;margin:14px 0 4px}` +
    `table{border-collapse:collapse;width:100%;margin:10px 0;font-size:12px}` +
    `th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}th{background:#eef2fa}` +
    `p,li{font-size:13px}footer{margin-top:28px;color:#888;font-size:11px;border-top:1px solid #ddd;padding-top:8px}` +
    `.pdf-verdict{background:#eef2fa;border-left:4px solid #1f3a6a;padding:10px 14px;margin:14px 0;font-size:14px;font-style:italic}` +
    `.pdf-flags{margin:8px 0;padding-left:0}.pdf-flags li{list-style:none;font-size:13px}` +
    `.pdf-charts{display:flex;flex-direction:column;gap:14px;margin:16px 0}` +
    `.pdf-charts .agent-art{background:#0b0b1e;border:1px solid #2a2a4a;border-radius:8px;padding:12px;color:#dfe0f2;break-inside:avoid}` +
    `.pdf-charts svg{max-width:520px}` +
    `.pdf-sources{padding-left:0}.pdf-sources li{list-style:none;font-size:12px;margin:3px 0}.pdf-sources a{color:#1f3a6a}`;
  d.head.appendChild(style);
  d.title = `${args.title} — NaNote Corp`;
  buildPdfDoc(d, args);
  setTimeout(() => w.print(), 350);
}
```

Note: `Citation` is already imported at the top of the file (`import type { AgentState, Citation } from '@/lib/agents/types';`). `renderMarkdownToDoc` already exists above this function. No other imports needed.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/AgentDetail.pdf.test.tsx`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add src/components/AgentDetail.tsx src/components/AgentDetail.pdf.test.tsx
git commit -m "feat(dashboard): extract testable buildPdfDoc with verdict/flags/charts/sources

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Wire the live chart grid + new call site

**Files:**
- Modify: `src/components/AgentDetail.tsx` (the `.agent-art-grid` div ~line 184, the PDF button ~line 249)

- [ ] **Step 1: Add the grid ref**

Inside the `AgentDetail` component body, just after `const { t, lang } = useLang();` (line ~141), add:

```tsx
  const gridRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 2: Attach the ref to the existing artifacts grid**

Find (line ~184):

```tsx
      {artifacts.length > 0 ? (
        <div className="agent-art-grid">
```

Change the div to:

```tsx
      {artifacts.length > 0 ? (
        <div className="agent-art-grid" ref={gridRef}>
```

- [ ] **Step 3: Update the PDF button to the new signature**

Find (line ~249):

```tsx
        <button onClick={() => exportPdf(name, md)} disabled={!md} className="agent-exp">⤓ PDF</button>
```

Replace with:

```tsx
        <button
          onClick={() => exportPdf({ title: name, narrative: narrativeOf(md), highlight, flags, sources, chartsEl: gridRef.current })}
          disabled={!md}
          className="agent-exp"
        >⤓ PDF</button>
```

`narrativeOf`, `highlight`, `flags`, `sources` are all already in scope (imported / computed earlier in the component).

- [ ] **Step 4: Type-check, lint, and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors.

Run: `npm test`
Expected: all tests pass (including the new `AgentDetail.pdf.test.tsx`).

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentDetail.tsx
git commit -m "feat(dashboard): PDF export embeds live charts + verdict/flags/sources

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Version bump + docs

**Files:**
- Modify: `package.json` (version)
- Modify: `src/company.nanoteofficial.me/CLAUDE.md` — note this is the project CLAUDE.md at the repo root: `CLAUDE.md`

- [ ] **Step 1: Bump the version**

Run: `npm version 1.5.2 --no-git-tag-version`
Expected: `package.json` version becomes `1.5.2` (the NavBar reads this).

- [ ] **Step 2: Add the v1.5.2 feature paragraph to CLAUDE.md**

In `CLAUDE.md`, find the `**Current version: 1.5.1**` line and change it to `**Current version: 1.5.2**`. Then add a new current-version paragraph immediately before the existing `**v1.5.1 (current) …**` paragraph, and remove `(current)` from the v1.5.1 line. Insert:

```markdown
**v1.5.2 (current) — PDF analyst deliverable (chart embedding).** The per-agent PDF export (`AgentDetail.tsx`) grew from title→narrative→footer into a full deliverable: **title → verdict → flags → charts → narrative → sources → footer**. The body-population was extracted from the window-opening `exportPdf` into a pure, jsdom-testable `buildPdfDoc(d, args)` (`AgentDetail.pdf.test.tsx`). Charts are embedded by **cloning the live on-screen `.agent-art` nodes** (a `useRef` on `.agent-art-grid` → `d.importNode(node, true)`) — a real node copy (no `innerHTML`), so every chart kind (SVG + HTML) is captured and future kinds auto-track. They render as **dark panels** faithful to the on-screen theme, with `print-color-adjust: exact` so panels + bar/dot colors print (a light remap was rejected — chrome and meaningful colors share the same CSS props). Verdict/flags/sources are built `textContent`-only and use the active-`lang` values (v1.5.1), so the PDF is bilingual-correct; the narrative now renders `narrativeOf(md)` instead of dumping the raw head. See `docs/superpowers/specs/2026-06-13-v152-pdf-chart-embedding-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add package.json CLAUDE.md
git commit -m "release: v1.5.2 — PDF analyst deliverable (chart embedding)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Manual Verification (after Task 3)

Not unit-testable (window open + print + visual). Per repo convention, verify with the dev server:

1. `npm run dev`, open `http://localhost:3000/dashboard/fin` (or `cyb` — a dept with charts).
2. Click **⤓ PDF**. In the print dialog, "Save as PDF" (ensure "Background graphics" is on if the browser exposes it — `print-color-adjust:exact` should make it automatic).
3. Confirm: verdict box + `⚑` flags lead the doc; the **dark chart panels render with their bar/dot colors**; the narrative is clean (no raw `## Highlight`/findings head); a Sources list closes the body.
4. Flip the NavBar TH/EN toggle, re-export, confirm the verdict, flags, and chart titles switch language.

---

## Self-Review Notes

- **Spec coverage:** §3 component change → Task 2; §4 `buildPdfDoc`/`exportPdf` → Task 1; §5 stylesheet → Task 1 Step 4; §6 tests → Task 1 Step 1; §9 version/docs → Task 3. All covered.
- **Type consistency:** `PdfArgs`/`buildPdfDoc` defined in Task 1 are used verbatim by the Task 2 call site (`{ title, narrative, highlight, flags, sources, chartsEl }`). `Citation` reused from `types.ts`.
- **No placeholders:** every code step shows full code; commands have expected output.
