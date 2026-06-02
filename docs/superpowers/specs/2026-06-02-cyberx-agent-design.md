# CyberX Agent — v0.4 Design Spec

**Date:** 2026-06-02
**Project:** company.nanoteofficial.me (AI Company Simulator)
**Status:** Approved for planning

## Summary

Add a sixth department agent, **CyberX**, a Cybersecurity & Threat-Intelligence
lead that produces a daily threat brief from real-world data (CISA Known
Exploited Vulnerabilities + security news). CyberX runs **first** each day so its
findings and flags seed the rest of the company via the v0.3 cross-department
memory. Visually it gets its own office zone inserted **directly to the right of
the CEO**, widening the office floor from 5 zones to 6.

**Cost:** every data source is free (public KEV JSON, public RSS, Hobby cron,
free-tier Redis). The only paid piece is the LLM call that writes the prose, so
CyberX is run on the cheapest model — **Claude Haiku** with a tight token cap —
keeping it a real Claude agent (consistent with the other five) at roughly a
fraction of a cent per day.

This follows the established v0.2/v0.3 agent pattern: the agent logic is a
well-trodden path (department module + persona + source adapter + `Record<DeptId>`
registry entries). The bulk of the effort is the **canvas relayout** to open a
sixth zone.

## Goals

- A real, daily-updating cybersecurity agent grounded in authoritative threat data.
- Seamless integration into the v0.3 collaboration model (memory, digest, flags).
- Faithful placement: CyberX sits immediately to the CEO's right.
- No new external credentials; both data sources are public.
- Minimal cost: free data sources; the LLM call uses Claude Haiku with a tight
  token cap (~a fraction of a cent/day). Reuses the existing `ANTHROPIC_API_KEY`.

## Non-Goals (out of scope)

- Refactoring `furniture.ts` to be zone-parameterized (Approach C — noted as a
  future cleanup, not done here).
- Any office engine change beyond widening `ROOM_W` and shifting furniture.
- A second office row / multi-row layout.
- Visitor chat or any interactive UI.
- Telegram bot behavior changes.
- New environment variables.

---

## 1. Identity & Placement

| Field | Value |
|-------|-------|
| DeptId | `'cyb'` |
| Name | `CyberX` |
| Short name | `CYB` |
| Accent color | `#39ff9d` (neon green / cyber) |
| Default task | `● scanning threats` |

CyberX is inserted as **zone 2** (index 1 in `DEPARTMENTS`), directly right of the
CEO. The four existing zones — Marketing, R&D, Operations, Finance — shift right
by a uniform **+4.0** grid offset. CyberX occupies the vacated `x≈4.1–7.8` slot.
The office width `ROOM_W` widens from **20 → 24** tiles.

Exact coordinates are derived in implementation by applying the +4.0 shift rule.
Reference (current → new) for `DEPT_ZONE_BOUNDS` / homes:

| Zone | Current x-range | New x-range |
|------|-----------------|-------------|
| ceo  | 0.1 – 3.8 | 0.1 – 3.8 (unchanged) |
| **cyb** | — | **4.1 – 7.8 (new)** |
| mkt  | 4.1 – 7.8 | 8.1 – 11.8 |
| rnd  | 8.1 – 12.8 | 12.1 – 16.8 |
| ops  | 13.1 – 16.8 | 17.1 – 20.8 |
| fin  | 17.1 – 19.8 | 21.1 – 23.8 |

`homeX` and `WORKSTATIONS` x-values for mkt/rnd/ops/fin shift by +4.0; CyberX gets
a new home/workstation inside its zone (home ≈ 5.2, workstation ≈ 5.2).

---

## 2. Data Source — `src/lib/sources/threatintel.ts` (new)

A new source adapter, mirroring the plain-`fetch` + manual-shape style of
`githubApi.ts` / `coingecko.ts`. **No new npm dependency.**

```
fetchKev(): Promise<KevEntry[]>
  - GET CISA KEV catalog JSON (public, no auth):
    https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json
  - Sort by dateAdded desc, take top ~10.
  - KevEntry: { cveId, vendorProject, product, vulnerabilityName, dateAdded, shortDescription }

fetchSecurityNews(): Promise<NewsItem[]>
  - GET The Hacker News RSS (public): https://feeds.feedburner.com/TheHackersNews
  - Lightweight regex parse of <item> -> title + link, take top ~5.
  - NewsItem: { title, link }

formatThreatIntel(kev: KevEntry[], news: NewsItem[]): string[]
  - Human-readable lines for the prompt, e.g.
    "CVE-2026-1234 — Acme Corp Widget: actively exploited (added 2026-06-01)"
    "news: <headline>"
```

