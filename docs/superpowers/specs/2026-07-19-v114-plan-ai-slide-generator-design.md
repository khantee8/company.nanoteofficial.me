# v1.14.0 — `/plan` AI Slide Generator (design)

**Date:** 2026-07-19
**Status:** Approved design → implementation plan next
**Ships as:** v1.14.0 (minor), base-deployment to production
**Future:** module is built self-contained so it can be lifted to `plan.nanoteofficial.me` later — no coupling to the office-sim internals.

## Problem

Turning a written project plan into a presentation is manual and slow, and naive
AI slide generators produce recognizably "AI-generated" decks (bullet walls,
filler phrases, uniform layouts). We want a one-click generator inside the
company app that produces **bespoke, human-quality** decks from a plan, with full
transparency into how each deck was built, versioned per plan, exportable to
PPTX/PDF, and cost-bounded.

## Scope (v1)

A new, admin-gated `/plan` module. Create plans; one-click-generate a slide deck
per plan through a 4-step quality pipeline; view the chain-of-thought;
version every generation; export PPTX/PDF.

Requirement coverage: (1) per-plan AI-Slide button, (2) Sonnet via API key,
(3) dedicated `src/lib/slides/` generation module + `pptxgenjs` export,
(4) pre-generate wizard (theme/slides/audience/context), (5) Manus-inspired UX,
(6) per-plan version history + PPTX/PDF export, (7) anti-AI-slop quality gate,
(8) step-by-step review + chain-of-thought transparency, (9) bounded cost,
(10) production launch via base-deployment.

## Architecture

### Data model — Neon Postgres, new `src/lib/planDb.ts`

Mirrors the `kbDb.ts` contract exactly: `@neondatabase/serverless`, raw SQL,
fail-soft reads (`null`/`[]` + `console.warn` on outage), throwing writes,
`makeMemoryPlanStore()` test fake, idempotent DDL in `db/plan-schema.sql`.

- **`plan`** — `id text pk, title text, brief text, audience text,
  created_at timestamptz, updated_at timestamptz`. One row = one "project".
- **`deck_version`** — `id text pk, plan_id text fk, version_no int,
  deck_json jsonb, meta_json jsonb, created_at timestamptz`.
  History = `SELECT ... WHERE plan_id=$1 ORDER BY version_no DESC`.
  `meta_json` holds: theme, slide count, model, token/cost ledger, and the
  full CoT trace (per-step notes, lint findings, slides revised, references added).

DDL applied via a one-shot `Bearer $CRON_SECRET` route
`POST /api/plan/migrate` (same pattern as `/api/admin/migrate-kb`; delete in a
follow-up release once run in prod).

### Routes & auth

Reuse `verifySession(ADMIN_COOKIE)` server-side gate (identical to `/admin`).
No middleware — page gates in the server component, every API route re-checks.

- **Pages:** `/plan` (list + create), `/plan/[id]` (detail: brief, AI-Slide
  button, deck viewer, version switcher, export).
- **API (cookie-gated):**
  - `GET/POST /api/plan` — list / create plan
  - `GET /api/plan/[id]` — plan + latest deck + version list
  - `POST /api/plan/[id]/generate` — run pipeline; **streams** step notes (SSE)
    then persists a new `deck_version`
  - `GET /api/plan/[id]/export?fmt=pptx|pdf&v=<n>` — export a version
  - `POST /api/plan/migrate` — one-shot DDL (`Bearer $CRON_SECRET`)

### Generation pipeline — `src/lib/slides/`

Interactive **synchronous Sonnet** calls (NOT the Message-Batch path — that path
is for unattended cron agents; this is a user waiting on a button). Reuses the
`claude.ts` Anthropic client; model pinned to `claude-sonnet-5` via
`applyOverrides({ model })`. Four steps, **all always run** (full pipeline, no
skip), each emitting a note to the live transparency stream:

1. **Outline** (`outline.ts`) — Sonnet turns brief + audience + slide count into a
   narrative arc (problem → insight → evidence → ask). Small `max_tokens`.
2. **Draft** (`draft.ts`) — Sonnet fills the outline into a **validated JSON deck**
   (`deck.ts` schema). Malformed JSON → one repair retry, then fail with a clear
   error surfaced to the UI.
3. **Anti-slop linter** (`slopLint.ts`) — pure, deterministic, **free**,
   unit-tested. Per-slide flags for:
   - banned filler phrases (curated list: "in today's fast-paced world",
     "leverage synergies", "it's not just X, it's Y", "at the end of the day",
     "game-changer", "revolutionize", …)
   - em-dash density above threshold
   - bullet walls (>5 bullets, or bullets with near-identical length/parallel
     structure)
   - layout monotony (same layout >2 slides in a row)
   - evidence-free slides (no number/proper noun/specific token traceable to the
     brief)
   Returns `LintReport { slideId, issues[] }[]`.
