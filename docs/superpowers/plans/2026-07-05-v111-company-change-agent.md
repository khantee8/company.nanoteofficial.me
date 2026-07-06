# v1.11.0 "The Company Change Agent" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the six agents into backend (CEOX, OperX — no KB, `/admin`-only, self-healing) and frontend (FinX, CyberX, M&SX, AIX — quality-gated auto-publish to KB + Library sync) roles, add CEOX strategy boards, an OperX retry sweep, and a derived KB knowledge-graph API.

**Architecture:** Role is config on the existing dept registry — one runner, one branch at the KB fan-out step. All new logic is pure, unit-tested modules (`kbGate`, `watchdog`, `kbGraph`, board builders); LLM output stays validated-never-trusted. No dept-ID/Redis/URL migration.

**Tech Stack:** Next.js 16 App Router, TypeScript, Upstash Redis, Vitest, hand-rolled SVG/CSS charts (zero deps).

**Spec:** `docs/superpowers/specs/2026-07-05-v111-company-change-agent-design.md`

## Global Constraints

- Internal dept IDs stay `ceo, fin, cyb, mkt, rnd, ops` — never rename keys, routes, cron URLs, or `CATEGORY_BY_DEPT`.
- New display names exactly: `CEOX`, `FinX`, `CyberX` (unchanged), `M&SX`, `AIX`, `OperX`.
- No `dangerouslySetInnerHTML`. Charts built deterministically by builders; LLM findings validated via `extractFindingsBlock` + shape checks, never trusted raw.
- Artifacts are never uncited: `'web'` provenance requires sources (`withProvenance` enforces); boards/KPIs are `'api'` (internal synthesis).
- Backend depts (`ceo`, `ops`) must never call `repo.pushKb` or `pushLibrarySync`.
- Auto-publish only through `qualityGate()`; gate failure → `draft` (existing admin curation flow).
- Max ONE watchdog retry per dept per day, flag written BEFORE the rerun.
- `/api/kb/graph` serves published entries only (same rule as `/api/kb`).
- All new pure units get vitest coverage; UI verified via dev server (repo convention — no visual unit tests).
- Run `npx tsc --noEmit` and `npm test` before every commit.

---

### Task 1: Role seam + display renames in the dept registry

**Files:**
- Modify: `src/lib/data/departments.ts` (Department interface + DEPARTMENTS array, lines 12-33)
- Test: `src/lib/data/departments.test.ts` (create)

**Interfaces:**
- Produces: `Department.role: 'frontend' | 'backend'`; `isFrontendDept(id: DeptId): boolean`; renamed `name`/`shortName` values. Tasks 3, 8 consume `isFrontendDept`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/data/departments.test.ts
import { describe, it, expect } from 'vitest';
import { DEPARTMENTS, isFrontendDept } from './departments';

