# v1.4 — Real-Value Agents + Telegram On-Demand (Core)

**Date:** 2026-06-04
**Status:** Approved design — ready for implementation plan
**Scope:** v1.4 **core**. Fast-follow items (TH/EN i18n, `/doc` user guide, `kb.nanoteofficial.me` reader site, Telegram UX polish, MCP connectors) are explicitly **out of core** and listed under Future Hooks.

---

## 1. Problem

The six agent **briefs** (`.agents/*.md`) describe sophisticated, data-driven professionals — Finance is a full Thai mutual-fund analyst with a 6-step comparison workflow. But the **implementations ignore the briefs**: `finance.ts` just pulls BTC/ETH/SOL from CoinGecko and writes a 120–180 word note. The result is "nice structure, basic text" with no real decision value. The same disconnect exists across agents.

Two enabling facts make the fix tractable:
- `complete()` (`src/lib/claude.ts`) **already supports `web_search`** — agents simply never turn it on.
- The codebase already has a clean **pure-unit + vitest** convention (`select*`/`shape*` source units, `<dept>Artifacts()` builders) we can extend.

## 2. Goals (core)

1. Rewire all 6 agents to produce **real, cited research deliverables** — no mockup data.
2. Replace the per-agent thin run with a **standing daily mandate** (rotating themes) on a **mixed cadence**.
3. Persist each run as a **rich, linked KB report** (full markdown + structured artifacts + citations) across all surfaces (KB, dashboard detail, export).
4. Make the KB a **knowledge graph** (series / cross-agent / tag links) and lock a **graph-aware public `/api/kb` contract** that `kb.nanoteofficial.me` will later consume.
5. Upgrade Telegram into the **on-demand deep-dive** half of a hybrid model: one-shot web research + 15-min threaded follow-ups.

## 3. Non-Goals (fast-follow, not in core)

- TH/EN bilingual UI + deliverables (→ 1.4.1).
- `/doc` GitHub-Docs-themed **user guide** (→ 1.4.2). Distinct from `kb.nanoteofficial.me`: `/doc` = how to operate the agents; `kb.nanoteofficial.me` = the knowledge they produce.
- `kb.nanoteofficial.me` **reader site** (lives in the portfolio repo; → 1.4.x). Core only locks the API it consumes.
- Telegram UX polish (inline buttons, rich formatting).
- **MCP data connectors** (the stated long-term direction — replaces `web` research for funds/markets with real structured feeds).

---

## 4. Operating Model — Hybrid

- **Daily/scheduled cron run** = each agent executes a **fixed standing mandate** (no human in the loop). Where the brief is interactive, the autonomous-preamble rule applies: make reasonable assumptions and **state them**.
- **Telegram `/ask`** = on-demand mode where the user supplies a custom brief and the agent runs its full interactive workflow with web research.

This keeps the daily dashboard alive **and** lets the user drive a real custom deep-dive.

---

## 5. The Honesty Model — Provenance-Tagged Artifacts (A + B best-effort)

The pre-v1.4 invariant ("artifacts are deterministic, built by builders from source data, never by the LLM") worked because data came from real APIs. Real Thai fund data has **no API** — it exists only as web pages read via `web_search`, so it must flow through the model. The invariant evolves from *"deterministic"* to **"never uncited."**

**Per-figure rule (best-effort, API-first):**
- Prefer a **real API** when one covers the figure → `source: 'api'`, built deterministically, cannot be hallucinated (CoinGecko, CISA KEV, GitHub, Vercel, HN/Dev.to/Analytics).
- When **no API** covers it → research via `web_search`, keep the figure **only if it carries a citation `{url, date}`** and passes schema validation → `source: 'web'`.
- An uncited or malformed `web` figure is **dropped, never rendered**. This enforces the Finance brief's own rule: *"ห้ามแต่งตัวเลขหรือชื่อกอง ถ้าหาข้อมูลไม่ได้ให้บอกตรงๆ."*
- The dashboard shows a small **provenance badge** (`api` / `web·cited`) so the viewer can trust-but-verify.

### 5.1 The Findings Contract

