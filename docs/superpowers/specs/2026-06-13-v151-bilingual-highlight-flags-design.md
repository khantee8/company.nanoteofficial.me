# v1.5.1 — Bilingual highlight + flags (design spec)

**Status:** Approved design — implementation plan to follow.
**Scope:** Make the agent **highlight** and **flags** bilingual (TH/EN, switch with the LangToggle). `summary` stays Thai. Completes the v1.4.1 bilingual story (which left highlight/summary single-language).
**Foundation:** Builds on the v1.5.0 findings-first head contract. No changes to `splitBilingual` or `normalizeReportOrder`.

---

## 1. Problem

v1.4.1 made the UI chrome and agent **narratives** bilingual, but explicitly deferred the highlight: *"Highlight/summary stay single-language (Thai) — bilingual highlight is fast-follow."* Today the dashboard verdict line and the cross-dept flags are parsed once from the model's `## Highlight` / `## Flags` head (Thai) and rendered the same regardless of the TH/EN toggle. So an English-toggled dashboard still shows a Thai verdict and Thai flags — the bilingual experience is incomplete.

`summary` is excluded on purpose: unlike highlight/flags (model-written prose in the head), `summary` is a **code-generated** status string built deterministically in each dept module (e.g. `` `${findings.funds.length} กองในธีม ${label}` ``). User-facing surfaces already prefer `highlight` over `summary` (it's only a fallback). Translating it would mean editing all six dept modules for little visible gain — out of scope (YAGNI).

## 2. Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Fields that go bilingual | **highlight + flags** (summary stays Thai) |
| How the EN text is produced | **Model emits it** — a bilingual `## Highlight` / `## Flags` in the head (Thai `<!-- ===EN=== -->` English), reusing the existing delimiter. No runtime translation call. |
| Where the language split happens | **Lang-aware parsers** (`parseHighlight`/`parseFlags` gain a `lang` param). `splitBilingual` and `normalizeReportOrder` are **untouched** — zero risk to the just-shipped v1.5.0 logic. |

### Approach A vs B (why A)

- **A — lang-aware parsers (chosen).** The shared tail stays identical in both `{th, en}` documents (as today); the parsers split the captured `## Highlight` / `## Flags` section on `EN_DELIMITER` and return the matching half. Change is localized to the two parsers + storage fields + a few call sites.
- **B — split inside `splitBilingual`.** Make the shared tail language-specific. More invasive, reaches into freshly-shipped split logic, and the client components still need the same call-site changes. No upside.

## 3. Output contract change (`personas.ts`)

`OUTPUT_HEAD_CONTRACT` — the `## Highlight` and `## Flags` bodies each become bilingual, using the same `<!-- ===EN=== -->` delimiter already used between narratives:

```
## Highlight
<Thai verdict, 1–2 sentences>
<!-- ===EN=== -->
<English verdict, 1–2 sentences>

## Flags
<Thai bullets, 0–3>  (or "None.")
<!-- ===EN=== -->
<English bullets, 0–3>  (or "None.")

---
```

The findings block stays language-neutral. The two English headers (`## Highlight`, `## Flags`) stay verbatim English. The model is instructed: if it can't produce the English half, omit the delimiter — the parser falls back to the Thai half (never empty).

**Interaction with the v1.5 head-first emission + `normalizeReportOrder`:** unchanged and safe. In emitted (head-first) order the head is `findings → ## Highlight(TH⟂EN) → ## Flags(TH⟂EN) → ---`. `normalizeReportOrder` locates `## Flags` then the first `---` after it; the bilingual Flags content contains no `---`, so the head boundary is detected exactly as before. After normalization the storage layout is `[TH narrative] <delim> [EN narrative] [head]`, so the **first** `EN_DELIMITER` is still the narrative separator that `splitBilingual` keys on — the extra delimiters live inside the shared tail and are handled by the parsers, not by `splitBilingual`.

## 4. Parsers (`runner.ts`)

```ts
parseHighlight(markdown: string, lang?: 'th' | 'en'): string
parseFlags(markdown: string, lang?: 'th' | 'en'): string[]
```

- Capture the `## Highlight` / `## Flags` section exactly as today (regex unchanged: stops at the next `## ` / `---` / end — the `<!-- ===EN=== -->` line is neither, so the whole bilingual body is captured).
- Split the captured body on `EN_DELIMITER`. `lang === 'en'` → second segment (fallback to first if there is no delimiter); `lang === 'th'` or omitted → first segment.
- `parseFlags` parses bullets from the selected segment (same bullet logic as today). A segment equal to "None." yields `[]`.
- **Backward compatible:** no-arg calls return the first (Thai) segment, identical to current behavior for legacy single-language entries.

## 5. Storage (`types.ts`, `runner.ts`, `redis.ts`)

- Add optional `highlightEn?: string` and `flagsEn?: string[]` to **`DigestEntry`** and **`KbEntry`** (the two records that already carry `highlight`/`flags`). `HistoryEntry` keeps `highlight` only (history is used for tooltips + CSV; see §6).
- `runAgent()` stores both languages: `highlight = parseHighlight(markdown, 'th')`, `highlightEn = parseHighlight(markdown, 'en')`, `flags = parseFlags(markdown, 'th')`, `flagsEn = parseFlags(markdown, 'en')`, in `pushDigest` and `pushKb`.
- `normalizeKbEntry` (redis read path) backfills `highlightEn ??= highlight` and `flagsEn ??= flags`, so every pre-v1.5.1 entry renders unchanged under either toggle.

## 6. Display (`ExecDashboard.tsx`, `AgentDetail.tsx`)

- Both already compute `parseHighlight(md)` on **language-picked** markdown (`pickMarkdown(output, lang)`). Pass `lang` through: `parseHighlight(md, lang)`. Same for any `parseFlags(md)` render site.
- The cockpit digest list renders the stored `e.highlight` (`ExecDashboard.tsx:98`) and any stored-flags site: lang-pick the `*En` field — `lang === 'en' ? (e.highlightEn || e.highlight) : e.highlight`.
- `useLang()` is already available in these client components (they're under `LangProvider`).
- **Out of scope (YAGNI):** the history sparkline **tooltip** (`ExecDashboard.tsx:165`, `h.highlight`) and the history **CSV export** (`AgentDetail.tsx:43`) stay Thai — hover-only / raw-export surfaces where mixed language is acceptable and `HistoryEntry` carries no EN field.

## 7. Tests (TDD)

- **`runner.test.ts`** — `parseHighlight(md,'en')` returns the English half; falls back to the Thai half when the delimiter is absent; `parseHighlight(md)` (no arg) returns Thai (legacy). Same matrix for `parseFlags` (incl. "None." → `[]` per language).
- **`runner.test.ts` / `runner.kb.test.ts`** — a head-first run with bilingual highlight/flags stores both `highlight`/`highlightEn` and `flags`/`flagsEn`.
- **redis normalize test** — a legacy entry with only `highlight`/`flags` backfills `highlightEn`/`flagsEn` on read.
- **`personas.test.ts`** — the head contract instructs a bilingual `## Highlight`/`## Flags` (contains the delimiter within the head-contract block).
- No visual tests — display changes are lang-prop plumbing, covered by the parser/storage units.

## 8. Invariants preserved

- `splitBilingual` and `normalizeReportOrder` are **not modified**. The v1.5.0 findings-first contract and storage layout are unchanged.
- Findings block stays language-neutral; chart builders, validators, citation rules untouched.
- Draft→publish gate, KB addressable storage, and `/api/kb` shape unchanged (two optional additive fields, backfilled on read).
- No `dangerouslySetInnerHTML`; no new dependencies.

## 9. Out of scope (deliberate)

Bilingual `summary` (code-built, low-value) · bilingual history tooltip + CSV export · translating internal `todayPeers`/CEO-synthesis context (feeds the LLM, not users) · any change to narratives, findings, charts, or PDF export.

## 10. Verification

Local: full vitest suite + `tsc --noEmit` + lint. Live: rides the cron cadence — the first agent to run after deploy emits a bilingual head; check `/dashboard` toggled to EN shows an English verdict + English flags, and that a pre-v1.5.1 KB entry still renders (Thai, backfilled) under both toggles. `CLAUDE.md` gains the v1.5.1 feature line.
