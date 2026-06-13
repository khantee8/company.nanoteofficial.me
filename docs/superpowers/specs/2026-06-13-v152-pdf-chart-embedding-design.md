# v1.5.2 — PDF chart embedding + richer deliverable (design spec)

**Status:** Approved design — implementation plan to follow.
**Scope:** Turn `AgentDetail`'s PDF export into a real analyst deliverable. Today it is **title → narrative → footer**; it becomes **title → verdict → flags → charts → narrative → sources → footer**. Shared across all 6 agents.
**Foundation:** Builds on v1.5.1 (bilingual highlight/flags) — the highlight/flags the PDF embeds are already computed with the active `lang`.

---

## 1. Problem

`AgentDetail.tsx`'s `exportPdf(title, markdown)` opens a fresh light-theme window and walks the markdown into a structured DOM (`renderMarkdownToDoc`, `textContent` only — no `dangerouslySetInnerHTML`). Two gaps:

1. **No charts.** The on-screen `ArtifactRenderer` grid (the deterministic, cited charts — the whole point of the dashboard) never reaches the PDF. The exported "report" is narrative-only, so the visual evidence is lost.
2. **Raw head dumped + no summary sections.** `exportPdf` is handed the full `md` (narrative-first storage layout: `[narrative][head]`), so it renders the raw `## Highlight` / `## Flags` / ` ```json findings ` head as trailing markdown. Meanwhile the at-a-glance **verdict**, **flags**, and cited **sources** that the on-screen page shows as structured blocks are absent from the PDF.

## 2. Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| PDF sections to add | **verdict (highlight) + flags + charts + sources** (all three section groups, plus charts) |
| How charts get into the PDF | **Clone the live on-screen chart nodes** (`importNode`) into the print document — real node copy, no `innerHTML`, captures every chart kind (SVG + HTML) and auto-tracks future kinds. |
| How cloned charts are themed | **Dark panels, as-is** — embed each chart faithful to its on-screen dark render inside a dark rounded panel, with `print-color-adjust: exact` so panels + data colors print. **No light remap.** |
| Narrative source | Switch from full `md` to `narrativeOf(md)` — head no longer dumped; structured verdict/flags lead instead. |

### Why dark panels, not a light remap (rejected alternative)

The HTML-based charts (`DataTable`, `Scorecard`, `Heatmap`, `TagCloud`, `Checklist`) use light-on-dark **inline** styles, and they mix *chrome* colors (label text `#7a7ca6`/`#c5c6e2`, tile bg `#0e0e24`) with *meaningful data* colors (status dots green/amber/red, bar `fill`s) on the same CSS properties (`color`/`background`/`fill`). A blanket light remap (`!important` overriding inline styles) can't tell chrome from data, so it would either wash out the meaningful colors or leave dark-on-dark text. Embedding each chart **as-is in a dark panel** sidesteps all of it: the charts render identically to screen, no per-chart-kind CSS, robust to future chart kinds and palette changes. The only requirement is `print-color-adjust: exact` so the browser prints the dark backgrounds and colored marks.

## 3. Component change (`AgentDetail.tsx`)

- Add `const gridRef = useRef<HTMLDivElement>(null)` and attach it to the existing `.agent-art-grid` div (the artifacts grid). When there are no artifacts the grid isn't rendered, so `gridRef.current` is `null` → the charts section is simply omitted.
- The PDF button calls:
  ```ts
  exportPdf(name, narrativeOf(md), {
    highlight,           // already parsed with active lang (v1.5.1)
    flags,               // already parsed with active lang (v1.5.1)
    sources,             // deduped Citation[] already computed
    chartsEl: gridRef.current,
  });
  ```
- `highlight`, `flags`, `sources` already exist as locals in the component (computed with `lang`), so the PDF is bilingual-correct with no extra work. Charts cloned from the live DOM already reflect the active language (chart titles are localized at render time).

## 4. Export function (`exportPdf` + extracted `buildPdfDoc`)

New signature:

```ts
type PdfExtras = {
  highlight?: string;
  flags?: string[];
  sources?: Citation[];
  chartsEl?: HTMLElement | null;
};
function exportPdf(title: string, narrative: string, extras?: PdfExtras): void
```

`exportPdf` keeps its window-opening + print responsibilities. The DOM population is **extracted into a pure, testable function**:

```ts
function buildPdfDoc(d: Document, args: {
  title: string;
  narrative: string;
  highlight?: string;
  flags?: string[];
  sources?: Citation[];
  chartsEl?: HTMLElement | null;
}): void
```

`buildPdfDoc` builds the body in this order (each section conditional — omitted when its data is empty):

