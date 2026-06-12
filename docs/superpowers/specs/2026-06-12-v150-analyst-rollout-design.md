# v1.5.0 — Analyst-Report Rollout + Findings-First Contract (design spec)

**Status:** Approved design — implementation plan to follow.
**Scope:** The five non-finance agents (CyberX, Marketing, R&D, Operations, CEO) gain a sectioned analyst-report format; ALL six agents (incl. Finance) move to the findings-first output contract deferred from v1.4.5.
**Foundation:** Completes Phase 4 of `2026-06-05-v15-finance-analyst-report-design.md`. The v1.4.10 engine work (`completeRaw`, `incomplete` flag, per-dept truncation tests) is already shipped and is a prerequisite, not part of this spec.

---

## 1. Problem

Two gaps remain after the Finance v1.4.5 work and the v1.4.8–v1.4.11 robustness fixes:

1. **Five agents still write free-form reports.** Finance produces a sectioned, verdict-first, cited analyst report; CyberX/Marketing/R&D/Operations/CEO follow only their original briefs plus the generic footer contract — no fixed structure, no verdict box, no sources section. Quality and scannability vary run to run.
2. **The machine-readable data still dies first on truncation.** Output order is `narrative → findings JSON → ## Highlight → ## Flags`. A run cut at `max_tokens` (or killed by the platform) loses exactly the reusable block that feeds charts and the KB. v1.4.10 made truncation *visible* (`incomplete` flag) but not *survivable*. The v1.4.5 spec called the reorder "the single most important structural change" and deferred it.

## 2. Decisions (made in brainstorming)

| Decision | Choice |
|---|---|
| Findings-first reorder | **Yes — all six agents**, including Finance |
| Bilingual mode for the five | **Full dual reports** (complete TH + complete EN). Finance keeps its v1.4.5 Thai-primary + short-EN mode |
| Template authoring | **Append** a report-structure section to each `.agents/*.md` brief; existing role/rubric content untouched (respects the v1.2.4 brief restoration; follows the Finance v1.4.5 precedent that the brief IS the spec) |
| Phasing | **One version: v1.5.0** — templates + reorder land together |
| Reorder mechanics | **Normalize-on-ingest** — model emits head-first; runner reassembles to the existing storage layout |

## 3. Output contract — what the model emits (all six agents)

```
```json findings    ← machine-readable data, FIRST (survives truncation)
## Highlight        ← 1–2 sentence verdict (Thai body, English header)
## Flags            ← 0–3 cross-dept follow-ups (English header)
---                 ← hard separator line: unambiguously ends the head
[Full TH report]    ← the dept's analyst template (§5)
<!-- ===EN=== -->
[Full EN report]    ← the five: full dual report · Finance: short EN executive summary
```

A run cut at `max_tokens` now still yields valid findings, a verdict, and flags; it is flagged `incomplete` (v1.4.10) and archives as a `draft` (publish gate holds).

### personas.ts changes

- `FINDINGS_CONTRACT` + `OUTPUT_FOOTER` merge into one **`OUTPUT_HEAD_CONTRACT`**: "the FIRST things you write, before any narrative" — findings block, then `## Highlight`, then `## Flags`, then a line containing only `---`. The two headers stay English verbatim (the parsers and dashboards depend on them); citation rules inside the findings block are unchanged.
- `BILINGUAL_RULE` (the five) and `FINANCE_BILINGUAL_RULE` (Finance) restate the new full sequence.
- New **`chatPersona(dept)`** export = autonomous preamble + brief only — **no** findings/bilingual/head contracts. Used by Telegram `/ask` and focus-session follow-ups so chat answers stop carrying report scaffolding (today they end with the footer; with a head contract they would *lead* with JSON, which is worse — hence the dedicated chat persona).

### bilingual.ts changes (normalize-on-ingest)

New `normalizeReportOrder(raw)`:
- If the trimmed output **starts with the findings fence**, split the head (findings block + `## Highlight` section + `## Flags` section, terminated by the first `---` line after Flags) from the body, and return `[body]\n\n[head]` — i.e. the **existing storage layout**.
- Anything else (legacy order, non-compliant model output, old KB entries re-processed) passes through unchanged. Never throws.
- `runner.ts` calls it once on `result.markdown` before `splitBilingual()`.