Each agent run asks the model (web search on) for **two** things:
1. A **markdown report** (the narrative).
2. A fenced ` ```json findings ` block — the structured data behind the report.

A **pure `parse<Dept>Findings(raw: string): <Dept>Findings | null`** function (one per dept, unit-tested, same style as existing source units) extracts and validates that JSON block:
- Wrong shape / unparseable → returns `null`; the run **still ships the narrative + Highlight/Flags**, just without charts (graceful degrade, mirrors the source-fetcher `→ []` pattern).
- Each `web` figure missing a citation → that row is dropped.

Validated findings feed the existing deterministic `<dept>Artifacts()` builders. **No new dependency** — hand-rolled validators consistent with the repo's pure-unit convention.

Example (Finance):
```jsonc
// ```json findings
{
  "theme": "us-index-sp500",
  "funds": [
    { "name": "...", "amc": "...", "ter": 0.30, "aum": 1234,
      "masterFund": "iShares Core S&P 500", "return1y": 18.2,
      "hedged": false, "taxType": "none",
      "citation": { "url": "https://...", "title": "Fund Fact Sheet", "date": "2026-06-01" } }
  ]
}
// ```
```

---

## 6. Per-Agent Mandate, Cadence & Data Strategy

| Agent | Cadence | Standing mandate (the deliverable) | Data strategy |
|---|---|---|---|
| **Finance** (`fin`) | 3×/wk (Mon/Wed/Fri) | Real Thai mutual-fund **comparison** on a rotating theme: **Mon** = US index / S&P500 funds, **Wed** = global tech / semiconductor, **Fri** = SSF/RMF/ThaiESG tax funds. Output = 3–5 fund comparison table (fee/TER, AUM, master fund, returns, hedge, tax type) — **every cell cited**. BTC/ETH/SOL dropped. | `web` (Finnomena / WealthMagik / Morningstar / บลจ. sites), cited. CoinGecko **unwired** from Finance (file kept for reuse). |
| **CyberX** (`cyb`) | Daily | Top real CVEs/threats in the last 24–48h relevant to the stack: severity + KEV status + actionable mitigation. | `api` CISA KEV (kept, deterministic) + `web` advisories, cited. |
| **AI R&D** (`rnd`) | 2×/wk (Tue/Thu) | Real trending repos/papers/releases in a rotating focus (agents, LLM infra, …): what's worth adopting + why. | `api` GitHub trending (kept) + `web` papers/releases, cited. |
| **Marketing** (`mkt`) | 2×/wk (Mon/Thu) | Real demand signals (HN/Dev.to) → a concrete content/social plan tied to what's actually trending. | `api` HN/Dev.to/Analytics (kept) + `web` channel trends, cited. |
| **Operations** (`ops`) | Daily | Real deploy/CI health (Vercel + GitHub) → scorecard + the single thing to fix today. | `api` Vercel/GitHub (kept, deterministic). Minimal web. |
| **CEO** (`ceo`) | Weekly (Sun) | Executive **synthesis** of the week's six-agent output → decisions, risks, priorities. Aggregates, does not re-research. | Internal — reads the other agents' KB reports. No external API. |

**Net:** ~14 runs/week (vs 42). Fewer, deeper, cheaper-per-week; each run is a real research artifact.

**Cron change:** `vercel.json` moves from 6 daily entries to per-agent day-of-week schedules (staggered hours preserved). Verify in Vercel after deploy.

---

## 7. Report Template (uniform across agents)

Every report follows one structure so dashboards stay consistent (body in **Thai**, the two footer headers stay **English** for the parser):

```
# <Title> — <dept> · <date> · <theme>
## สรุป (TL;DR)
## ผลการวิเคราะห์        ← tables / charts (from validated findings)
## แหล่งอ้างอิง          ← citations {url, title, date}
## ข้อจำกัด / คำเตือน    ← disclaimer (Finance: not licensed advice, past≠future)
## Highlight             ← English header, Thai body (parser)
## Flags                 ← English header, Thai body (parser)
```

**Implementation touch points:**
- Edit each `.agents/*.md` brief so its workflow demands this depth + emits the `findings` JSON block. (Briefs ARE the spec — `roles.ts` reads them at runtime; `roles.test.ts` asserts verbatim equality; they ship via `outputFileTracingIncludes`.)
- `personas.ts` gains a format-overriding instruction to emit the `findings` block (guarded by `personas.test.ts`, same as the existing `OUTPUT_FOOTER` contract).

---

## 8. KB Persistence & Knowledge Graph

### 8.1 Entry model (v2)

```
kb:entry:<id> {
  id, slug,                 // slug = "fin-sp500-2026-06-04" → clean public URLs
  dept, category, theme,    // theme drives the series chain
  title, markdown,          // full report (~500–1200 words)
  artifacts[], sources[],   // charts + citations {url,title,date}
  provenance,               // 'api' | 'web'
  tags[], related[],        // related = explicit links to other entry ids
  status, pinned, createdAt, updatedAt
}
```

`redis.ts` `normalizeKbEntry` gains `slug / theme / sources / related / provenance`. **Backfill on read:** pre-v1.4 entries get `provenance:'api'`, `related:[]`, a derived `slug`, `theme` from tags/category — nothing already public regresses. **Draft→publish gate unchanged.**

### 8.2 Link types (built deterministically at write time)

1. **Series links** — same `dept + theme` auto-chains chronologically (e.g. the "S&P500 fund comparison" timeline week to week).
2. **Cross-agent links** — the CEO weekly synthesis stores the six source entry ids in `related[]`, so its report hyperlinks down to the evidence behind each conclusion.
3. **Tag graph** — shared `tags` create soft links (e.g. everything tagged `semiconductor` across Finance + R&D).

### 8.3 Public contract — `/api/kb` (locked in core)

- Existing filters stay, **published-only**: `?dept=&category=&q=&from=&to=&limit=`.
- **New** `?slug=` / `?id=` → returns **one entry with its `related` resolved** (series + cross-links + same-tag neighbours) in a single call.
- Response includes full `markdown`, `sources`, `artifacts`, `provenance`, `theme`, `slug`.
- This is the stable contract `kb.nanoteofficial.me` (fast-follow) consumes — no UI guessed now.

`redis.ts` owns the new resolution helpers (`resolveRelated`, slug/series indexing); `kb.ts` `getKnowledge()` exposes the `?slug=`/`?id=` single-entry path.

---

## 9. Telegram On-Demand Deep-Dive

Current `/ask <dept> <q>` = shallow 600-token, no search, single-turn. v1.4:

1. **`/ask <dept> <brief>` → real research.** Turns on `web_search`, larger token budget, runs the agent's full brief workflow with citations. One-shot still works: unanswered brief questions → stated assumptions.
2. **Threaded follow-ups (multi-turn).** After an `/ask`, that chat becomes **focused** on that dept for ~15 min (Redis session, short TTL, stores the last few turns). Plain messages then continue the thread — the agent can ask back *"SSF or RMF? hedged?"* and the user just replies, no command. `/end` or timeout clears focus.
3. **New commands:** `/agents` (list the six + cadence), `/report <dept>` (latest published KB report). `/run`, `/status`, `/help` (refreshed) stay.

**Guardrails:** still gated to `TELEGRAM_ALLOWED_CHAT_ID`; deep-dives run in `after()` within `maxDuration:300`; session state is per-chat in Redis with TTL so nothing leaks across days. `parseCommand` extends to the new commands; focus-session is a small typed helper, unit-tested.

---

## 10. Components / Files Touched

- **Briefs:** `.agents/Finance Agent.md` (drop crypto, add findings block) + the other 5 briefs (mandate + findings block).
- **Agent modules:** `finance.ts`, `cyberx.ts`, `rnd.ts`, `marketing.ts`, `operations.ts`, `ceo.ts` — each gains web-search run + `parse<Dept>Findings()` + updated `<dept>Artifacts()`.
- **`personas.ts`** — findings-block instruction (guarded by `personas.test.ts`).
- **`artifacts.ts`** — `Artifact` gains `provenance?` + `sources?`; shared `Findings`/citation types.
- **`runner.ts`** — assembles the report template, writes the enriched KB entry, computes `related`/`slug`/`theme`.
- **`redis.ts`** — `normalizeKbEntry` v2, slug/series indexing, `resolveRelated`.
- **`kb.ts`** + **`/api/kb`** — single-entry `?slug=`/`?id=` path with resolved related; published-only filters unchanged.
- **`claude.ts`** — used as-is (`webSearch:true`), possibly a per-dept `maxSearches`.
- **Charts:** `ArtifactRenderer` + detail page — provenance badge + Sources section.
- **Telegram:** `telegram.ts` (`parseCommand` + focus-session helper), `/api/telegram/route.ts` (deep-dive `/ask`, threading, `/agents`, `/report`).
- **`vercel.json`** — mixed-cadence cron.
- **`next.config.ts`** — `outputFileTracingIncludes` already covers `.agents/*.md`; verify still complete.

## 11. Testing

- `parse<Dept>Findings()` — one test file each: valid JSON → findings; `web` figure missing citation → dropped; malformed → `null`.
- `<dept>Artifacts()` — extend for findings-shaped input + `provenance` tag.
- `kb`: `normalizeKbEntry` backfill; series/cross-link/tag-graph resolution; `?slug=` returns resolved `related`; published-only still enforced.
- Telegram: `parseCommand` for `/agents`, `/report`; focus-session TTL logic.
- No visual tests for charts/iso — verify with dev server + screenshots.

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Web-search cost / latency | Mixed cadence (42→~14 runs/wk); per-agent `maxSearches` cap; `maxDuration:300` already set. |
| Model emits bad/empty findings | Validator drops silently → narrative + Highlight/Flags still ship (graceful degrade). |
| Hallucinated citation (URL looks real but isn't) | Require `{url,date}` + provenance badge + **admin publish gate** (human approves before public). MCP connectors remove this later. |
| Cron rewrite | Verify per-day-of-week schedules in Vercel post-deploy. |
| Migration | Additive only; old KB entries normalize on read; CoinGecko kept but unwired. No destructive changes. |

## 13. Future Hooks (recorded, not built in core)

- **MCP data connectors** → replace `web` research for funds/markets with structured feeds.
- **TH/EN bilingual** (1.4.1) — report template already section-structured; i18n slots into headers + UI.
- **`/doc` GitHub-Docs user guide** (1.4.2).
- **`kb.nanoteofficial.me` reader site** (1.4.x) — consumes the locked §8.3 graph API.
- **Telegram UX polish** — inline buttons, richer formatting.

## 14. Deploy

`base-deployment` workflow → version bump to **1.4.0**, verify build/lint/tsc/tests, commit, confirm Vercel production push, set Telegram webhook unchanged, verify cron in Vercel dashboard.