1. **`<h1>`** title.
2. **Verdict box** — a `<div class="pdf-verdict">` whose `textContent` is `highlight`. Omitted when `highlight` is falsy.
3. **Flags** — an `<h2>Flags</h2>` + `<ul class="pdf-flags">`, one `<li>` per flag (`textContent`, prefixed `⚑ `). Omitted when `flags` is empty.
4. **Charts** — a `<div class="pdf-charts">`; for each child node of `chartsEl`, `d.importNode(node, true)` and append the clone. Omitted when `chartsEl` is null or has no children. **Real node copy — no `innerHTML`.**
5. **Narrative** — `renderMarkdownToDoc(d, narrative)` (unchanged helper; now fed `narrativeOf(md)`, so no head markdown).
6. **Sources** — an `<h2>Sources</h2>` + `<ul class="pdf-sources">`; each `<li>` an `<a href=c.url>` (`textContent = c.title || c.url`) plus a `— date` span when present. URLs come from validated citations. Omitted when `sources` is empty.
7. **`<footer>`** — unchanged (`NaNote Corp · … · timestamp`).

`exportPdf` then `w.open` → inject `<style>` → `buildPdfDoc(w.document, …)` → `setTimeout(() => w.print(), 350)`.

## 5. Print stylesheet additions

Appended to the existing `<style>` in `exportPdf`:

- `*{ -webkit-print-color-adjust:exact; print-color-adjust:exact }` — so the dark chart panels and colored marks actually print.
- `.pdf-verdict{ background:#eef2fa; border-left:4px solid #1f3a6a; padding:10px 14px; margin:14px 0; font-size:14px; font-style:italic }`
- `.pdf-flags{ margin:8px 0 } .pdf-flags li{ list-style:none; font-size:13px }`
- `.pdf-charts{ display:flex; flex-direction:column; gap:14px; margin:16px 0 }`
- `.pdf-charts .agent-art{ background:#0b0b1e; border:1px solid #2a2a4a; border-radius:8px; padding:12px; color:#dfe0f2; break-inside:avoid }`
- `.pdf-charts svg{ max-width:520px }` — keep `width:100%` SVGs from ballooning to the full page measure.
- `.pdf-sources li{ list-style:none; font-size:12px; margin:3px 0 } .pdf-sources a{ color:#1f3a6a }`

The existing `body`/`h1`/`h2`/`h3`/`table`/`p`/`li`/`footer` rules are unchanged; the dark-panel rules are scoped under `.pdf-charts` so they don't touch the narrative's (light) markdown tables.

## 6. Tests (TDD)

New `AgentDetail.pdf.test.tsx` (jsdom) exercising the extracted `buildPdfDoc` against a fresh `document.implementation.createHTMLDocument()`:

- **Verdict** — given `highlight`, body contains `.pdf-verdict` with that text; omitted when absent.
- **Flags** — given N flags, `.pdf-flags` has N `<li>`; omitted when empty.
- **Charts** — given a `chartsEl` with K child nodes (fake `<div>`s), `.pdf-charts` contains K clones, and they are distinct nodes from the originals (clone, not move — originals still parented to `chartsEl`).
- **Sources** — given citations, `.pdf-sources` has the right count with `href`s; date span present when `date` set; omitted when empty.
- **Narrative** — markdown headings/tables render (reuses `renderMarkdownToDoc` path); the raw `## Highlight` head text is **absent** (proves `narrativeOf` feeds it, not raw `md`).
- **No `innerHTML`** — assert by construction (the test builds nodes; cloning uses `importNode`). Mirrors the existing `textContent`-only discipline.

`buildPdfDoc` must be exported (or test-exported) for this. `exportPdf` itself (window open + print) stays untested, as today.

## 7. Invariants preserved

- **No `dangerouslySetInnerHTML` / no `innerHTML`** — verdict/flags/sources built with `textContent`; charts via `importNode` (node copy, never string parsing).
- **Artifacts never freehand** — charts are cloned from the deterministic `ArtifactRenderer` output; the provenance badge clones along with each chart.
- No new dependencies. No change to on-screen rendering, the MD/JSON/CSV exports, chart components, agents, runner, storage, or `/api/kb`.

## 8. Out of scope (deliberate)

On-screen chart rendering · the MD/JSON/CSV export buttons · any chart-component or `artifacts.ts` change · per-chart light theming (rejected, see §2) · paginating/print-optimizing the narrative beyond `break-inside:avoid` on chart panels · server-side PDF generation.

## 9. Verification

Local: full vitest suite + `tsc --noEmit` + lint. Manual: `npm run dev`, open `/dashboard/<dept>` for a dept with charts (e.g. `fin` or `cyb`), click **⤓ PDF**, print-to-PDF, and confirm — verdict box + flags lead, the dark chart panels render **with** their bar/dot colors (print-color-adjust working), narrative is clean (no raw `## Highlight` head), sources list at the end; repeat with the TH/EN toggle flipped to confirm the verdict/flags/chart titles switch language. `CLAUDE.md` + `package.json` bump to **1.5.2**.