**Why normalize-on-ingest:** every downstream consumer — `splitBilingual`, `narrativeOf`, dashboards, MD/PDF/CSV exports, `/api/kb`, and all pre-v1.5 KB entries — keeps seeing ONE canonical layout. `parseHighlight`/`parseFlags`/`extractFindingsBlock` already match position-agnostically, so they need no changes either way; only `bilingual.ts`'s tail-last assumption made storage order matter.

## 4. Telegram chat path

`src/app/api/telegram/route.ts` switches its two `complete()` calls (`/ask` one-shot at `maxTokens` 1800; focus-session follow-up at 1500) from `PERSONAS[dept]` to `chatPersona(dept)`. Budgets unchanged. This is a behavior improvement: answers become plain chat prose with citations, no findings block or footer.

## 5. The five report templates (appended to the briefs)

Each `.agents/*.md` gains one appended Thai section, **"โครงสร้างรายงาน (Analyst Format)"**, defining the dept's full-report body (the part after the `---`). All five follow the Finance discipline: **lead with the conclusion · quantify everything · cited sources section at the end**. Findings JSON schemas are **unchanged** (they were defined per-dept in v1.4 and the `parse<Dept>Findings()` validators stay as-is).

| Dept | Verdict box leads with | Core comparison table | Body sections (after verdict + table) |
|---|---|---|---|
| **CyberX** | overall risk level + most critical CVE today | CVE / CVSS / affected products / relevance to our stack / action | threat landscape → per-threat analysis → traffic-light action recommendations → risks/limitations → sources |
| **Marketing** | top demand trend + recommended play | signal / source / engagement / relevance | demand landscape → per-channel content plan (X / LinkedIn / Blog drafts) → measurement notes → sources |
| **R&D** | adopt / trial / assess / hold pick of the day | candidate / stars / activity / 4-criteria score | focus overview → per-candidate analysis vs the existing 4-criteria rubric → adoption recommendation + integration sketch → risks → sources |
| **Operations** | overall health + the one fix today | system / status / last deploy / CI | scorecard readout → per-system analysis → action plan → sources (status pages) |
| **CEO** | company posture this week | dept / highlight / flags digest | cross-dept connections → decisions (2–3, actionable, naming depts) → risks & priorities (internal dept outputs are the sources — CEO has no web search) |

## 6. Budgets

The five non-finance agents: `maxTokens` 4000 → **8000** (a full dual analyst report needs it; Finance is already at 8000). Worst case ≈ $0.04/run on Haiku — negligible. Telegram chat budgets stay 1500–1800.

## 7. Tests (TDD)

- **`bilingual.test.ts`** — `normalizeReportOrder()`: compliant head → storage layout; legacy narrative-first input → passthrough; truncated-mid-report → head recovered, partial body kept; missing `---` → safe passthrough (never throws); `splitBilingual()` round-trips a normalized doc.
- **`personas.test.ts`** — every persona contains the head contract (order text + verbatim English headers + `---` separator); `chatPersona()` contains none of the report scaffolding.
- **`<dept>.test.ts`** (five files) — budget assertions move to 8000; `incomplete` tests unchanged.
- **`roles.test.ts`** — untouched and still green: it asserts brief-verbatim loading, and editing the briefs is the designed path.

## 8. Invariants preserved

- Charts built only by `<dept>Artifacts()` builders; findings schemas, validators, and citation rules (`hasCitation`, `withProvenance`) unchanged. "Never uncited" holds.
- Draft→publish gate unchanged — first live runs of the new format land as drafts for admin review.
- Storage layout unchanged (normalize-on-ingest): dashboards, exports, `/api/kb`, and all pre-v1.5 entries render identically.
- No renderer changes; no `dangerouslySetInnerHTML`.
- Brief-IS-the-spec: format changes are edits to `.agents/*.md`, shipped via the existing `outputFileTracingIncludes`.

## 9. Out of scope (deliberate)

New chart kinds · findings-schema extensions · PDF chart embedding · bilingual highlight/summary (separate roadmap item) · cadence/`vercel.json` changes · `.agents/<dept>/references/` files (the appended template section suffices; references remain a Finance-only experiment that v1.4.5 itself ended up not needing).

## 10. Verification

Local: full vitest suite + `tsc --noEmit` + lint. Live: rides the existing cron cadence — CyberX (daily 10:00 UTC) is the first new-format run; Finance (Mon/Wed/Fri 11:00 UTC) confirms the reorder didn't disturb the v1.4.5 analyst report. Both arrive as drafts in the Admin KB Manager for quality review before publishing. `CLAUDE.md` gains the v1.5.0 feature line.