**Resilience:** both fetchers wrap network/parse work in try/catch and return `[]`
on failure (same contract as `githubApi.ts`). A feed outage degrades the brief but
never throws.

**Notes:** The KEV JSON is large (~1MB+); fetch fully, then sort+slice. RSS is
parsed with a minimal regex (no XML lib), consistent with the codebase's
manual-parse convention.

---

## 3. Agent Module — `src/lib/agents/cyberx.ts` (new)

Structurally mirrors `finance.ts`:

```ts
export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const [kev, news] = await Promise.all([fetchKev(), fetchSecurityNews()]);
  const lines = formatThreatIntel(kev, news);
  const context = formatContext(ctx);
  const markdown = await complete({
    system: PERSONAS.cyb,
    prompt: `${context ? context + '\n\n---\n\n' : ''}Today's threat feed:\n${lines.join('\n')}\n\n` +
            `Write a brief (120-180 word) threat-intelligence note: what's newly exploited, ` +
            `relevance to a small web/cloud company, and a one-line risk posture. ` +
            `Include a Sources list.`,
    model: 'claude-haiku-4-5-20251001',   // cheapest model — cost-minimized
    maxTokens: 600,                        // tight cap for a short brief
  });
  return {
    markdown,
    summary: briefSummary(kev),            // e.g. "3 newly-exploited CVEs · top: CVE-2026-…"
    feedMsg: `threat: ${news[0]?.title ?? kev[0]?.cveId ?? 'n/a'}`,
    meta: { kev, news },
  };
}
```

---

### 3a. Model override — `src/lib/claude.ts` (modified)

`complete()` currently hardcodes `MODEL = 'claude-sonnet-4-6'`. Add an optional
`model?: string` field to `CompleteOpts`, defaulting to the existing `MODEL`:

```ts
export interface CompleteOpts {
  system: string;
  prompt: string;
  model?: string;        // NEW — defaults to MODEL (sonnet)
  maxTokens?: number;
  webSearch?: boolean;
  maxSearches?: number;
}
// inside complete():
const { system, prompt, model = MODEL, maxTokens = 1500, ... } = opts;
// ...messages.create({ model, ... })
```

The other five agents pass no `model` and are unchanged. Only CyberX opts into
`'claude-haiku-4-5-20251001'`. This is the sole edit needed to support the
cost-minimized model.

## 4. Persona — `PERSONAS.cyb`

Added to `src/lib/agents/personas.ts`. Inherits the shared `OUTPUT_FOOTER`
(`## Highlight` / `## Flags`).

> You are CyberX, the Cybersecurity & Threat-Intelligence lead at NaNote Corp.
> Voice: calm, precise, security-analyst (SOC). You produce a short daily threat
> brief: summarize newly-exploited vulnerabilities (CISA KEV) and notable security
> events, assess relevance to a small web/cloud company, and give a one-line risk
> posture. Output GitHub-flavored markdown with a Sources list. Flag
> infrastructure- or dependency-relevant CVEs to Operations and strategic risks to
> the CEO.

---

## 5. Cross-Department Wiring

- **Cron:** add a new **first** entry to `vercel.json`:
  `{ "path": "/api/cron/run?dept=cyb", "schedule": "0 10 * * *" }` (10:00 UTC,
  before Finance at 11:00). Vercel Hobby already runs 5 daily crons here, so a 6th
  daily cron is within plan limits.
- **Seed role:** running first, CyberX has no same-day peers to reference. The v0.3
  runner already persists every department's output + parsed flags to history and
  the company digest; downstream agents (R&D 12:00, Ops 14:00, CEO 15:00) read
  earlier-run peers through the existing "Today's Company Activity" context
  builder.
  - **Implementation check:** confirm `runner.buildContext()` assembles same-day
    peers generically by run order / timestamp rather than from a hardcoded
    5-department list. If hardcoded, add `cyb`.
- **Persona nudges:** lightly update the **Ops** persona to consider CyberX's
  security flags. The CEO persona already references department outputs generically
  — no change required.

---

## 6. Canvas Relayout (bulk of the work)

