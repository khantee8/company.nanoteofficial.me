# v1.4.1 — TH/EN Bilingual (UI + dual-generated reports)

**Status:** Approved (brainstormed 2026-06-04)
**Depends on:** v1.4.0 (real-value agents, KB graph, findings contract)
**Blocks:** v1.4.2 (`/doc` user guide reuses this language machinery)

**Scope:** Make the simulator fully bilingual end-to-end. A single language toggle switches **everything** the user sees: UI chrome (nav, labels, headings, buttons, empty states), **chart titles**, and the **agent report narrative**. Reports are **dual-generated** — each run produces a Thai *and* an English narrative, both stored in the KB, so switching language is a zero-cost read (no per-view translation). Default language is **English-first** with a TH toggle.

---

## 1. Goals

1. One **`lang` toggle** (EN default ⇄ TH) in the NavBar, persisted, driving the whole app.
2. **UI chrome** localized via a typed dictionary — no i18n library (house "no new deps" rule).
3. **Chart titles** localized (today they're an inconsistent mix: Finance Thai, others English).
4. **Agent reports dual-generated** TH+EN at run time, both stored in the KB entry; the dashboard/detail/Telegram serve the active language with zero added latency.
5. **Additive, non-destructive**: old single-language KB entries still render (fall back to their one stored language).
6. Fix the stale NavBar version label (`v1.3.1` → driven from `package.json`).

## 2. Non-Goals (not in 1.4.1)

- Translating the **`.agents/*.md` role briefs** — those stay Thai (internal authoring source). Only the *output* is bilingual.
- A third language, or per-section language mixing.
- Server-side language negotiation via `Accept-Language` (cookie/toggle only; the `/doc` site in 1.4.2 may revisit).
- Retroactively back-filling EN narratives for pre-1.4.1 entries (they degrade gracefully to their stored language).

## 3. Operating model — where language is resolved

| Surface | Render mode | How language applies |
|---|---|---|
| `/dashboard` (exec) | statically prerendered (`○`) | **client-side** — `LangProvider` reads the `lang` cookie on mount; dict + markdown picker localize. Accept a one-frame default-EN flash (documented tradeoff). |
| `/dashboard/[dept]` (detail) | dynamic (`ƒ`) | same client `LangProvider`; markdown picks `en`/`th` field. |
| Telegram `/report`, `/ask` | server | `/report` serves the entry's active-language markdown (caller has no UI; default EN, `/report <dept> th` optional flag → fast-follow). Agent `/ask` answers in the asked language (detect from prompt; default EN). |

Keeping language **client-side** preserves the static prerender of `/dashboard`. No middleware, consistent with the existing no-middleware auth model.

---

## 4. The i18n seam (UI chrome)

New `src/lib/i18n/`:

- **`messages.ts`** — `export const MESSAGES = { en: {...}, th: {...} } as const` keyed by stable string id (`nav.office`, `detail.sources`, `detail.related`, `kpi.openFlags`, `empty.noData`, …). A `Lang = 'en' | 'th'` type; `type MsgKey = keyof typeof MESSAGES.en`. A compile-time check (test) asserts `en` and `th` have identical key sets.
- **`LangProvider.tsx`** (`'use client'`) — React context holding `lang` + `setLang`. On mount reads the `lang` cookie (default `'en'`); `setLang` writes the cookie (`document.cookie`, 1-yr) and updates state. Exposes `useLang()` → `{ lang, setLang, t }` where `t(key)` = `MESSAGES[lang][key]`.
- **`LangToggle.tsx`** — the EN/TH switch; rendered in `NavBar` `nav-right`. Two-state pill (`EN | ไทย`).

**Testable unit:** `messages.test.ts` (key-parity), `t()` lookup. Mirrors the v1.4 pure-unit discipline.

### Wiring
- `LangProvider` wraps the app (root `layout.tsx`).
- `NavBar` consumes `useLang` for its own labels + renders `LangToggle`; the `LINKS`/sub-nav labels become message keys.
- `ExecDashboard`, `AgentDetail`, charts consume `t()` for every literal.

---

## 5. Chart titles

Today builders set title literals (Finance Thai, others English). Normalize so localization is uniform:

1. **Normalize all `<dept>Artifacts()` builder titles to English literals** (e.g. Finance `'ค่าธรรมเนียมรวม (TER %)'` → `'Total expense ratio (TER %)'`). Update the dept `*.artifacts.test.ts` fixtures.
2. The chart renderer localizes via a **title dictionary** keyed on the English title: `CHART_TITLES = { en: passthrough, th: { 'Total expense ratio (TER %)': 'ค่าธรรมเนียมรวม (TER %)', … } }`. Missing key → render the English title as-is (safe default).

This keeps the `Artifact` type **unchanged** (no new `titleKey` field) — purely a render-time lookup. Builders stay deterministic; the dictionary is the only new surface. (Alternative considered: add `titleKey` to the Artifact union — rejected as a wider type/blast-radius change for no functional gain.)

---

## 6. Dual-generated reports (the core lift)

### 6.1 Persona contract
Add a **bilingual output rule** to `personas.ts`, sitting between `FINDINGS_CONTRACT` and `OUTPUT_FOOTER`. The model writes its narrative **twice** — Thai first, then English — separated by a hard, machine-parseable delimiter, *before* the findings block and footer:

```
<narrative — Thai>

<!-- ===EN=== -->

<narrative — English (same substance, not a literal gloss)>

```json findings
{ … }
```

## Highlight
…
## Flags
…
```

The delimiter `<!-- ===EN=== -->` is an HTML comment (invisible if ever rendered raw) and unambiguous for splitting. Both narratives precede the single shared findings block and the single English-headed footer, so `parseHighlight`/`parseFlags`/`extractFindingsBlock` keep working **unchanged** (they scan the whole document and the footer/findings appear once, after both narratives).

### 6.2 Runner split
New pure helper `splitBilingual(markdown)` in `runner.ts` (or `src/lib/agents/bilingual.ts`):

- Splits on `<!-- ===EN=== -->`.
- `th` = text before the delimiter.
- `en` = text after the delimiter, **up to** the findings block (` ```json findings `) or the `## Highlight` footer, whichever comes first.
- Strips trailing findings/footer from each narrative (they're stored structurally elsewhere / re-appended as needed).
- **Fallbacks:** no delimiter → treat the whole narrative as both `th` and `en` (`en = th`); empty `en` → `en = th`. Never throws.

**Testable unit:** `bilingual.test.ts` — delimiter present, absent, empty-EN, findings-after-EN, footer-after-EN.

### 6.3 KB schema (additive)
`KbEntry` gains **`markdownEn?: string`**. `markdown` stays the canonical Thai narrative (back-compat). `runAgent` stores both: `markdown = th`, `markdownEn = en`. `normalizeKbEntry` backfills `markdownEn ??= markdown` on read so old entries and the renderer always have both fields. `AgentRunResult` gains `markdownEn?: string`.

The renderer/detail picks: `lang === 'en' ? (entry.markdownEn ?? entry.markdown) : entry.markdown`.

`HistoryEntry`/`AgentOutput.markdown` stay single-language (primary) for now — history list shows the active language's narrative via the same picker where the EN field is available, else primary.

### 6.4 Cost
~2× narrative tokens per run (the preview the user approved). Cached forever in the KB — **zero** per-view cost. `maxTokens` per agent roughly doubles for the narrative portion; findings/footer unchanged. Acceptable given mixed cadence (most agents run ≤3×/week).

---

## 7. Highlight / summary language

`KbEntry.highlight` + `summary` remain single-language (primary). The one-line highlight on cards stays in the primary language even when viewing EN — an accepted v1.4.1 limitation (full report *is* localized). Fast-follow: parse a bilingual highlight (`## Highlight` / `## Highlight (EN)`), out of core.

---

## 8. Files touched

- **New:** `src/lib/i18n/messages.ts`, `LangProvider.tsx`, `LangToggle.tsx`, `messages.test.ts`; `src/lib/agents/bilingual.ts` + `bilingual.test.ts`.
- **Edit:** `personas.ts` (bilingual rule + `personas.test.ts` guard), `runner.ts` (split + store `markdownEn`), `types.ts` (`markdownEn?`), `redis.ts` `normalizeKbEntry` (backfill `markdownEn`), every `<dept>Artifacts()` (English titles) + their `.artifacts.test.ts`, charts renderer (title dict), `NavBar.tsx` (toggle + dynamic version), `ExecDashboard.tsx` / `AgentDetail.tsx` (consume `t()` + markdown picker), root `layout.tsx` (`LangProvider`), `kb.ts` / Telegram `/report` (active-language markdown).
- **CLAUDE.md:** add the i18n seam + bilingual report contract to architecture.

## 9. Risks

| Risk | Mitigation |
|---|---|
| FOUC (EN flash before TH cookie applies) on static `/dashboard` | Accept one frame; default EN matches most-likely first paint. Document. |
| Model forgets the `<!-- ===EN=== -->` delimiter | `splitBilingual` falls back to `en = th`; `personas.test.ts` asserts the rule text is present; spot-check after deploy. |
| 2× token cost | Bounded by mixed cadence; `maxTokens` tuned per dept; findings/footer unchanged. |
| Key drift between `en`/`th` dicts | `messages.test.ts` key-parity assertion fails the build. |
| Old KB entries lack EN | `normalizeKbEntry` backfills `markdownEn ??= markdown`. |

## 10. Done = 
Toggle flips nav + labels + chart titles + full agent narrative between EN/TH with no layout break; new runs store both languages; old entries still render; `lint`/`tsc`/`tests`/`build` green; NavBar shows the real version.

## 11. Deploy
`base-deployment` → bump to **1.4.1**, verify, push to `main`, smoke-test the toggle on `/dashboard` + a detail page + one freshly-run dual-language entry.
