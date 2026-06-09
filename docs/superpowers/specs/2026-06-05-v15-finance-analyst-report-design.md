# v1.5 — Finance Analyst-Grade Report (design spec)

**Status:** Draft for review — no code yet.
**Scope:** Finance agent first (template for the other 5 later).
**Language:** Thai-primary + short English summary (not full dual report).
**Foundation:** Anthropic `earnings-analysis` skill (installed via `equity-research@claude-for-financial-services`). We mirror its *structure*, adapted from US equity earnings → Thai mutual-fund analysis.

---

## 1. Problem (why today's output is wrong)

The Finance agent should produce an **institutional analyst report**, but the current pipeline can't:

- **Hard truncation.** `claude.ts` caps output at `maxTokens` 1,500–2,200 (Finance 2,200). A real analyst report is **3,000–5,000 words**. The model hits `stop_reason: "max_tokens"` and stops mid-report.
- **Silent truncation.** `textOf()` (`claude.ts:11`) never checks `stop_reason` — a cut-off run is stored as if complete.
- **Reuse-data dies first.** Output order is `narrative → findings JSON → ## Highlight → ## Flags`. The machine-readable block that feeds charts + KB is emitted **last**, so truncation destroys exactly the reusable data.
- **No fixed report structure.** The brief asks for "a comparison table + summary"; the skill we studied enforces a **sectioned template** with a verdict box, per-criterion analysis, mandatory cited sources, and a quality checklist. That discipline is what makes the output look professional.

## 2. What "good" looks like (extracted from the skill)

The `earnings-analysis` skill = **SKILL.md (role + workflow + output spec) + references/{workflow, report-structure, best-practices}.md**. Its load-bearing rules:

1. **Lead with the conclusion** (beat/miss verdict in a summary box up top).
2. **Quantify everything** — "TER 0.55% vs peer median 0.75%", never "low fees".
3. **A fixed page-by-page template** with 1–3 summary tables + 8–12 charts.
4. **Mandatory citations** — every table/figure has a `Source:` line with date + link; a `Sources` section at the end.
5. **A QC checklist** gates delivery.

We adopt all five, translated to Thai retail fund analysis.

## 3. The Thai Mutual-Fund Report template (Finance v2)

A single run = one **theme** (Mon: US/S&P500 · Wed: global tech/semiconductor · Fri: Thai tax funds SSF/RMF/ESG — already in the brief). Output, in order (conclusion-first, reuse-data-safe):

```
1.  ```json findings```      ← structured fund data, emitted FIRST (survives truncation)
2.  ## Highlight             ← 1–2 sentence verdict (Thai)
3.  ## Flags                 ← 0–3 cross-dept follow-ups
--- (full report below) ---
4.  สรุปผู้บริหาร (Verdict box)   — theme, "กองคุ้มที่สุด", lowest-TER pick, best-1Y pick, recommended pick + the trade-off
5.  ภาพรวมธีม + การแมปสินทรัพย์   — what the theme maps to (index/underlying), feeder-fund explainer
6.  ตารางเปรียบเทียบกอง (3–5)     — the core table (name/AMC/TER/master fund/hedged/AUM/1Y return/tax type)
7.  บทวิเคราะห์เชิงลึกรายเกณฑ์    — one short section each: ค่าธรรมเนียม · กองแม่/underlying · ขนาดกอง(AUM) · tracking error · ป้องกันค่าเงิน · ผลตอบแทนย้อนหลัง · สภาพคล่อง
8.  คำแนะนำ (trade-offs)         — cheapest vs best-performing vs tax-advantaged; NOT "ต้องซื้อกองนี้"
9.  ความเสี่ยง + ข้อจำกัด         — past-performance disclaimer, fees-as-of-date, "ไม่ใช่คำแนะนำเฉพาะบุคคล"
10. แหล่งอ้างอิง (Sources)        — every fund's source line: title + date + URL
11. <!-- ===EN=== --> English executive summary (SHORT — ~150–250 words: verdict + table readout + caveat)
```

**Why findings/Highlight/Flags move to the top:** conclusion-first matches the skill ("lead with the verdict"), *and* it makes the reusable structured block the first thing written — so even a truncated run still yields valid KB + chart data. This is the single most important structural change.

**Citations** stay mandatory and unchanged in spirit (`hasCitation` needs `url` + `date`); we additionally render a Sources section in the report body and the PDF.

## 4. Charts (interactive on-site + embedded in PDF)

Built deterministically from `findings.funds[]` by `financeArtifacts()` — never freehand by the LLM (keeps the "never uncited / never malformed" invariant). All map to existing SVG primitives:

| Chart | Primitive | Data |
|---|---|---|
| ค่าธรรมเนียม (TER) เปรียบเทียบ | Bars | `funds[].ter` |
| ผลตอบแทน 1 ปี เปรียบเทียบ | Bars | `funds[].return1y` |
| ขนาดกอง (AUM) | Bars | `funds[].aum` |
| ผลตอบแทน vs ค่าธรรมเนียม | Scatter/Line | `return1y` × `ter` |
| สัดส่วนป้องกันค่าเงิน / ประเภทภาษี | Donut | `hedged` / `taxType` |
| ตารางสรุปกอง | DataTable | all fields |