4. **Critic-revise** (`critic.ts`) — one Sonnet pass that revises **only flagged
   slides** against the lint report + a rubric ("reads like a human-made
   Stripe/McKinsey deck: specific, varied, evidence-led, no filler"). Unflagged
   slides pass through untouched (bounds cost).

The trace (each step's notes, flagged/fixed slides, references the model cites)
is assembled by `pipeline.ts` and stored in `meta_json` → rendered as the
chain-of-thought view.

### Slide model + renderer

`Deck = { theme: ThemeId; slides: Slide[] }`. `Slide` is a discriminated union of
~7 hand-designed layouts: `title`, `agenda`, `section`, `bulletsVisual`,
`quote`, `data`, `comparison`, `closing`. `data` slides reuse the existing
hand-rolled SVG chart primitives in `components/charts/`. React renderer switches
on `slide.layout` — same shape as `ArtifactRenderer`. Zero new render deps.

"Not templated" is bought by a small design system: a real type scale, generous
spacing, and **3 curated themes** (not stock PowerPoint palettes), each a plain
CSS-variable set:
- **Midnight Deck** — dark, high-contrast, one vivid accent, mono labels (tech keynote).
- **Editorial Mono** — off-white, near-black, one restrained accent, generous whitespace (essay-like).
- **Bold Grid** — Swiss grid, heavy uppercase type, black + one loud accent (design-forward).

### Export

- **PPTX** — `pptxgenjs` (one pure-JS dependency, no headless browser; Vercel
  Hobby-safe). A `pptx.ts` mapper walks the JSON deck → native slides
  (title/body/shapes; charts as generated SVG → image). Unit-tested mapping.
- **PDF** — client-side `window.print()` over the rendered React deck with a
  dedicated `@media print` stylesheet (one slide per page, backgrounds forced).
  No puppeteer, no dependency. Fidelity depends on print CSS — acceptable for v1.

### UX flow — Manus-inspired

- **Plan list** (`/plan`): cards per plan + "New plan" (title + brief + audience).
- **Plan detail** (`/plan/[id]`): brief on the left; prominent one-click
  **"✦ AI Slide"** button.
- **Wizard** (opens from the button): theme · slide count · audience (prefilled) ·
  optional extra context. Shows a **pre-generate cost estimate** ("~N slides,
  est. $0.0X") before the click.
- **Live generation panel — Manus split (two-pane):** left pane streams the 4
  pipeline steps in real time (outline forming → drafting → lint findings → fixes
  applied) as a visible "thinking" trace; right pane shows the deck materializing
  slide-by-slide as it's generated. Transparency and result visible at once. The
  left pane persists as the permanent audit trail (#8).
- **Deck view**: rendered deck + version switcher + PPTX/PDF export + a
  "quality checks" summary (which slop checks passed / what the critic fixed).

Bilingual TH/EN via the existing `i18n/` seam (labels only; deck body follows the
brief's language).

### Cost management (#9)

- Model pinned to Sonnet, but **bounded**: each pipeline step has its own
  `max_tokens` ceiling; the critic touches only flagged slides.
- **Pre-generate estimate** from slide count × per-step budgets, shown in the
  wizard so cost is chosen per plan before the one click.
- Token/cost ledger written into each `deck_version.meta_json` using the
  existing `cost.ts` pricing (Sonnet, standard synchronous rate — not the batch
  rate; these are interactive calls).

## Deployment

Ships as **v1.14.0** via the `base-deployment` skill (vibe-code → verify →
version bump → Vercel prod confirm), on a `feat/v114-plan-slides` branch, merged
to `main`.

- New dependency: `pptxgenjs`.
- New env: none beyond existing `ANTHROPIC_API_KEY` + `DATABASE_URL`
  (+ `CRON_SECRET` already set, gates the one-shot migrate route).
- `next.config.ts` `outputFileTracingIncludes` unaffected (no new
  read-at-runtime brief files).
- Post-deploy: run `POST /api/plan/migrate` once to apply DDL.

## Testing

Pure units (Vitest, repo convention):
- `slopLint.test.ts` — the load-bearing anti-AI-slop rules (each rule + a clean
  slide that must pass).
- `deck.test.ts` — schema validation (accept valid deck, reject malformed).
- `pptx.test.ts` — JSON deck → pptxgenjs mapping (slide counts, layout mapping).
- `planDb` exercised via `makeMemoryPlanStore()` in route tests.

No visual unit tests for the renderer/wizard — verify via dev server +
screenshots (repo convention for canvas/chart UI).

## Out of scope (v1, YAGNI)

Multi-user / public access; real-time collaborative editing; AI image
generation; the `plan.nanoteofficial.me` subdomain move (future); template
marketplace; drag-to-reorder slide editor (v1 edits by regenerate + inline text
tweak); PPTX round-trip import.

## Open risks

- **PDF fidelity** via print CSS is browser-dependent; if it proves too rough in
  verification, fall back to exporting PPTX only for v1 and revisit PDF with a
  render service later.
- **Streaming step notes** on Vercel functions: use SSE from a Node runtime
  route; if streaming is fragile on Hobby, degrade to polling a Redis-backed
  progress key (the generation still completes; only the live trace changes).