| File | Change |
|------|--------|
| `src/lib/iso/engine.ts` | `ROOM_W` 20 → 24 |
| `src/lib/data/departments.ts` | Insert `cyb` into `DEPARTMENTS` at index 1; add `DEPT_ZONE_BOUNDS.cyb`; shift mkt/rnd/ops/fin coords +4.0 |
| `src/lib/data/waypoints.ts` | Add `WORKSTATIONS.cyb`; shift mkt/rnd/ops/fin +4.0; re-center shared waypoints (MEETING, COFFEE) for the wider room |
| `src/lib/iso/furniture.ts` | Shift all gx≥4 furniture +4.0; add a CyberX desk + themed prop (threat-monitor screen with green glow); re-center meeting table / coffee |
| `src/lib/agents/sprites.ts` | Add `SPRITE_DATA.cyb` — dark hoodie, hood up, green terminal-glow visor (`#39ff9d`), 9-wide grid style matching the others |

Camera bounds already pan across the strip and derive from `ROOM_W`, so widening
the room extends the pannable world automatically.

---

## 7. Registry & Glue

These `Record<DeptId, …>` maps and registries must gain a `cyb` entry — TypeScript
enforces completeness, so none can be missed:

| File | Change |
|------|--------|
| `src/lib/agents/index.ts` | `AGENTS.cyb = cyberx.run`; add `'cyb'` to `isDeptId` |
| `src/lib/agents/personas.ts` | `PERSONAS.cyb` (§4) |
| `src/lib/agents/sprites.ts` | `SPRITE_DATA.cyb` (§6) |
| `src/lib/data/departments.ts` | `DEPARTMENTS` entry + `DEPT_ZONE_BOUNDS.cyb` (§1, §6) |
| `src/lib/data/waypoints.ts` | `WORKSTATIONS.cyb` (§6) |
| `src/lib/data/logMessages.ts` | Add a `cyb` startup log line; bump "5 agents online" → "6 agents online" |

API routes (`/api/cron/run`, `/api/agents`) and the Telegram webhook already work
generically via `isDeptId` and `DEPARTMENTS` — no per-route changes needed.

---

## 8. Testing (41 → ~45)

- `src/lib/sources/threatintel.test.ts` — mock `fetch` for KEV JSON + RSS XML;
  assert parsing, sorting/slicing, and empty-on-failure behavior.
- CyberX run test (new `cyberx.test.ts` or extend `runner.test.ts`) — persona
  wired, `run()` returns the expected `AgentRunResult` shape (mock `complete`),
  and asserts it requests the Haiku model with the capped `maxTokens`.
- Zone-bounds sanity test — 6 zones, no overlapping x-ranges, all within `ROOM_W`.
- Update any existing test that asserts a 5-agent / 5-department count to 6.

---

## 9. Data Flow

```
Cron fires (cyb 10:00 UTC — first of the day)
  -> /api/cron/run?dept=cyb  (CRON_SECRET-protected)
  -> runner.buildContext('cyb')   // own history + company digest; no same-day peers yet
  -> cyberx.run(context)
       -> Promise.all(fetchKev(), fetchSecurityNews())
       -> formatThreatIntel(...)
       -> complete({ system: PERSONAS.cyb, ... })
  -> runner parses ## Highlight / ## Flags
  -> persist artifact + history + digest (Redis)  // available to later agents
  -> telegram notify

Later crons (rnd 12:00, ops 14:00, ceo 15:00)
  -> buildContext() includes CyberX in "Today's Company Activity"
  -> Ops reacts to CyberX vulnerability flags; CEO folds security posture into strategy

Visual (concurrent):
  OfficeApp polls /api/agents -> cyb status drives StateOverlay
  -> CyberX sprite animates at its workstation in the new zone-2 office slot
```

---

## 10. File Manifest

**New:**
- `src/lib/sources/threatintel.ts`
- `src/lib/sources/threatintel.test.ts`
- `src/lib/agents/cyberx.ts`

**Modified:**
- `src/lib/claude.ts` (add `model?` override to `CompleteOpts`)
- `src/lib/agents/index.ts`
- `src/lib/agents/personas.ts`
- `src/lib/agents/sprites.ts`
- `src/lib/data/departments.ts`
- `src/lib/data/waypoints.ts`
- `src/lib/data/logMessages.ts`
- `src/lib/iso/engine.ts`
- `src/lib/iso/furniture.ts`
- `vercel.json`
- Tests as listed in §8