On-site these are the existing **interactive** `ArtifactRenderer` SVGs on `/dashboard/finance`. The **PDF export** embeds the same charts as static SVG/PNG (see §6).

## 5. Pipeline foundation (the truncation root cause) — `claude.ts`

This is the fundamental fix, independent of report content:

- **Stream + `finalMessage()`** for the request (the API guidance: stream for large/long output to avoid HTTP timeouts; Sonnet 4.6 allows up to 64K output).
- **Return `{ text, stopReason, usage }`** from `complete()` (not a bare string) so callers know if it truncated.
- **Guard `stop_reason === "max_tokens"`** in `runner.ts`: mark the run **incomplete** — store it as `draft` with an `incomplete` flag and a Telegram warning, never silently publish a cut-off report.
- **Raise Finance `maxTokens`** to ~8,000 (Thai full report + short EN + findings, with headroom). Keep other depts as-is until their rollout.
- Model stays `claude-sonnet-4-6` (cost/latency fit for cron); adaptive thinking off (deterministic report).

## 6. Reusable KB deliverable + PDF export

**KB entry (the reusable record)** gains/keeps first-class fields, all addressable via `/api/kb?slug=`:
- `markdown` (full Thai report) · `markdownEn` (short EN summary)
- `findings` (typed `funds[]`) — the data-driven source for charts and any future app
- `sources` (cited `{url,title,date}`) · `artifacts` (built chart specs) · `theme` · `slug` · `related`
- `complete` flag (from the `stop_reason` guard)

**PDF export (`AgentDetail.tsx exportPdf`)** is upgraded from a plain `<pre>` dump to a **sectioned institutional layout**, still built with `textContent`/DOM only (no `dangerouslySetInnerHTML`):
- Cover: theme + date + verdict box
- Comparison table (styled, with source line)
- Embedded charts (the SVG artifacts serialized into the print document)
- Per-criterion sections, recommendation, risks/disclaimer
- Sources section with clickable links

"Interactive graphs" remain the on-site SVGs (`/dashboard/finance`); the PDF is the portable, shareable artifact. (A `.docx` export like the skill's is possible later but needs a new dependency — out of scope for v1.5.)

## 7. File structure (mirrors the skill)

```
.agents/Finance Agent.md                         ← the "SKILL.md": role + workflow + output spec (edit the report contract here)
.agents/finance/references/report-structure.md   ← NEW: the §3 Thai template, verbatim, loaded as reference
.agents/finance/references/best-practices.md      ← NEW: Thai good/bad examples + QC checklist
src/lib/claude.ts                                 ← stream + finalMessage + {text,stopReason,usage}
src/lib/agents/runner.ts                          ← stop_reason guard → incomplete flag
src/lib/agents/personas.ts                        ← reorder contract: findings+Highlight+Flags FIRST
src/lib/agents/bilingual.ts                       ← parse new order; EN = short summary section
src/lib/agents/finance.ts                         ← parseFinanceFindings + financeArtifacts (extend charts)
src/components/AgentDetail.tsx                     ← upgraded sectioned PDF export
next.config.ts                                    ← outputFileTracingIncludes: ship .agents/finance/references/**
```

`roles.ts` already loads the brief verbatim; references are loaded the same way (read at cold start, shipped via `outputFileTracingIncludes`).

## 8. Phasing (fundamentals first, no rush)

- **Phase 0 (this spec).** Agree the report template + the two structural decisions (done: Finance-first, Thai-primary + short EN).
- **Phase 1 — engine.** `claude.ts` stream + stop_reason guard + Finance `maxTokens`. Reorder the output contract (findings/Highlight/Flags first) + update `bilingual.ts`. Verify a full report comes through uncut. *(No report-content change yet — just prove the pipeline holds a long report.)*
- **Phase 2 — report.** Author `.agents/finance/references/*` + tighten the brief to the §3 template. Extend `financeArtifacts()` charts. Verify report quality on a real run.
- **Phase 3 — deliverable.** Upgrade the PDF export; confirm KB fields + `/api/kb` carry the full reusable record.
- **Phase 4 — rollout.** Apply the same pattern to CEO → CyberX → Marketing → R&D → Operations.

## 9. Open questions for review

1. Report length target — aim for the skill's 3,000–5,000 words, or a tighter ~2,000-word Thai report (faster/cheaper per cron run)?
2. PDF now, or interactive-on-site first and PDF in Phase 3 (as written)?
3. Keep `claude-sonnet-4-6`, or use Opus for Finance's report quality (higher cost per run)?

---

*Grounded in the installed `earnings-analysis` skill (`equity-research@claude-for-financial-services`). Nothing here is investment advice; outputs are draft analyst work product for human review.*