describe('department roles (v1.11)', () => {
  it('CEOX and OperX are backend; the four research depts are frontend', () => {
    const roleOf = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d.role]));
    expect(roleOf).toEqual({
      ceo: 'backend', ops: 'backend',
      fin: 'frontend', cyb: 'frontend', mkt: 'frontend', rnd: 'frontend',
    });
    expect(isFrontendDept('fin')).toBe(true);
    expect(isFrontendDept('ceo')).toBe(false);
  });

  it('carries the v1.11 display names', () => {
    const nameOf = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d.name]));
    expect(nameOf).toEqual({
      ceo: 'CEOX', fin: 'FinX', cyb: 'CyberX', mkt: 'M&SX', rnd: 'AIX', ops: 'OperX',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/departments.test.ts`
Expected: FAIL (`role` does not exist, names differ)

- [ ] **Step 3: Implement**

In `src/lib/data/departments.ts`, add to the `Department` interface (after `task: string;`):

```ts
  /** v1.11 — backend = internal ops (no KB); frontend = research → published KB. */
  role: 'frontend' | 'backend';
```

Replace the `DEPARTMENTS` array entries (keep `color/homeX/homeY/elevation/task` values exactly as they are today; only `name`, `shortName` change and `role` is added):

```ts
export const DEPARTMENTS: Department[] = [
  { id: 'ceo', name: 'CEOX',   shortName: 'CEOX', color: '#ffdd57', homeX: 5.5,  homeY: 2.4, elevation: MEZZANINE_ELEVATION, task: '● directing team',    role: 'backend' },
  { id: 'fin', name: 'FinX',   shortName: 'FinX', color: '#7f8cff', homeX: 18.0, homeY: 2.4, elevation: MEZZANINE_ELEVATION, task: '● analyzing markets', role: 'frontend' },
  { id: 'cyb', name: 'CyberX', shortName: 'CYB',  color: '#39ff9d', homeX: 3.0,  homeY: 6.6, elevation: 0, task: '● scanning threats',  role: 'frontend' },
  { id: 'mkt', name: 'M&SX',   shortName: 'M&SX', color: '#ff6b9d', homeX: 9.0,  homeY: 6.6, elevation: 0, task: '● drafting content',  role: 'frontend' },
  { id: 'rnd', name: 'AIX',    shortName: 'AIX',  color: '#00cfff', homeX: 15.0, homeY: 6.6, elevation: 0, task: '● scanning research', role: 'frontend' },
  { id: 'ops', name: 'OperX',  shortName: 'OperX', color: '#ff9a3c', homeX: 21.0, homeY: 6.6, elevation: 0, task: '● monitoring systems', role: 'backend' },
];
```

Add below `isRaised`:

```ts
/** v1.11 role seam — frontend depts research & publish to the KB; backend depts
 *  (CEOX strategy, OperX ops) surface only in /admin and never write KB. */
export const isFrontendDept = (id: DeptId): boolean =>
  DEPARTMENTS.find((d) => d.id === id)?.role === 'frontend';
```

- [ ] **Step 4: Run test + sweep for broken name assertions**

Run: `npx vitest run src/lib/data/departments.test.ts` → PASS.
Run: `npm test` and `rg -n "NaNote CEO|Marketing & Social Media|AI R&D|'Operations'|\"Operations\"|'Finance'|\"Finance\"" src content .agents --glob '!*.md'`
Any test or UI string asserting/holding an old display name: update to the new name using the table in Global Constraints (IDs and `CATEGORY_BY_DEPT` untouched). Re-run `npm test` until green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/departments.ts src/lib/data/departments.test.ts $(git diff --name-only)
git commit -m "feat(v1.11): role seam + CEOX/FinX/M&SX/AIX/OperX display renames"
```

---

### Task 2: `qualityGate` — the auto-publish gate

**Files:**
- Create: `src/lib/agents/kbGate.ts`
- Test: `src/lib/agents/kbGate.test.ts`

**Interfaces:**
- Consumes: `AgentRunResult` from `./types`.
- Produces: `qualityGate(result: AgentRunResult): boolean`. Task 3 consumes it.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agents/kbGate.test.ts
import { describe, it, expect } from 'vitest';
import { qualityGate } from './kbGate';
import type { AgentRunResult } from './types';

const base: AgentRunResult = {
  markdown: '# report', summary: 'good run', feedMsg: 'x',
  sources: [{ url: 'https://a', title: 'A', date: '2026-07-01' }],
};

describe('qualityGate', () => {
  it('passes a clean run with cited sources', () => {
    expect(qualityGate(base)).toBe(true);
  });
  it('passes when citations live on a web artifact instead of result.sources', () => {
    expect(qualityGate({ ...base, sources: [], artifacts: [
      { kind: 'tags', title: 't', tags: ['x'], provenance: 'web',
        sources: [{ url: 'https://a', title: 'A', date: '2026-07-01' }] },
    ] })).toBe(true);
  });
  it('fails an incomplete (truncated/errored) run', () => {
    expect(qualityGate({ ...base, incomplete: true })).toBe(false);
  });
  it('fails a run with no cited material at all', () => {
    expect(qualityGate({ ...base, sources: [], artifacts: [
      { kind: 'tags', title: 't', tags: ['x'], provenance: 'api' },
    ] })).toBe(false);
  });
  it('fails an empty summary', () => {
    expect(qualityGate({ ...base, summary: '  ' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/kbGate.test.ts`
Expected: FAIL ("Cannot find module './kbGate'")

- [ ] **Step 3: Implement**

```ts
// src/lib/agents/kbGate.ts
import type { AgentRunResult } from './types';

/** v1.11 auto-publish gate for FRONTEND depts. A run may go straight to
 *  `published` (+ Library sync) only when it is demonstrably clean:
 *  finished (not truncated / zero-cited), carries cited material, and has a
 *  summary. Citation integrity itself is enforced upstream by each
 *  parse<Dept>Findings() (hasCitation needs url+date) — this gate only checks
 *  that cited material EXISTS. Anything less lands as a draft for /admin. */
export function qualityGate(result: AgentRunResult): boolean {
  if (result.incomplete) return false;
  if (!result.summary?.trim()) return false;
  const cited =
    (result.sources?.length ?? 0) > 0 ||
    (result.artifacts ?? []).some((a) => a.provenance === 'web' && (a.sources?.length ?? 0) > 0);
  return cited;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/kbGate.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/kbGate.ts src/lib/agents/kbGate.test.ts
git commit -m "feat(v1.11): qualityGate for frontend auto-publish"
```

---

### Task 3: Runner role branch (backend skips KB; frontend auto-publishes)

**Files:**
- Modify: `src/lib/agents/runner.ts` (`runAgent` fan-out, ~lines 150-207)
- Test: `src/lib/agents/runner.test.ts` (extend)

**Interfaces:**
- Consumes: `isFrontendDept` (Task 1), `qualityGate` (Task 2), existing `pushLibrarySync(slug, repo)` from `@/lib/librarySync`.
- Produces: role-branched `runAgent` — no signature change; later tasks rely on backend depts never writing KB.

- [ ] **Step 1: Write the failing tests** (append to `runner.test.ts`; `fakeRepo` already exists there — add `pushSyncLog: vi.fn(async () => {})` to it so `pushLibrarySync`'s log write is satisfied)

```ts
describe('runAgent — v1.11 role branch', () => {
  const citedResult = (over: Partial<AgentRunResult> = {}): AgentRunResult => ({
    markdown: '# x\n\n## Highlight\nH.\n\n## Flags\n- f',
    summary: 's', feedMsg: 'm',
    sources: [{ url: 'https://a', title: 'A', date: '2026-07-01' }],
    ...over,
  });

  it('backend dept (ceo) never writes KB', async () => {
    const repo = fakeRepo();
    await runAgent({ dept: 'ceo', run: async () => citedResult() }, { repo, notify: vi.fn(async () => {}) });
    expect(repo.pushKb).not.toHaveBeenCalled();
    expect(repo.setOutput).toHaveBeenCalled(); // /admin still gets the report
  });

  it('frontend dept publishing: clean cited run → status published', async () => {
    const repo = fakeRepo();
    await runAgent({ dept: 'cyb', run: async () => citedResult() }, { repo, notify: vi.fn(async () => {}) });
    expect(repo.pushKb).toHaveBeenCalledWith(expect.objectContaining({ status: 'published' }));
  });

  it('frontend dept gate fail (incomplete) → status draft, no Library sync', async () => {
    const repo = fakeRepo();
    await runAgent({ dept: 'cyb', run: async () => citedResult({ incomplete: true }) }, { repo, notify: vi.fn(async () => {}) });
    expect(repo.pushKb).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
    expect(repo.pushSyncLog).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/agents/runner.test.ts`
Expected: the three new tests FAIL (KB always written as draft today)

- [ ] **Step 3: Implement in `runner.ts`**

Add imports:

```ts
import { isFrontendDept } from '@/lib/data/departments';
import { qualityGate } from './kbGate';
import { pushLibrarySync } from '@/lib/librarySync';
```

In `runAgent`, replace the KB-archive element of the `Promise.all` array. Today it is:

```ts
      // Archive into the knowledge base as a DRAFT — the Admin KB Manager
      // reviews and publishes before it surfaces on the public /api/kb feed.
      repo.pushKb({ id, slug, dept, date, ts, category, theme,
        tags, status: 'draft', summary: result.summary, highlight, highlightEn, flags, flagsEn, artifacts,
        sources, provenance, related, markdown, markdownEn, incomplete }),
```

Immediately BEFORE the `await Promise.all([`, add:

```ts
    // v1.11 role seam — backend depts (CEOX/OperX) are /admin-only: no KB.
    // Frontend depts auto-publish through the quality gate; a failed gate is a
    // normal draft the Admin Knowledge panel promotes manually.
    const frontend = isFrontendDept(dept);
    const kbStatus: KbEntry['status'] = frontend && qualityGate(result) ? 'published' : 'draft';
```

(and add `KbEntry` to the existing type import from `./types`). Replace the KB element inside `Promise.all` with:

```ts
      ...(frontend
        ? [repo.pushKb({ id, slug, dept, date, ts, category, theme,
            tags, status: kbStatus, summary: result.summary, highlight, highlightEn, flags, flagsEn, artifacts,
            sources, provenance, related, markdown, markdownEn, incomplete })]
        : []),
```

After the `Promise.all`, before the existing `const warn = ...` line, add:

```ts
    if (frontend && kbStatus === 'published') await pushLibrarySync(slug, repo);
```

Replace the notify line:

```ts
    const warn = incomplete ? '\n⚠️ รายงานอาจไม่สมบูรณ์ — ตรวจก่อนเผยแพร่' : '';
    await notify(`*${dept.toUpperCase()}* ✓ ${result.summary}${warn}\n\n${markdown.slice(0, 800)}`);
```

with:

```ts
    const warn = incomplete ? '\n⚠️ รายงานอาจไม่สมบูรณ์ — ตรวจก่อนเผยแพร่' : '';
    const kbNote = !frontend ? ''
      : kbStatus === 'published' ? `\n📚 published → KB (${slug})`
      : '\n📝 draft — review in /admin';
    await notify(`*${dept.toUpperCase()}* ✓ ${result.summary}${warn}${kbNote}\n\n${markdown.slice(0, 800)}`);
```

Note: `pushLibrarySync` is fail-soft by contract (never throws, no-op when env unset) — no try/catch needed.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/agents/runner.test.ts` → all PASS, including pre-existing ones. The old first test asserts `pushKb ... status: 'draft'` for `fin` with no sources — an uncited run correctly stays draft, so it should still pass; if it asserts the old comment-era behavior only, leave as-is.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/runner.ts src/lib/agents/runner.test.ts
git commit -m "feat(v1.11): runner role branch — backend skips KB, frontend auto-publishes via qualityGate"
```

---

### Task 4: Rename the role-spec briefs

**Files:**
- Modify: `.agents/ceo.md`, `.agents/ops.md`, `.agents/fin.md` (or the actual brief filenames — check `BRIEF_FILES` in `src/lib/agents/roles.ts`), `.agents/mkt.md`, `.agents/rnd.md`

**Interfaces:**
- Consumes: nothing. Produces: briefs whose identity matches the new names; `roles.test.ts` continues to pass by construction (it compares ROLES to the file verbatim).

- [ ] **Step 1: Locate brief files and current identity lines**

Run: `rg -n "BRIEF_FILES" -A 10 src/lib/agents/roles.ts` then `head -5 .agents/*.md`

- [ ] **Step 2: Edit identities**

In each brief, update the agent's self-identity (title heading + any "คุณคือ…"/name lines) per the table: CEO→**CEOX**, Operations→**OperX**, Finance→**FinX**, Marketing & Social Media→**M&SX**, AI R&D→**AIX**. CyberX brief untouched. Do NOT change output-contract sections in this task (CEOX boards and OperX self-heal sections are added in Tasks 6 and 10 where their parsers land). Keep everything else verbatim.

- [ ] **Step 3: Verify + commit**

Run: `npx vitest run src/lib/agents/roles.test.ts && npm run build 2>&1 | tail -3` → PASS (briefs load verbatim; build confirms `outputFileTracingIncludes` still picks them up).

```bash
git add .agents
git commit -m "feat(v1.11): rename role-spec briefs to CEOX/OperX/FinX/M&SX/AIX"
```

---

### Task 5: `matrix` artifact kind + MatrixBoard renderer

**Files:**
- Modify: `src/lib/agents/artifacts.ts` (Artifact union), `src/components/charts/ArtifactRenderer.tsx` (switch), `src/lib/i18n/chartTitles.ts` (TH titles)
- Create: `src/components/charts/MatrixBoard.tsx`
- Test: `src/components/charts/ArtifactRenderer.test.tsx` (extend)

**Interfaces:**
- Produces: `{ kind: 'matrix'; title: string; layout: 'swot' | 'canvas' | 'forces'; cells: { label: string; items: string[] }[] }` in the `Artifact` union. Task 6 builds these.

- [ ] **Step 1: Extend the union** — in `artifacts.ts` add to the `Artifact` union (after the `checklist` line):

```ts
  | { kind: 'matrix'; title: string; layout: 'swot' | 'canvas' | 'forces';
      cells: { label: string; items: string[] }[] }
```

- [ ] **Step 2: Write the failing renderer test** (append to `ArtifactRenderer.test.tsx`, following its existing render-and-assert pattern):

```tsx
it('renders a matrix board with its cells', () => {
  render(<ArtifactRenderer artifact={{
    kind: 'matrix', title: 'SWOT', layout: 'swot',
    cells: [
      { label: 'Strengths', items: ['cited agents'] },
      { label: 'Weaknesses', items: ['single operator'] },
      { label: 'Opportunities', items: ['KB products'] },
      { label: 'Threats', items: ['API cost'] },
    ],
  }} />);
  expect(screen.getByText('Strengths')).toBeInTheDocument();
  expect(screen.getByText('cited agents')).toBeInTheDocument();
});

it('matrix renders an empty state without crashing', () => {
  render(<ArtifactRenderer artifact={{ kind: 'matrix', title: 'SWOT', layout: 'swot', cells: [] }} />);
  expect(screen.getByText(/no data/i)).toBeInTheDocument();
});
```

Run: `npx vitest run src/components/charts/ArtifactRenderer.test.tsx` → FAIL.

- [ ] **Step 3: Implement `MatrixBoard.tsx`** (match neighbouring chart components' styling conventions — read `Scorecard.tsx` first and mirror its container/classes):

```tsx
// src/components/charts/MatrixBoard.tsx — labeled cell-grid for strategy
// boards (SWOT 2-col, Canvas 3-col, Five Forces single column). Zero deps,
// SSR-safe, empty-state safe like every other chart primitive.
import type { Artifact } from '@/lib/agents/artifacts';

type MatrixArtifact = Extract<Artifact, { kind: 'matrix' }>;
const COLS: Record<MatrixArtifact['layout'], number> = { swot: 2, canvas: 3, forces: 1 };

export default function MatrixBoard({ a, compact }: { a: MatrixArtifact; compact?: boolean }) {
  if (a.cells.length === 0) return <div className="chart-empty">no data</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS[a.layout]}, minmax(0, 1fr))`, gap: 8 }}>
      {a.cells.map((c) => (
        <div key={c.label} style={{ border: '1px solid rgba(128,128,128,.25)', borderRadius: 8, padding: compact ? 6 : 10 }}>
          <div style={{ fontWeight: 700, fontSize: 12, opacity: .8, marginBottom: 4 }}>{c.label}</div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
            {c.items.map((it, i) => <li key={i}>{it}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

Wire the switch in `ArtifactRenderer.tsx`:

```tsx
    case 'matrix':        return <MatrixBoard a={artifact} compact={compact} />;
```

(plus the import). If the existing empty-state convention differs from `chart-empty` (check `Scorecard.tsx`/`Bars.tsx`), match the repo's convention and adjust the test's empty-state assertion accordingly.

Add TH titles in `chartTitles.ts` under a new `// CEOX strategy boards` group:

```ts
  'SWOT analysis': 'การวิเคราะห์ SWOT',
  'business model canvas': 'แคนวาสโมเดลธุรกิจ',
  'five forces': 'แรงกดดันทั้งห้า (Five Forces)',
  'company KPIs': 'ตัวชี้วัดบริษัท',
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/charts/ArtifactRenderer.test.tsx && npx tsc --noEmit` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/artifacts.ts src/components/charts src/lib/i18n/chartTitles.ts
git commit -m "feat(v1.11): matrix artifact kind + MatrixBoard strategy-board renderer"
```

---

### Task 6: CEOX strategy boards + KPI scorecard

**Files:**
- Modify: `src/lib/agents/ceo.ts` (findings schema, builders, run prompt), `src/lib/agents/runner.ts` (`buildContext` CEO branch — add KPI inputs), the CEO brief `.agents/<ceo brief>.md` (boards output schema section)
- Test: `src/lib/agents/ceo.findings.test.ts`, `src/lib/agents/ceo.artifacts.test.ts` (extend both)

**Interfaces:**
- Consumes: `matrix` artifact kind (Task 5).
- Produces: `CeoBoards` type; `parseCeoFindings` returning `{ decisions, risks, priorities, boards? }`; `ceoBoardArtifacts(boards: CeoBoards): Artifact[]`; `ceoKpiArtifact(kpi: CeoKpis): Artifact`; `AgentContext.companySnapshot` gains `kbPublishedCount?: number` and reuses existing `usage`.

- [ ] **Step 1: Write failing findings tests** (append to `ceo.findings.test.ts`):

```ts
it('parses valid boards and drops malformed cells', () => {
  const md = '```json findings\n' + JSON.stringify({
    decisions: ['d1'], risks: [], priorities: [],
    boards: {
      swot: { strengths: ['s'], weaknesses: ['w'], opportunities: ['o'], threats: ['t'] },
      canvas: { keyPartners: ['p'], keyActivities: ['a'], keyResources: ['r'], valuePropositions: ['v'],
                customerRelationships: ['c'], channels: ['ch'], customerSegments: ['cs'],
                costStructure: ['co'], revenueStreams: ['rev'] },
      forces: { rivalry: ['r'], newEntrants: ['n'], substitutes: 'NOT-AN-ARRAY',
                buyerPower: ['b'], supplierPower: ['s'] },
    },
  }) + '\n```';
  const f = parseCeoFindings(md)!;
  expect(f.boards?.swot?.strengths).toEqual(['s']);
  expect(f.boards?.canvas?.revenueStreams).toEqual(['rev']);
  expect(f.boards?.forces?.substitutes).toEqual([]); // malformed → []
});

it('boards absent → boards undefined (report still valid)', () => {
  const md = '```json findings\n{"decisions":[],"risks":[],"priorities":[]}\n```';
  expect(parseCeoFindings(md)!.boards).toBeUndefined();
});
```

- [ ] **Step 2: Write failing artifact tests** (append to `ceo.artifacts.test.ts`):

```ts
import { ceoBoardArtifacts, ceoKpiArtifact } from './ceo';

it('ceoBoardArtifacts builds matrix boards from findings, api provenance', () => {
  const arts = ceoBoardArtifacts({
    swot: { strengths: ['s'], weaknesses: [], opportunities: [], threats: [] },
    forces: { rivalry: ['r'], newEntrants: [], substitutes: [], buyerPower: [], supplierPower: [] },
  });
  expect(arts).toHaveLength(2); // swot + forces (no canvas provided)
  expect(arts[0]).toMatchObject({ kind: 'matrix', layout: 'swot', provenance: 'api' });
  expect(arts[0]).toMatchObject({ cells: expect.arrayContaining([{ label: 'Strengths', items: ['s'] }]) });
});

it('ceoKpiArtifact builds a deterministic scorecard', () => {
  const a = ceoKpiArtifact({ runsOk7d: 6, runsTotal7d: 7, kbPublished: 12, costMtdUsd: 0.42 });
  expect(a).toMatchObject({ kind: 'scorecard', title: 'company KPIs' });
  expect((a as { tiles: unknown[] }).tiles).toHaveLength(3);
});
```

Run: `npx vitest run src/lib/agents/ceo.findings.test.ts src/lib/agents/ceo.artifacts.test.ts` → FAIL.

- [ ] **Step 3: Implement in `ceo.ts`**

```ts
// Board schemas — fixed key sets; every cell validated to string[] (strArray),
// so a drifting model can blank a cell but never break the render.
const SWOT_KEYS = ['strengths', 'weaknesses', 'opportunities', 'threats'] as const;
const CANVAS_KEYS = ['keyPartners', 'keyActivities', 'keyResources', 'valuePropositions',
  'customerRelationships', 'channels', 'customerSegments', 'costStructure', 'revenueStreams'] as const;
const FORCES_KEYS = ['rivalry', 'newEntrants', 'substitutes', 'buyerPower', 'supplierPower'] as const;

export interface CeoBoards {
  swot?: Record<(typeof SWOT_KEYS)[number], string[]>;
  canvas?: Record<(typeof CANVAS_KEYS)[number], string[]>;
  forces?: Record<(typeof FORCES_KEYS)[number], string[]>;
}
export interface CeoFindings { decisions: string[]; risks: string[]; priorities: string[]; boards?: CeoBoards }

function board<K extends string>(raw: unknown, keys: readonly K[]): Record<K, string[]> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, strArray(r[k])])) as Record<K, string[]>;
}
```

Extend `parseCeoFindings` (keep the existing three fields):

```ts
export function parseCeoFindings(markdown: string): CeoFindings | null {
  const raw = extractFindingsBlock<Partial<CeoFindings>>(markdown);
  if (!raw) return null;
  const b = raw.boards as Record<string, unknown> | undefined;
  const boards: CeoBoards | undefined = b && typeof b === 'object'
    ? { swot: board(b.swot, SWOT_KEYS), canvas: board(b.canvas, CANVAS_KEYS), forces: board(b.forces, FORCES_KEYS) }
    : undefined;
  return { decisions: strArray(raw.decisions), risks: strArray(raw.risks),
           priorities: strArray(raw.priorities), boards };
}
```

Builders (labels are English literals — `chartTitles.ts` localizes at render time, matching repo convention):

```ts
const CELL_LABELS: Record<string, string> = {
  strengths: 'Strengths', weaknesses: 'Weaknesses', opportunities: 'Opportunities', threats: 'Threats',
  keyPartners: 'Key Partners', keyActivities: 'Key Activities', keyResources: 'Key Resources',
  valuePropositions: 'Value Propositions', customerRelationships: 'Customer Relationships',
  channels: 'Channels', customerSegments: 'Customer Segments', costStructure: 'Cost Structure',
  revenueStreams: 'Revenue Streams',
  rivalry: 'Competitive Rivalry', newEntrants: 'New Entrants', substitutes: 'Substitutes',
  buyerPower: 'Buyer Power', supplierPower: 'Supplier Power',
};

function matrixOf(title: string, layout: 'swot' | 'canvas' | 'forces',
                  cells: Record<string, string[]> | undefined): Artifact | null {
  if (!cells || Object.values(cells).every((v) => v.length === 0)) return null;
  return withProvenance({ kind: 'matrix', title, layout,
    cells: Object.entries(cells).map(([k, items]) => ({ label: CELL_LABELS[k] ?? k, items })) }, 'api');
}

/** v1.11 CEOX strategy boards — built deterministically from VALIDATED findings. */
export function ceoBoardArtifacts(boards: CeoBoards): Artifact[] {
  return [
    matrixOf('SWOT analysis', 'swot', boards.swot),
    matrixOf('business model canvas', 'canvas', boards.canvas),
    matrixOf('five forces', 'forces', boards.forces),
  ].filter((a): a is Artifact => a !== null);
}

export interface CeoKpis { runsOk7d: number; runsTotal7d: number; kbPublished: number; costMtdUsd: number }

/** v1.11 KPI scorecard — fully deterministic, no LLM input. */
export function ceoKpiArtifact(k: CeoKpis): Artifact {
  return withProvenance({ kind: 'scorecard', title: 'company KPIs', tiles: [
    { label: `runs 7d ${k.runsOk7d}/${k.runsTotal7d}`, state: k.runsOk7d === k.runsTotal7d ? 'ok' : k.runsOk7d > 0 ? 'warn' : 'down' },
    { label: `KB published ${k.kbPublished}`, state: k.kbPublished > 0 ? 'ok' : 'warn' },
    { label: `cost MTD $${k.costMtdUsd.toFixed(2)}`, state: 'ok' },
  ] }, 'api');
}
```

Wire into `run()`: extend the return's `artifacts` to
`[...ceoArtifacts(snapshot, markdown, findings), ...ceoBoardArtifacts(findings.boards ?? {}), ...(ctx.companySnapshot?.kpis ? [ceoKpiArtifact(ctx.companySnapshot.kpis)] : [])]`
and extend the prompt's final sentence to also request boards:
`เปิดรายงานด้วยบล็อก \`\`\`json findings (decisions/risks/priorities/boards ตามสคีมาในบทบาทของคุณ — boards ประกอบด้วย swot, canvas, forces)`.

In `types.ts` add to `companySnapshot`:

```ts
    /** v1.11 — deterministic KPI inputs for the CEOX scorecard (ceo runs only). */
    kpis?: { runsOk7d: number; runsTotal7d: number; kbPublished: number; costMtdUsd: number };
```

In `runner.ts` `buildContext` CEO branch (find where `companySnapshot` is filled for `ceo`), compute and attach `kpis`:

```ts
      const [kbPublished, usage] = await Promise.all([
        repo.listKb({ status: 'published' }),
        repo.getUsageSince(new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).getTime()),
      ]);
      const weekAgo = Date.now() - 7 * 86400_000;
      const recent = statuses.filter((s) => s.lastRun && Date.parse(s.lastRun) >= weekAgo);
      const kpis = {
        runsOk7d: recent.filter((s) => s.state === 'done').length,
        runsTotal7d: recent.length,
        kbPublished: kbPublished.length,
        costMtdUsd: estimateCostUsd(usage),
      };
```

(`estimateCostUsd` — reuse the existing v1.8 cost helper in `src/lib/agents/usage.ts`; check its exact exported name with `rg -n "export function" src/lib/agents/usage.ts` and use that. If the repo lacks a `getUsageSince`-style method, reuse whatever the Ops budget path calls — mirror it exactly.)

Finally, append the boards output schema to the CEO brief (same file as Task 4; add under its output-contract section, in Thai):

```markdown
### บอร์ดกลยุทธ์ (v1.11 — CEOX)
ในบล็อก ```json findings ให้เพิ่มคีย์ `boards` เสมอ:
- `swot`: { strengths, weaknesses, opportunities, threats — อาร์เรย์ข้อความสั้น 2-4 ข้อ อิงจากรายงานจริงของแผนกในสัปดาห์นี้ }
- `canvas`: { keyPartners, keyActivities, keyResources, valuePropositions, customerRelationships, channels, customerSegments, costStructure, revenueStreams — อาร์เรย์ 1-3 ข้อ อธิบายพอร์ตโฟลิโอผลิตภัณฑ์ NaNote (finance / cyber / kb / art) }
- `forces`: { rivalry, newEntrants, substitutes, buyerPower, supplierPower — อาร์เรย์ 1-3 ข้อ }
ห้ามแต่งข้อมูล — สังเคราะห์จาก digest และรายงานของแผนกเท่านั้น
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/agents/ceo.findings.test.ts src/lib/agents/ceo.artifacts.test.ts src/lib/agents/ceo.test.ts src/lib/agents/roles.test.ts && npx tsc --noEmit` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/ceo.ts src/lib/agents/types.ts src/lib/agents/runner.ts src/lib/agents/ceo.findings.test.ts src/lib/agents/ceo.artifacts.test.ts .agents
git commit -m "feat(v1.11): CEOX strategy boards (SWOT/canvas/forces) + deterministic KPI scorecard"
```

---

### Task 7: Redis — retry flags + sweep log

**Files:**
- Modify: `src/lib/redis.ts`
- Test: `src/lib/redis.test.ts` (extend, following its existing in-memory-client pattern)

**Interfaces:**
- Produces (on `RedisRepo`): `markRetried(dept: DeptId, date: string): Promise<void>`; `wasRetriedToday(dept: DeptId, date: string): Promise<boolean>`; `pushSweepLog(e: SweepLogEntry): Promise<void>`; `getSweepLog(): Promise<SweepLogEntry[]>`; exported `interface SweepLogEntry { dept: DeptId; ok: boolean; detail: string; ts: number }`. Tasks 8-10 consume these.

- [ ] **Step 1: Write failing tests** (mirror how `redis.test.ts` builds its fake client):

```ts
it('marks and reads the per-day retry flag', async () => {
  expect(await repo.wasRetriedToday('fin', '2026-07-05')).toBe(false);
  await repo.markRetried('fin', '2026-07-05');
  expect(await repo.wasRetriedToday('fin', '2026-07-05')).toBe(true);
  expect(await repo.wasRetriedToday('fin', '2026-07-06')).toBe(false); // next day resets
});

it('sweep log is capped LIFO', async () => {
  await repo.pushSweepLog({ dept: 'fin', ok: false, detail: 'timeout', ts: 1 });
  await repo.pushSweepLog({ dept: 'rnd', ok: true, detail: 'recovered', ts: 2 });
  const log = await repo.getSweepLog();
  expect(log[0]).toMatchObject({ dept: 'rnd', ok: true });
});
```

Run: `npx vitest run src/lib/redis.test.ts` → FAIL.

- [ ] **Step 2: Implement** — in `redis.ts`, add next to `SyncLogEntry`:

```ts
export interface SweepLogEntry { dept: DeptId; ok: boolean; detail: string; ts: number }
const SWEEPLOG_KEY = 'ops:sweeplog';
const SWEEPLOG_CAP = 50;
const retriedKey = (dept: DeptId, date: string) => `agent:retried:${dept}:${date}`;
```

and to the repo object (next to `pushSyncLog`):

```ts
    async markRetried(dept: DeptId, date: string) {
      await client.set(retriedKey(dept, date), '1', { ex: 172800 }); // self-expires after 2 days
    },
    async wasRetriedToday(dept: DeptId, date: string): Promise<boolean> {
      return (await client.get<string>(retriedKey(dept, date))) === '1';
    },
    async pushSweepLog(e: SweepLogEntry) {
      await client.lpush(SWEEPLOG_KEY, e);
      await client.ltrim(SWEEPLOG_KEY, 0, SWEEPLOG_CAP - 1);
    },
    async getSweepLog(): Promise<SweepLogEntry[]> {
      return await client.lrange<SweepLogEntry>(SWEEPLOG_KEY, 0, SWEEPLOG_CAP - 1);
    },
```

If the in-memory test client's `set` doesn't accept the `{ ex }` options argument, extend the fake (options ignored is fine — expiry isn't unit-tested).

- [ ] **Step 3: Run + commit**

Run: `npx vitest run src/lib/redis.test.ts && npx tsc --noEmit` → PASS

```bash
git add src/lib/redis.ts src/lib/redis.test.ts
git commit -m "feat(v1.11): retry-flag + sweep-log Redis methods for the OperX watchdog"
```

---

### Task 8: Watchdog — `decideRetry`, `SAFE_OVERRIDES`, `runSweep`

**Files:**
- Create: `src/lib/agents/watchdog.ts`
- Test: `src/lib/agents/watchdog.test.ts`

**Interfaces:**
- Consumes: `AgentStatus`, `RunOverrides` (types), `runAgent` (runner), `AGENTS` (index), Redis methods from Task 7, `isFrontendDept` (Task 1).
- Produces: `decideRetry(statuses: AgentStatus[], retriedToday: DeptId[], disabled: DeptId[]): DeptId | null`; `SAFE_OVERRIDES: RunOverrides`; `runSweep(deps: { repo: RedisRepo; notify: (t: string) => Promise<void> }): Promise<{ retried: DeptId | null; ok?: boolean }>`. Task 9 consumes `runSweep`.

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/agents/watchdog.test.ts
import { describe, it, expect } from 'vitest';
import { decideRetry, SAFE_OVERRIDES } from './watchdog';
import type { AgentStatus } from './types';

const st = (dept: AgentStatus['dept'], state: AgentStatus['state']): AgentStatus =>
  ({ dept, state, lastRun: '2026-07-05T10:00:00Z' });

describe('decideRetry', () => {
  it('picks a frontend dept in error state', () => {
    expect(decideRetry([st('fin', 'error'), st('cyb', 'done')], [], [])).toBe('fin');
  });
  it('never retries backend depts (ceo/ops)', () => {
    expect(decideRetry([st('ceo', 'error'), st('ops', 'error')], [], [])).toBeNull();
  });
  it('skips already-retried and disabled depts', () => {
    expect(decideRetry([st('fin', 'error')], ['fin'], [])).toBeNull();
    expect(decideRetry([st('fin', 'error')], [], ['fin'])).toBeNull();
  });
  it('returns at most one dept (first failing in registry order)', () => {
    expect(decideRetry([st('rnd', 'error'), st('fin', 'error')], [], [])).toBe('fin');
  });
  it('healthy company → null', () => {
    expect(decideRetry([st('fin', 'done'), st('cyb', 'idle')], [], [])).toBeNull();
  });
});

describe('SAFE_OVERRIDES', () => {
  it('is conservative: 1 search on the default cheap model', () => {
    expect(SAFE_OVERRIDES).toEqual({ maxSearches: 1, model: 'claude-haiku-4-5-20251001' });
  });
});
```

Run: `npx vitest run src/lib/agents/watchdog.test.ts` → FAIL.

- [ ] **Step 2: Implement**

```ts
// src/lib/agents/watchdog.ts — OperX self-heal (v1.11). Deterministic code
// heals; the OperX LLM run only narrates the sweep log. One retry per dept
// per day, flag written BEFORE the rerun so a crash can't loop.
import { DEPARTMENTS, isFrontendDept, type DeptId } from '@/lib/data/departments';
import type { AgentStatus, RunOverrides } from './types';
import type { RedisRepo } from '@/lib/redis';
import { runAgent } from './runner';
import { AGENTS } from './index';

/** Conservative retry settings — a thin report beats a dead one. The dept's
 *  next scheduled run uses its normal settings. */
export const SAFE_OVERRIDES: RunOverrides = { maxSearches: 1, model: 'claude-haiku-4-5-20251001' };

/** Pure: pick AT MOST ONE dept to heal (registry order). Backend depts are
 *  excluded — they synthesize internal state and are cheap to just rerun on
 *  their own schedule. */
export function decideRetry(statuses: AgentStatus[], retriedToday: DeptId[], disabled: DeptId[]): DeptId | null {
  for (const d of DEPARTMENTS) {
    if (!isFrontendDept(d.id)) continue;
    if (retriedToday.includes(d.id) || disabled.includes(d.id)) continue;
    if (statuses.find((s) => s.dept === d.id)?.state === 'error') return d.id;
  }
  return null;
}

export async function runSweep(deps: { repo: RedisRepo; notify: (t: string) => Promise<void> }):
  Promise<{ retried: DeptId | null; ok?: boolean }> {
  const { repo, notify } = deps;
  const date = new Date().toISOString().slice(0, 10);
  const [statuses, disabled] = await Promise.all([
    Promise.all(DEPARTMENTS.map((d) => repo.getStatus(d.id))),
    repo.getDisabledDepts(),
  ]);
  const retriedToday = (await Promise.all(
    DEPARTMENTS.map(async (d) => ((await repo.wasRetriedToday(d.id, date)) ? d.id : null)),
  )).filter((d): d is DeptId => d !== null);

  const dept = decideRetry(statuses, retriedToday, disabled);
  if (!dept) return { retried: null };

  await repo.markRetried(dept, date); // before the rerun — no retry loops
  try {
    const result = await runAgent({ dept, run: AGENTS[dept] }, { repo, notify }, SAFE_OVERRIDES);
    await repo.pushSweepLog({ dept, ok: true, detail: result.summary, ts: Date.now() });
    await notify(`🔧 OperX self-heal: ${dept.toUpperCase()} recovered`);
    return { retried: dept, ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await repo.pushSweepLog({ dept, ok: false, detail, ts: Date.now() });
    await notify(`🚨 OperX: ${dept.toUpperCase()} failed twice today — needs you (${detail.slice(0, 120)})`);
    return { retried: dept, ok: false };
  }
}
```

- [ ] **Step 3: Run + commit**

Run: `npx vitest run src/lib/agents/watchdog.test.ts && npx tsc --noEmit` → PASS

```bash
git add src/lib/agents/watchdog.ts src/lib/agents/watchdog.test.ts
git commit -m "feat(v1.11): OperX watchdog — decideRetry + one-shot safe-override sweep"
```

---

### Task 9: Sweep cron dispatch + schedule

**Files:**
- Modify: `src/app/api/cron/run/route.ts`, `vercel.json`

**Interfaces:**
- Consumes: `runSweep` (Task 8). Produces: `GET /api/cron/run?sweep=1` (CRON_SECRET-gated).

- [ ] **Step 1: Implement the route branch** — in `route.ts`, after the `authorized` check and BEFORE the `dept` parsing, add:

```ts
  // v1.11 — OperX self-heal sweep: retry (at most) one failed dept today.
  if (req.nextUrl.searchParams.get('sweep') === '1') {
    const sweep = await runSweep({ repo: getRepo(), notify: (t) => sendMessage(t) });
    return NextResponse.json({ ok: true, sweep });
  }
```

with import `import { runSweep } from '@/lib/agents/watchdog';`.

- [ ] **Step 2: Add the cron** — in `vercel.json` append to `crons`:

```json
    { "path": "/api/cron/run?sweep=1", "schedule": "0 16 * * *" }
```

(16:00 UTC — after the last dept slot at 15:00, so today's failures are visible.) **Contingency:** if the Vercel dashboard rejects a 7th Hobby cron at deploy time, remove this entry and instead call `runSweep` at the START of the `ops` 14:00 invocation (in the route: `if dept === 'ops' → await runSweep(...) first, then run ops`) — decide only if the deploy actually rejects.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -3` → green.
Manual check (no unit test for the route — repo convention): `npm run dev` then
`curl -s -H "Authorization: Bearer wrong" "http://localhost:3000/api/cron/run?sweep=1"` → `unauthorized` (401).

```bash
git add src/app/api/cron/run/route.ts vercel.json
git commit -m "feat(v1.11): sweep=1 cron dispatch for the OperX self-heal watchdog"
```

---

### Task 10: OperX narrates the sweep log

**Files:**
- Modify: `src/lib/agents/runner.ts` (`buildContext` ops branch), `src/lib/agents/types.ts` (companySnapshot), `src/lib/agents/operations.ts` (prompt), the Ops brief `.agents/<ops brief>.md`
- Test: `src/lib/agents/operations.test.ts` (extend)

**Interfaces:**
- Consumes: `getSweepLog` (Task 7). Produces: `companySnapshot.sweeps?: SweepLogEntry[]` filled for ops runs; OperX prompt gains a self-heal section.

- [ ] **Step 1: Types + context** — in `types.ts` `companySnapshot`, add:

```ts
    /** v1.11 — recent watchdog sweep outcomes; filled for the ops monitor only. */
    sweeps?: Array<{ dept: DeptId; ok: boolean; detail: string; ts: number }>;
```

In `runner.ts` `buildContext`, in the branch that fills `outputs`/`usage` for `ops`, also fetch `const sweeps = await repo.getSweepLog();` (add to the existing `Promise.all` there) and attach `sweeps: sweeps.slice(0, 10)`.

- [ ] **Step 2: Prompt** — in `operations.ts` `run()`, before the `completeRaw` call, build:

```ts
  const sweepLines = (ctx.companySnapshot?.sweeps ?? [])
    .map((s) => `${new Date(s.ts).toISOString().slice(0, 10)} ${s.dept}: ${s.ok ? 'auto-recovered' : 'RETRY FAILED'} — ${s.detail}`)
    .join('\n');
```

and add to the prompt string (after the `Agent run-health` block):

```
\n\nSelf-heal sweep log (watchdog auto-retries):\n${sweepLines || 'no sweeps'}\n
```

plus extend the Thai instruction sentence: `สรุปผลการซ่อมอัตโนมัติ (self-heal) ในรายงานด้วย — อะไรพังแล้วระบบซ่อมเองสำเร็จ อะไรซ่อมไม่สำเร็จและต้องการคน`.

- [ ] **Step 3: Test** — extend `operations.test.ts` (mirror its existing mock pattern): give `ctx.companySnapshot.sweeps = [{ dept: 'fin', ok: false, detail: 'timeout', ts: Date.now() }]`, run, and assert the prompt passed to the mocked `completeRaw` contains `'RETRY FAILED'`:

```ts
it('feeds the sweep log into the prompt', async () => {
  completeRaw.mockResolvedValue({ text: '```json findings\n{}\n```', stopReason: 'end_turn', usage: { input: 1, output: 1 }, model: 'm' });
  const { run } = await import('./operations');
  await run({ ownHistory: [], companyDigest: [], todayPeers: [],
    companySnapshot: { statuses: [], digest: [], sweeps: [{ dept: 'fin', ok: false, detail: 'timeout', ts: 1 }] } });
  expect(completeRaw.mock.calls[0][0].prompt).toContain('RETRY FAILED');
});
```

- [ ] **Step 4: Brief** — append to the Ops brief (Thai, under its report-structure section):

```markdown
### การซ่อมตัวเอง (v1.11 — OperX)
คุณคือ OperX ผู้ดูแลระบบภายใน (backend role — รายงานของคุณแสดงเฉพาะใน /admin ไม่เข้าคลังความรู้)
ระบบ watchdog จะลอง rerun เอเจนต์ที่ล้มเหลวให้อัตโนมัติวันละไม่เกิน 1 ครั้งต่อแผนก
ในรายงานทุกครั้ง ให้มีส่วน "Self-heal": อะไรพัง → ระบบซ่อมเองสำเร็จหรือไม่ → อะไรต้องการผู้ดูแล
```

- [ ] **Step 5: Run + commit**

Run: `npx vitest run src/lib/agents/operations.test.ts src/lib/agents/roles.test.ts && npx tsc --noEmit` → PASS

```bash
git add src/lib/agents/types.ts src/lib/agents/runner.ts src/lib/agents/operations.ts src/lib/agents/operations.test.ts .agents
git commit -m "feat(v1.11): OperX narrates the watchdog sweep log"
```

---

### Task 11: `buildKbGraph` — derived knowledge graph

**Files:**
- Create: `src/lib/kbGraph.ts`
- Test: `src/lib/kbGraph.test.ts`

**Interfaces:**
- Consumes: `KbEntry` from `@/lib/agents/types`.
- Produces: `buildKbGraph(entries: KbEntry[]): KbGraph` with `KbNode`/`KbEdge`/`KbGraph` exported. Task 12 consumes.

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/kbGraph.test.ts
import { describe, it, expect } from 'vitest';
import { buildKbGraph } from './kbGraph';
import type { KbEntry } from '@/lib/agents/types';

const entry = (id: string, over: Partial<KbEntry> = {}): KbEntry => ({
  id, slug: `s-${id}`, dept: 'fin', date: '2026-07-01', ts: '2026-07-01T00:00:00Z',
  category: 'market-brief', tags: [], status: 'published', summary: `sum ${id}`,
  highlight: '', flags: [], artifacts: [], sources: [], provenance: 'api',
  related: [], markdown: '', ...over,
});

describe('buildKbGraph', () => {
  it('maps entries to nodes (title = summary)', () => {
    const g = buildKbGraph([entry('a')]);
    expect(g.nodes).toEqual([expect.objectContaining({ id: 'a', slug: 's-a', title: 'sum a' })]);
    expect(g.edges).toEqual([]);
  });

  it('builds_on edges from related ids (only when the target exists)', () => {
    const g = buildKbGraph([entry('a', { related: ['b', 'ghost'] }), entry('b')]);
    expect(g.edges).toEqual([{ from: 'a', to: 'b', type: 'builds_on', weight: 1 }]);
  });

  it('same_theme edge once per pair, from < to by id', () => {
    const g = buildKbGraph([entry('b', { theme: 't' }), entry('a', { theme: 't' })]);
    expect(g.edges).toEqual([{ from: 'a', to: 'b', type: 'same_theme', weight: 1 }]);
  });

  it('shares_tag weight = shared-tag count', () => {
    const g = buildKbGraph([entry('a', { tags: ['x', 'y'] }), entry('b', { tags: ['x', 'y', 'z'] })]);
    expect(g.edges).toEqual([{ from: 'a', to: 'b', type: 'shares_tag', weight: 2 }]);
  });

  it('builds_on suppresses weaker derived edges for the same pair', () => {
    const g = buildKbGraph([entry('a', { related: ['b'], theme: 't', tags: ['x'] }),
                            entry('b', { theme: 't', tags: ['x'] })]);
    expect(g.edges).toEqual([{ from: 'a', to: 'b', type: 'builds_on', weight: 1 }]);
  });

  it('empty KB → empty graph', () => {
    expect(buildKbGraph([])).toEqual({ nodes: [], edges: [] });
  });
});
```

Run: `npx vitest run src/lib/kbGraph.test.ts` → FAIL.

- [ ] **Step 2: Implement**

```ts
// src/lib/kbGraph.ts — derived knowledge graph over PUBLISHED KB entries.
// Pure + computed on read: no stored edges, always consistent with the KB.
// ponytail: O(n²) pair scan — the KB is tens of entries; index if it hits thousands.
import type { KbEntry, KbCategory } from '@/lib/agents/types';
import type { DeptId } from '@/lib/data/departments';

export interface KbNode {
  id: string; slug: string; dept: DeptId;
  /** = entry summary (KB entries have no separate title field). */
  title: string;
  category: KbCategory; theme?: string; tags: string[]; date: string;
}
export interface KbEdge { from: string; to: string; type: 'builds_on' | 'same_theme' | 'shares_tag'; weight: number }
export interface KbGraph { nodes: KbNode[]; edges: KbEdge[] }

export function buildKbGraph(entries: KbEntry[]): KbGraph {
  const nodes: KbNode[] = entries.map((e) => ({
    id: e.id, slug: e.slug, dept: e.dept, title: e.summary,
    category: e.category, theme: e.theme, tags: e.tags, date: e.date,
  }));
  const ids = new Set(entries.map((e) => e.id));
  const edges: KbEdge[] = [];
  const linked = new Set<string>(); // unordered pair keys already carrying builds_on
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const e of entries) {
    for (const to of e.related) {
      if (!ids.has(to) || to === e.id) continue;
      edges.push({ from: e.id, to, type: 'builds_on', weight: 1 });
      linked.add(pairKey(e.id, to));
    }
  }
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [a, b] = [entries[i], entries[j]];
      const [from, to] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      if (linked.has(pairKey(a.id, b.id))) continue;
      if (a.theme && a.theme === b.theme) {
        edges.push({ from, to, type: 'same_theme', weight: 1 });
        continue; // strongest derived relation wins; avoid double edges per pair
      }
      const shared = a.tags.filter((t) => b.tags.includes(t)).length;
      if (shared > 0) edges.push({ from, to, type: 'shares_tag', weight: shared });
    }
  }
  return { nodes, edges };
}
```

- [ ] **Step 3: Run + commit**

Run: `npx vitest run src/lib/kbGraph.test.ts && npx tsc --noEmit` → PASS

```bash
git add src/lib/kbGraph.ts src/lib/kbGraph.test.ts
git commit -m "feat(v1.11): buildKbGraph — typed derived knowledge graph"
```

---

### Task 12: `GET /api/kb/graph` route

**Files:**
- Create: `src/app/api/kb/graph/route.ts`

**Interfaces:**
- Consumes: `buildKbGraph` (Task 11), `getKnowledge` from `@/lib/kb` (published-only), `getRepo`, `isDeptId`.
- Produces: public JSON `{ nodes, edges, generatedAt }` with optional `?dept=&category=` filters.

- [ ] **Step 1: Implement** (mirror `/api/kb/route.ts` conventions — read it first and copy its query-param validation style for `category`):

```ts
// src/app/api/kb/graph/route.ts — v1.11 knowledge graph. PUBLISHED-only, same
// visibility rule as /api/kb; consumed by kb.nanoteofficial.me and future products.
import { NextRequest, NextResponse } from 'next/server';
import { getRepo } from '@/lib/redis';
import { getKnowledge } from '@/lib/kb';
import { buildKbGraph } from '@/lib/kbGraph';
import { isDeptId } from '@/lib/agents';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const dept = p.get('dept');
  const category = p.get('category');
  const entries = await getKnowledge(getRepo(), {
    ...(dept && isDeptId(dept) ? { dept } : {}),
    ...(category ? { category: category as never } : {}),
  });
  return NextResponse.json({ ...buildKbGraph(entries), generatedAt: new Date().toISOString() });
}
```

(If `/api/kb/route.ts` validates `category` against a whitelist, reuse that exact validation instead of the `as never` cast.)

- [ ] **Step 2: Verify manually + typecheck**

Run: `npx tsc --noEmit` → clean. With `npm run dev`: `curl -s "http://localhost:3000/api/kb/graph" | head -c 300` → `{"nodes":[],"edges":[],"generatedAt":…}` locally (no Redis creds → empty, no crash).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kb/graph/route.ts
git commit -m "feat(v1.11): /api/kb/graph — published-only knowledge graph endpoint"
```

---

### Task 13: Release — version, docs, full verification

**Files:**
- Modify: `package.json` (+ lockfile via `npm version`), `CHANGELOG.md`, `CLAUDE.md`

- [ ] **Step 1: Bump + document**

Run: `npm version 1.11.0 --no-git-tag-version`.
Prepend to `CHANGELOG.md` (above `## [1.10.1]`):

```markdown
## [1.11.0] — <today's date>

**"The Company Change Agent" — backend/frontend agent roles + knowledge graph.**

### Added
- **Role seam** — depts carry `role: 'frontend' | 'backend'`. Backend (CEOX,
  OperX) never write KB; frontend (FinX, CyberX, M&SX, AIX) auto-publish +
  instant Library sync when the pure `qualityGate()` passes (clean run +
  cited findings), else draft for /admin review.
- **CEOX strategy cockpit** — SWOT / Business Model Canvas / Five Forces as a
  new `matrix` artifact kind (one `MatrixBoard` renderer) + a deterministic
  KPI scorecard, all through the validated-findings pipeline.
- **OperX self-heal** — `/api/cron/run?sweep=1` (16:00 UTC) retries at most
  one failed frontend dept per day with safe overrides (1 search, Haiku);
  instant Telegram alert when a retry fails; OperX narrates the sweep log.
- **Knowledge graph** — `GET /api/kb/graph`: published-only nodes + typed
  edges (`builds_on`, `same_theme`, `shares_tag`), derived on read.

### Changed
- Display renames: NaNote CEO→CEOX, Finance→FinX, Marketing & Social
  Media→M&SX, AI R&D→AIX, Operations→OperX (CyberX unchanged). Internal dept
  IDs, Redis keys, cron URLs, dashboard routes untouched.
```

Update `CLAUDE.md`: current-version paragraph → 1.11.0 with a 2-3 sentence release description (mirror how 1.10.x is described), and update the **Key Constraints** draft→publish bullet to describe the quality-gated auto-publish for frontend depts (backend depts: no KB).

- [ ] **Step 2: Full verification**

Run, in order, all must pass:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Then dev-server spot-checks (`npm run dev`): office canvas shows new names; `/dashboard` cards read FinX/M&SX/AIX; `/admin` → Agents → CEOX renders (boards appear after the next real CEO run); `/api/kb/graph` returns JSON.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json CHANGELOG.md CLAUDE.md
git commit -m "release: v1.11.0 — The Company Change Agent (roles, boards, self-heal, KB graph)"
```

---

### Post-plan (user-requested steps 5-6, run after all tasks)

1. `/code-review` on the branch diff; fix findings.
2. `base-deployment` skill: verify → push to main → confirm Vercel production deploy.
3. Prod verify after deploy: next frontend cron should auto-publish a clean run (check Telegram `📚 published` note + `/api/kb`); sweep cron appears in Vercel dashboard.
