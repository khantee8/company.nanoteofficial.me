# v1.4.2 — `/doc` User Guide (GitHub-Docs theme, bilingual)

**Status:** Approved (brainstormed 2026-06-04)
**Depends on:** v1.4.1 (LangProvider + toggle + `messages` dictionary)
**Lives in:** `company.nanoteofficial.me` (this repo)

**Scope:** A built-in **operator's guide** at `/doc` — *how to run and read* the AI company (distinct from the KB, which is *what the agents produce*). GitHub-Docs visual theme (left sidebar nav + content column), content authored as static Markdown files, rendered by the existing **safe `Markdown` component**. **Bilingual**, driven by the same v1.4.1 language toggle. No CMS, no MDX runtime, no new render deps.

---

## 1. Goals

1. `/doc` (index) + `/doc/[slug]` pages with a **GitHub-Docs layout**: sticky left sidebar (sections → pages), readable content column, optional "on this page" anchors.
2. Content as **static `.md` files**, one pair per page (`en` + `th`), rendered with the existing `Markdown` component (no `dangerouslySetInnerHTML`).
3. **Bilingual** — the v1.4.1 toggle picks `en`/`th`; the sidebar labels come from the i18n dictionary.
4. **Statically generated** (`generateStaticParams` over a manifest) so docs are fast and crawlable; reuse the shared `NavBar`.
5. A docs **manifest** as the single source of nav order/sections.

## 2. Non-Goals

- Search (Algolia/Pagefind) — fast-follow.
- Versioned docs / changelog history.
- MD authored anywhere but the repo (no CMS, no remote fetch).
- Auto-generating docs from code — pages are hand-written.
- Documenting the **internals** (that's CLAUDE.md). `/doc` is for the *operator/visitor*.

---

## 3. Content model

```
content/doc/
  nav.ts                 ← manifest: ordered sections → pages (slug + i18n title key)
  en/<slug>.md
  th/<slug>.md
```

- **`nav.ts`** — `export const DOC_NAV: { section: MsgKey; pages: { slug: string; titleKey: MsgKey }[] }[]`. Drives the sidebar and `generateStaticParams`. Titles localize through the v1.4.1 `messages` dict (new `doc.*` keys).
- **Markdown files** read at build via `fs.readFileSync` (mirrors the `roles.ts` pattern) and shipped to the serverless/static bundle via **`outputFileTracingIncludes`** in `next.config.ts` (same mechanism the `.agents/*.md` briefs already use — required, or the files won't exist at runtime).
- Page lookup: `getDoc(slug, lang)` → reads `content/doc/<lang>/<slug>.md`, falls back to `en` if a `th` file is missing. A pure-ish `resolveDoc(nav, slug)` (manifest lookup, 404 if absent) is the **testable unit** (`doc.test.ts`).

## 4. Pages (initial set, all bilingual)

| slug | Section | Content |
|---|---|---|
| `overview` | Getting Started | What the AI company is; the two-floor office; the 6 agents at a glance. |
| `agents` | Getting Started | Each dept's mandate, cadence, and what it produces (links to `/dashboard/[dept]`). |
| `cadence` | How it runs | Mixed cron schedule; what "real value / provenance" means (api vs web·cited). |
| `dashboard` | Using it | Tour of `/dashboard`: KPI strip, CEO cockpit, glass cards, charts, Sources/Related. |
| `knowledge-base` | Using it | The KB: drafts → publish gate, `/api/kb` (`?dept=`, `?slug=` graph), how reports become public knowledge. |
| `telegram` | Using it | Bot commands: `/status`, `/agents`, `/run`, `/report`, and the `/ask` deep-dive + 15-min focus thread. |
| `admin` | Operating | The `/admin` console + KB Manager (publish/pin/archive); env/secrets at a high level. |

Content is **prose for a human operator**, cross-linking live routes. Kept short; each page one screen-ish.

## 5. Layout & theme

- **`/doc/layout.tsx`** — shared docs chrome: top `NavBar` (with the lang toggle) + a two-column body (`<aside>` sidebar from `DOC_NAV`, `<main>` content). Sidebar highlights the active slug via `usePathname`.
- **GitHub-Docs aesthetic** — clean, light, generous line-height, sans+mono, subtle left-border on the active sidebar item, anchored headings. This is intentionally a **lighter theme** than the dark office/glassmorphism; it shares the `NavBar` but its own `doc.css` (scoped). (The `frontend-design`/`ui-ux-pro-max` plugins can inform the palette/type at build time.)
- **Content** rendered via the existing `Markdown` component (safe; already used by the dashboard). Extend it only if needed for doc niceties (heading anchors, code blocks) — keep the no-`dangerouslySetInnerHTML` rule.
- Responsive: sidebar collapses to a top `<details>`/drawer on mobile.

## 6. Routing

- `src/app/doc/page.tsx` → redirects/renders the `overview` page.
- `src/app/doc/[slug]/page.tsx` → `generateStaticParams()` from `DOC_NAV`; `notFound()` for unknown slugs; renders `getDoc(slug, lang)`.
- Add **`/doc`** to the primary `NavBar` `LINKS` (label via `nav.doc` message key).

## 7. Files touched

- **New:** `content/doc/nav.ts`, `content/doc/en/*.md` (7), `content/doc/th/*.md` (7); `src/lib/doc.ts` + `doc.test.ts`; `src/app/doc/layout.tsx`, `src/app/doc/page.tsx`, `src/app/doc/[slug]/page.tsx`; `src/app/doc/doc.css`.
- **Edit:** `next.config.ts` (`outputFileTracingIncludes` += `content/doc/**`), `src/lib/i18n/messages.ts` (`doc.*` + `nav.doc` keys), `NavBar.tsx` (`/doc` link). 
- **CLAUDE.md:** add the `/doc` route + content model.

## 8. Risks

| Risk | Mitigation |
|---|---|
| MD files missing at runtime (serverless) | `outputFileTracingIncludes` — the proven `.agents/*.md` mechanism; a build-time read of a known page asserts it. |
| Docs theme clashes with the dark app | Scoped `doc.css`; shares only `NavBar`. Deliberate light docs theme. |
| TH page lag behind EN | `getDoc` falls back to `en`; manifest is the source of truth, not the file's existence. |
| Content drift vs the app | Pages cross-link live routes; reviewed at each minor version. |

## 9. Done =
`/doc` renders the 7 bilingual pages with a GitHub-Docs sidebar, the v1.4.1 toggle flips content language, unknown slugs 404, all pages reachable from the sidebar + main nav; `lint`/`tsc`/`tests`/`build` green.

## 10. Deploy
`base-deployment` → bump to **1.4.2**, verify, push to `main`, smoke-test `/doc` + a couple of pages in both languages.

---

## Sequencing note
1.4.2 **must ship after 1.4.1** — it consumes `LangProvider`, `useLang`, and the `messages` dictionary. Build order: 1.4.1 (language machinery + bilingual reports) → 1.4.2 (docs site on top).
