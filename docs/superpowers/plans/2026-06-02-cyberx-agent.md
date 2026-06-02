# CyberX Agent (v0.4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sixth department agent, CyberX (Cybersecurity & Threat-Intelligence lead), that writes a daily threat brief from CISA KEV + Hacker News RSS using Claude Haiku, runs first to seed the v0.3 cross-department memory, and gets its own office zone inserted to the right of the CEO.

**Architecture:** Follows the established v0.2/v0.3 agent pattern — a source adapter (`sources/threatintel.ts`) feeds a department module (`agents/cyberx.ts`) that calls `complete()` with a Haiku model override and returns an `AgentRunResult`. A new `DeptId` value `'cyb'` is threaded through every `Record<DeptId>` map (registry, persona, sprite, departments, waypoints, log messages). The office floor widens `ROOM_W` 20→24 and the four existing zones shift right by 4.0 grid tiles to open CyberX's slot.

**Tech Stack:** Next.js 16, React 19, TypeScript, HTML5 Canvas, Vitest, `@anthropic-ai/sdk`.

**Spec:** `docs/superpowers/specs/2026-06-02-cyberx-agent-design.md`

---

## File Structure

**New files:**
- `src/lib/sources/threatintel.ts` — CISA KEV + Hacker News RSS adapter (pure parse/format fns + network fetchers).
- `src/lib/sources/threatintel.test.ts` — unit tests for the pure functions.
- `src/lib/agents/cyberx.ts` — CyberX department module (`run(ctx)`).
- `src/lib/agents/cyberx.test.ts` — run-shape + model-override test.
- `src/lib/claude.test.ts` — model-override test for `complete()`.
- `src/lib/data/departments.test.ts` — zone-bounds sanity test.

**Modified files:**
- `src/lib/claude.ts` — add `model?` to `CompleteOpts`.
- `src/lib/data/departments.ts` — add `'cyb'` to `DeptId`, `DEPARTMENTS`, `DEPT_ZONE_BOUNDS`; shift four zones +4.0.
- `src/lib/agents/personas.ts` — add `PERSONAS.cyb`; nudge Ops persona.
- `src/lib/agents/sprites.ts` — add `SPRITE_DATA.cyb`; update loader comment.
- `src/lib/data/waypoints.ts` — add `WORKSTATIONS.cyb`; shift four zones +4.0.
- `src/lib/agents/index.ts` — register `cyb` in `AGENTS` + `isDeptId`.
- `src/lib/data/logMessages.ts` — add a `cyb` line; bump "5 agents online" → "6".
- `src/lib/agents/runner.ts` — add `'cyb'` (first) to `DEPT_ORDER`.
- `src/lib/iso/engine.ts` — `ROOM_W` 20 → 24.
- `src/lib/iso/furniture.ts` — insert CyberX desk; shift zones/common areas.
- `vercel.json` — add `cyb` cron at 10:00 UTC.

**Sequencing note:** Tasks 1–2 are independent and keep a green build. Task 3 adds `'cyb'` to the `DeptId` union, which makes *every* `Record<DeptId>` map fail to compile until all are filled — so Task 3 edits them together and ends green. Tasks 4–7 build on that.

---

### Task 1: Add a `model?` override to `complete()`

**Files:**
- Modify: `src/lib/claude.ts`
- Test: `src/lib/claude.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/lib/claude.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(async () => ({ content: [{ type: 'text', text: 'hi' }] })),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
    constructor(_opts: unknown) {}
  },
}));

import { complete } from './claude';

describe('complete model selection', () => {
  beforeEach(() => createMock.mockClear());

  it('defaults to sonnet when no model is given', async () => {
    await complete({ system: 's', prompt: 'p' });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' }),
    );
  });

  it('uses the provided model override and maxTokens', async () => {
    await complete({ system: 's', prompt: 'p', model: 'claude-haiku-4-5-20251001', maxTokens: 600 });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001', max_tokens: 600 }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/claude.test.ts`
Expected: FAIL — the override test sees `model: 'claude-sonnet-4-6'` because `complete()` ignores `opts.model`.

- [ ] **Step 3: Implement the override**

In `src/lib/claude.ts`, add `model?` to the interface and destructure it with a default:

```ts
export interface CompleteOpts {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  webSearch?: boolean;
  maxSearches?: number;
}

export async function complete(opts: CompleteOpts): Promise<string> {
  const { system, prompt, model = MODEL, maxTokens = 1500, webSearch = false, maxSearches = 5 } = opts;
```

Then change the `messages.create` call to use `model` instead of the module constant `MODEL`:

```ts
      const msg = await client().messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
        ...(tools ? { tools } : {}),
      });
```

(Leave the `const MODEL = 'claude-sonnet-4-6'` declaration in place — it is now the default.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/claude.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude.ts src/lib/claude.test.ts
git commit -m "feat: add optional model override to complete()"
```

---

### Task 2: Threat-intel source adapter

**Files:**
- Create: `src/lib/sources/threatintel.ts`
- Test: `src/lib/sources/threatintel.test.ts`

Follows the `coingecko.ts` / `githubApi.ts` convention: pure functions for parsing/formatting (unit-tested) plus network fetchers that swallow errors and return `[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/sources/threatintel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectKev, parseRss, formatThreatIntel, type KevCatalog } from './threatintel';

describe('selectKev', () => {
  it('sorts by dateAdded desc and slices', () => {
    const raw: KevCatalog = {
      vulnerabilities: [
        { cveID: 'CVE-1', vendorProject: 'A', product: 'p1', vulnerabilityName: 'n1', dateAdded: '2026-05-01', shortDescription: 'd1' },
        { cveID: 'CVE-2', vendorProject: 'B', product: 'p2', vulnerabilityName: 'n2', dateAdded: '2026-06-01', shortDescription: 'd2' },
      ],
    };
    const out = selectKev(raw, 1);
    expect(out).toHaveLength(1);
    expect(out[0].cveId).toBe('CVE-2');
  });
});

describe('parseRss', () => {
  it('extracts item titles and links, including CDATA', () => {
    const xml = `<rss><channel>
      <item><title><![CDATA[Breach at Acme]]></title><link>https://x/1</link></item>
      <item><title>Zero-day in Foo</title><link>https://x/2</link></item>
    </channel></rss>`;
    const out = parseRss(xml, 5);
    expect(out).toEqual([
      { title: 'Breach at Acme', link: 'https://x/1' },
      { title: 'Zero-day in Foo', link: 'https://x/2' },
    ]);
  });

  it('respects the limit', () => {
    const xml = '<item><title>a</title><link>l</link></item>'.repeat(10);
    expect(parseRss(xml, 3)).toHaveLength(3);
  });
});

describe('formatThreatIntel', () => {
  it('renders KEV lines then news lines', () => {
    const lines = formatThreatIntel(
      [{ cveId: 'CVE-9', vendorProject: 'Acme', product: 'Widget', vulnerabilityName: 'RCE', dateAdded: '2026-06-01', shortDescription: 'x' }],
      [{ title: 'Big breach', link: 'l' }],
    );
    expect(lines[0]).toBe('CVE-9 — Acme Widget: RCE (added 2026-06-01)');
    expect(lines[1]).toBe('news: Big breach');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/sources/threatintel.test.ts`
Expected: FAIL — module `./threatintel` does not exist.

- [ ] **Step 3: Implement the adapter**

Create `src/lib/sources/threatintel.ts`:

```ts
export interface KevEntry {
  cveId: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
}

export interface NewsItem {
  title: string;
  link: string;
}

export interface KevCatalog {
  vulnerabilities: Array<{
    cveID: string;
    vendorProject: string;
    product: string;
    vulnerabilityName: string;
    dateAdded: string;
    shortDescription: string;
  }>;
}

const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const NEWS_URL = 'https://feeds.feedburner.com/TheHackersNews';

export function selectKev(raw: KevCatalog, limit = 10): KevEntry[] {
  return [...(raw.vulnerabilities ?? [])]
    .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
    .slice(0, limit)
    .map((v) => ({
      cveId: v.cveID,
      vendorProject: v.vendorProject,
      product: v.product,
      vulnerabilityName: v.vulnerabilityName,
      dateAdded: v.dateAdded,
      shortDescription: v.shortDescription,
    }));
}

export function parseRss(xml: string, limit = 5): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  const field = (block: string, tag: string): string => {
    const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`));
    return m ? m[1].trim() : '';
  };
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
    const title = field(m[1], 'title');
    if (title) items.push({ title, link: field(m[1], 'link') });
  }
  return items;
}

export function formatThreatIntel(kev: KevEntry[], news: NewsItem[]): string[] {
  const lines: string[] = [];
  for (const k of kev) {
    lines.push(`${k.cveId} — ${k.vendorProject} ${k.product}: ${k.vulnerabilityName} (added ${k.dateAdded})`);
  }
  for (const n of news) {
    lines.push(`news: ${n.title}`);
  }
  return lines;
}

export async function fetchKev(): Promise<KevEntry[]> {
  try {
    const res = await fetch(KEV_URL, { headers: { accept: 'application/json' } });
    if (!res.ok) return [];
    return selectKev((await res.json()) as KevCatalog);
  } catch {
    return [];
  }
}

export async function fetchSecurityNews(): Promise<NewsItem[]> {
  try {
    const res = await fetch(NEWS_URL, { headers: { accept: 'application/rss+xml, application/xml' } });
    if (!res.ok) return [];
    return parseRss(await res.text());
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/sources/threatintel.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sources/threatintel.ts src/lib/sources/threatintel.test.ts
git commit -m "feat: add CISA KEV + security-news threat-intel source adapter"
```

---

### Task 3: Thread `'cyb'` through the DeptId registry (single green-build unit)

Adding `'cyb'` to `DeptId` breaks every `Record<DeptId>` map at once. This task edits them all, plus the zone-bounds test, and ends with a passing build.

**Files:**
- Modify: `src/lib/data/departments.ts`
- Test: `src/lib/data/departments.test.ts` (new)
- Modify: `src/lib/agents/personas.ts`
- Modify: `src/lib/agents/sprites.ts`
- Modify: `src/lib/data/waypoints.ts`
- Modify: `src/lib/data/logMessages.ts`

- [ ] **Step 1: Write the failing zone-bounds test**

Create `src/lib/data/departments.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEPARTMENTS, DEPT_ZONE_BOUNDS, type DeptId } from './departments';
import { ROOM_W } from '@/lib/iso/engine';

describe('department layout', () => {
  it('has six departments with cyb second (right of CEO)', () => {
    expect(DEPARTMENTS).toHaveLength(6);
    expect(DEPARTMENTS[0].id).toBe('ceo');
    expect(DEPARTMENTS[1].id).toBe('cyb');
  });

  it('zone bounds do not overlap and fit within ROOM_W', () => {
    const order: DeptId[] = ['ceo', 'cyb', 'mkt', 'rnd', 'ops', 'fin'];
    for (let i = 0; i < order.length; i++) {
      const z = DEPT_ZONE_BOUNDS[order[i]];
      expect(z.x1).toBeLessThanOrEqual(ROOM_W);
      if (i > 0) {
        const prev = DEPT_ZONE_BOUNDS[order[i - 1]];
        expect(z.x0).toBeGreaterThan(prev.x1);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/data/departments.test.ts`
Expected: FAIL — only 5 departments, no `cyb`.

- [ ] **Step 3: Update `departments.ts`**

Replace the `DeptId` type, `DEPARTMENTS`, and `DEPT_ZONE_BOUNDS` with:

```ts
export type DeptId = 'ceo' | 'cyb' | 'mkt' | 'rnd' | 'ops' | 'fin';
```

```ts
export const DEPARTMENTS: Department[] = [
  { id: 'ceo', name: 'NaNote CEO',  shortName: 'NaNote', color: '#ffdd57', homeX: 1.6,  homeY: 2.5, task: '● directing team' },
  { id: 'cyb', name: 'CyberX',      shortName: 'CYB',    color: '#39ff9d', homeX: 5.2,  homeY: 2.5, task: '● scanning threats' },
  { id: 'mkt', name: 'Marketing',   shortName: 'MKT',    color: '#ff6b9d', homeX: 9.2,  homeY: 2.5, task: '● posting content' },
  { id: 'rnd', name: 'R&D Lab',     shortName: 'R&D',    color: '#00cfff', homeX: 13.5, homeY: 2.5, task: '○ idle' },
  { id: 'ops', name: 'Operations',  shortName: 'OPS',    color: '#ff9a3c', homeX: 18.8, homeY: 2.8, task: '● deploying v1.3' },
  { id: 'fin', name: 'Finance',     shortName: 'FIN',    color: '#7f8cff', homeX: 22.4, homeY: 2.2, task: '● analyzing ROI' },
];

export const DEPT_ZONE_BOUNDS: Record<DeptId, { x0: number; y0: number; x1: number; y1: number; gx: number; gy: number }> = {
  ceo: { x0: 0.1,  y0: 0.1, x1: 3.8,  y1: 3.8, gx: 1.8,  gy: 1.8 },
  cyb: { x0: 4.1,  y0: 0.1, x1: 7.8,  y1: 3.8, gx: 5.6,  gy: 1.8 },
  mkt: { x0: 8.1,  y0: 0.1, x1: 11.8, y1: 3.8, gx: 9.5,  gy: 1.8 },
  rnd: { x0: 12.1, y0: 0.1, x1: 16.8, y1: 3.8, gx: 14.2, gy: 1.8 },
  ops: { x0: 17.1, y0: 0.1, x1: 20.8, y1: 3.8, gx: 18.8, gy: 2.0 },
  fin: { x0: 21.1, y0: 0.1, x1: 23.8, y1: 3.8, gx: 22.2, gy: 1.8 },
};
```

- [ ] **Step 4: Add `PERSONAS.cyb` and nudge Ops in `personas.ts`**

Add the `cyb` entry to the `PERSONAS` object (place it after `ceo`):

```ts
  cyb: `You are CyberX, the Cybersecurity & Threat-Intelligence lead at NaNote Corp. Voice: calm, precise, security-analyst (SOC). You produce a short daily threat brief: summarize newly-exploited vulnerabilities (CISA KEV) and notable security events, assess relevance to a small web/cloud company, and give a one-line risk posture. Output GitHub-flavored markdown with a Sources list. Flag infrastructure- or dependency-relevant CVEs to Operations and strategic risks to the CEO.${OUTPUT_FOOTER}`,
```

Update the existing `ops` persona string to reference CyberX (replace the current `ops:` line):

```ts
  ops: `You are the Operations/DevOps lead at NaNote Corp. Voice: terse, status-oriented. You report CI/CD and deployment health and flag anything that needs attention. If CyberX has flagged infrastructure- or dependency-relevant vulnerabilities today, address them in your status. Connect infrastructure status to what other departments are working on when relevant. Output GitHub-flavored markdown.${OUTPUT_FOOTER}`,
```

- [ ] **Step 5: Add `SPRITE_DATA.cyb` and fix the loader comment in `sprites.ts`**

Add a `cyb` entry to `SPRITE_DATA` (place it after `ceo`) — a dark hoodie figure with hood up and a neon-green visor:

```ts
  cyb: [
    { x: 1, y: 0, w: 7, h: 2, fill: '#0c2a1e' },
    { x: 0, y: 1, w: 1, h: 4, fill: '#0c2a1e' }, { x: 8, y: 1, w: 1, h: 4, fill: '#0c2a1e' },
    { x: 1, y: 2, w: 7, h: 3, fill: '#f5c5a3' },
    { x: 1, y: 3, w: 7, h: 1, fill: '#39ff9d' },
    { x: 2, y: 3, w: 1, h: 1, fill: '#063b26' }, { x: 6, y: 3, w: 1, h: 1, fill: '#063b26' },
    { x: 3, y: 4, w: 3, h: 1, fill: '#c0785a' },
    { x: 1, y: 5, w: 7, h: 4, fill: '#0c2a1e' }, { x: 0, y: 5, w: 1, h: 3, fill: '#0c2a1e' }, { x: 8, y: 5, w: 1, h: 3, fill: '#0c2a1e' },
    { x: 4, y: 5, w: 1, h: 4, fill: '#39ff9d' }, { x: 3, y: 6, w: 3, h: 1, fill: '#1f8f5b' },
    { x: 0, y: 8, w: 1, h: 1, fill: '#f5c5a3' }, { x: 8, y: 8, w: 1, h: 1, fill: '#f5c5a3' },
    { x: 2, y: 9, w: 2, h: 2, fill: '#06140e' }, { x: 5, y: 9, w: 2, h: 2, fill: '#06140e' },
    { x: 1, y: 10, w: 3, h: 1, fill: '#020806' }, { x: 5, y: 10, w: 3, h: 1, fill: '#020806' },
  ],
```

Update the `loadSprites` doc comment from "Loads all 5 sprites" to "Loads all 6 sprites" (the implementation already iterates `Object.keys(SPRITE_DATA)` so no logic change is needed).

- [ ] **Step 6: Add `WORKSTATIONS.cyb` and shift the four zones in `waypoints.ts`**

Replace `WORKSTATIONS` with (cyb added; mkt/rnd/ops/fin x shifted +4.0):

```ts
export const WORKSTATIONS: Record<DeptId, { x: number; y: number }> = {
  ceo: { x: 1.6,  y: 4.5 },
  cyb: { x: 5.2,  y: 4.5 },
  mkt: { x: 9.2,  y: 4.5 },
  rnd: { x: 14.0, y: 0.9 },
  ops: { x: 18.0, y: 0.9 },
  fin: { x: 22.4, y: 4.2 },
};
```

Also re-center the two shared lower-room waypoints for the wider floor (room grew by 4, so center grew by 2):

```ts
export const WAYPOINTS = {
  MEETING:     { x: 12,   y: 7   },
  COFFEE:      { x: 19.2, y: 7   },
  WHITEBOARD:  { x: 14,   y: 0.9 },
  SERVER_RACK: { x: 18.0, y: 0.9 },
};
```

- [ ] **Step 7: Add a `cyb` log line and bump the agent count in `logMessages.ts`**

Change the first log line's "5 agents online" to "6 agents online":

```ts
  { dept: 'ceo', tokens: [t('Session started — '),                         ok('6 agents online ✓')] },
```

Add a `cyb` flavor line immediately after that first `ceo` line:

```ts
  { dept: 'cyb', tokens: [t('Threat feed sync — '),                        ok('CISA KEV ✓')] },
```

- [ ] **Step 8: Run the zone-bounds test and a type-check**

Run: `npm test -- src/lib/data/departments.test.ts`
Expected: PASS (2 tests).

Run: `npx tsc --noEmit`
Expected: no errors. (If any `Record<DeptId>` map still errors as missing `cyb`, that map was missed above — add the key.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/data/departments.ts src/lib/data/departments.test.ts src/lib/agents/personas.ts src/lib/agents/sprites.ts src/lib/data/waypoints.ts src/lib/data/logMessages.ts
git commit -m "feat: register cyb department across DeptId maps"
```

---

### Task 4: CyberX agent module

**Files:**
- Create: `src/lib/agents/cyberx.ts`
- Test: `src/lib/agents/cyberx.test.ts`
- Modify: `src/lib/agents/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agents/cyberx.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { completeMock } = vi.hoisted(() => ({ completeMock: vi.fn(async () => '# Brief\n\n## Highlight\nx\n\n## Flags\nNone') }));

vi.mock('@/lib/claude', () => ({ complete: completeMock }));
vi.mock('@/lib/sources/threatintel', () => ({
  fetchKev: vi.fn(async () => [
    { cveId: 'CVE-9', vendorProject: 'Acme', product: 'Widget', vulnerabilityName: 'RCE', dateAdded: '2026-06-01', shortDescription: 'x' },
  ]),
  fetchSecurityNews: vi.fn(async () => [{ title: 'Big breach', link: 'l' }]),
  formatThreatIntel: vi.fn(() => ['CVE-9 line', 'news: Big breach']),
}));

import { run } from './cyberx';
import type { AgentContext } from './types';

const emptyCtx: AgentContext = { ownHistory: [], companyDigest: [], todayPeers: [] };

describe('cyberx.run', () => {
  beforeEach(() => completeMock.mockClear());

  it('calls Claude Haiku with a capped token budget', async () => {
    await run(emptyCtx);
    expect(completeMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001', maxTokens: 600 }),
    );
  });

  it('returns a populated AgentRunResult', async () => {
    const result = await run(emptyCtx);
    expect(result.markdown).toContain('Brief');
    expect(result.summary).toContain('CVE');
    expect(result.feedMsg).toContain('Big breach');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/agents/cyberx.test.ts`
Expected: FAIL — module `./cyberx` does not exist.

- [ ] **Step 3: Implement `cyberx.ts`**

Create `src/lib/agents/cyberx.ts` (mirrors `finance.ts`):

```ts
import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import { fetchKev, fetchSecurityNews, formatThreatIntel, type KevEntry } from '@/lib/sources/threatintel';
import type { AgentRunResult, AgentContext } from './types';

export function briefSummary(kev: KevEntry[]): string {
  const top = kev[0]?.cveId ?? 'n/a';
  return `${kev.length} newly-exploited CVEs · top: ${top}`;
}

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const [kev, news] = await Promise.all([fetchKev(), fetchSecurityNews()]);
  const lines = formatThreatIntel(kev, news);
  const context = formatContext(ctx);
  const markdown = await complete({
    system: PERSONAS.cyb,
    prompt: `${context ? context + '\n\n---\n\n' : ''}Today's threat feed:\n${lines.join('\n')}\n\nWrite a brief (120-180 word) threat-intelligence note: what's newly exploited, relevance to a small web/cloud company, and a one-line risk posture. Include a Sources list.`,
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 600,
  });
  return {
    markdown,
    summary: briefSummary(kev),
    feedMsg: `threat: ${news[0]?.title ?? kev[0]?.cveId ?? 'n/a'}`,
    meta: { kev, news },
  };
}
```

- [ ] **Step 4: Register `cyb` in `index.ts`**

Update `src/lib/agents/index.ts` — import the module, add it to `AGENTS`, and extend `isDeptId`:

```ts
import * as cyberx from './cyberx';
```

```ts
export const AGENTS: Record<DeptId, (ctx: AgentContext) => Promise<AgentRunResult>> = {
  cyb: cyberx.run,
  fin: finance.run,
  mkt: marketing.run,
  rnd: rnd.run,
  ops: operations.run,
  ceo: ceo.run,
};

export const isDeptId = (s: string): s is DeptId =>
  s === 'ceo' || s === 'cyb' || s === 'mkt' || s === 'rnd' || s === 'ops' || s === 'fin';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/lib/agents/cyberx.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/cyberx.ts src/lib/agents/cyberx.test.ts src/lib/agents/index.ts
git commit -m "feat: add CyberX agent module on Claude Haiku"
```

---

### Task 5: Wire CyberX into the daily run order + cron

**Files:**
- Modify: `src/lib/agents/runner.ts`
- Test: `src/lib/agents/runner.test.ts` (add a case)
- Modify: `vercel.json`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/agents/runner.test.ts` (inside the file, as a new `describe`):

```ts
describe('buildContext run order', () => {
  it('exposes cyb as an earlier-run peer to later departments', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const repo = {
      getHistory: vi.fn(async () => []),
      getDigest: vi.fn(async () => []),
      getStatus: vi.fn(async (d: string) => ({
        dept: d, state: 'done', lastRun: d === 'cyb' ? `${today}T10:00:00Z` : null,
      })),
      getOutput: vi.fn(async (d: string) =>
        d === 'cyb'
          ? { dept: 'cyb', markdown: '## Highlight\nThreat up.\n\n## Flags\n- Patch Foo', summary: 'cyb sum', ts: today }
          : null,
      ),
    } as unknown as RedisRepo;

    const ctx = await buildContext('ops', repo);
    expect(ctx.todayPeers.some((p) => p.dept === 'cyb')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/agents/runner.test.ts`
Expected: FAIL — `cyb` is not in `DEPT_ORDER`, so `buildContext('ops')` never queries it.

- [ ] **Step 3: Add `cyb` to `DEPT_ORDER` (first)**

In `src/lib/agents/runner.ts`:

```ts
const DEPT_ORDER: DeptId[] = ['cyb', 'fin', 'rnd', 'mkt', 'ops', 'ceo'];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/agents/runner.test.ts`
Expected: PASS (all existing cases plus the new one).

- [ ] **Step 5: Add the cron entry**

In `vercel.json`, add the `cyb` cron as the first entry (runs 10:00 UTC, before Finance):

```json
{
  "crons": [
    { "path": "/api/cron/run?dept=cyb", "schedule": "0 10 * * *" },
    { "path": "/api/cron/run?dept=fin", "schedule": "0 11 * * *" },
    { "path": "/api/cron/run?dept=rnd", "schedule": "0 12 * * *" },
    { "path": "/api/cron/run?dept=mkt", "schedule": "0 13 * * *" },
    { "path": "/api/cron/run?dept=ops", "schedule": "0 14 * * *" },
    { "path": "/api/cron/run?dept=ceo", "schedule": "0 15 * * *" }
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/runner.ts src/lib/agents/runner.test.ts vercel.json
git commit -m "feat: run CyberX first in the daily order + add 10:00 UTC cron"
```

---

### Task 6: Office relayout — widen room, insert CyberX zone

This is the visual portion. Furniture is hand-placed and cannot be unit-tested, so it ends with a browser verification step. The transform is mechanical: **every gx in the four existing zone blocks (Marketing, R&D, Operations, Finance) shifts +4.0; every gx in the shared lower-room blocks (Meeting, Break, Common/Hallway) shifts +2.0; the CEO block stays put; a new CyberX desk block fills the 4.1–7.8 slot.**

**Files:**
- Modify: `src/lib/iso/engine.ts`
- Modify: `src/lib/iso/furniture.ts`

- [ ] **Step 1: Widen the room**

In `src/lib/iso/engine.ts`:

```ts
export const ROOM_W = 24;
```

(`ROOM_D` stays 14. `room.ts` tiles the floor with `for (x = 0; x < ROOM_W; x++)`, so the floor widens automatically.)

- [ ] **Step 2: Insert the CyberX desk block**

In `src/lib/iso/furniture.ts`, immediately after the existing `drawGlassPartition(engine, 3.9);` line (end of the CEO office), insert:

```ts
  // ── CYBERX (THREAT INTEL) ──
  engine.box(4.5, 0.04, 0, 2.8, 0.07, 56, '#04140e', '#031009', null); // wall screen
  for (let i = 0; i < 6; i++) {
    const pL = engine.g(4.7, 0.06, 50 - i * 8);
    const pR = engine.g(7.1, 0.06, 50 - i * 8);
    ctx.strokeStyle = i % 3 === 0 ? '#39ff9d88' : '#1f8f5b88'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pL.x, pL.y); ctx.lineTo(pR.x, pR.y); ctx.stroke();
  }
  engine.box(4.4, 0.5, 0, 2.5, 0.85, 18, DK[0], DK[1], DK[2]); // desk
  mon(engine, 4.9, 0.55, 18, '#39ff9d55');
  mon(engine, 5.65, 0.55, 18, '#39ff9d33');
  engine.box(6.4, 0.5, 18, 0.3, 0.28, 16, '#0a2a1c', '#061a11', '#0e3424'); // IDS box
  const cybLed = engine.g(6.55, 0.6, 36);
  ctx.beginPath(); ctx.arc(cybLed.x, cybLed.y, 2, 0, Math.PI * 2); ctx.fillStyle = '#39ff9d'; ctx.fill();
  engine.box(5.2, 1.6, 0, 0.7, 0.55, 12, '#06140e', '#040d09', '#0a1c14'); // chair
  engine.box(7.0, 0.3, 0, 0.3, 0.28, 10, '#3a1a06', '#2a1004', '#322008'); // plant pot
  const cybp = engine.g(7.12, 0.4, 32);
  ctx.beginPath(); ctx.arc(cybp.x, cybp.y, 5, 0, Math.PI * 2); ctx.fillStyle = '#1a7025'; ctx.fill();

  drawGlassPartition(engine, 7.9);
```

- [ ] **Step 3: Shift the four existing zone blocks +4.0**

In `furniture.ts`, for **every** drawing call inside the `// ── MARKETING ──`, `// ── R&D LAB ──`, `// ── OPERATIONS ──`, and `// ── FINANCE ──` blocks, add **+4.0** to the first numeric argument (the `gx`) of each `engine.box(...)`, `mon(engine, gx, ...)`, and `engine.g(gx, ...)` call, and to the `gx:` field of the finance `chartPts` array. Also relocate the three `drawGlassPartition` calls that belong to these blocks:

- `drawGlassPartition(engine, 7.9)` (after Marketing) → `11.9`
- `drawGlassPartition(engine, 12.9)` (after R&D) → `16.9`
- `drawGlassPartition(engine, 16.9)` (after Operations) → `20.9`

For reference, the Marketing block's first line becomes `engine.box(8.5, 0.04, 0, 2.8, 0.07, 52, ...)` and its `forEach` becomes `engine.box(8.6 + i * 0.65, ...)`; the Finance desk becomes `engine.box(21.2, 0.5, ...)` and its `chartPts` x-values become `21.3, 21.7, 22.1, 22.5, 22.9, 23.3`. Apply the same `+4.0` consistently to every gx in these four blocks.

- [ ] **Step 4: Shift the shared lower-room blocks +2.0**

For every drawing call inside the `// ── MEETING ROOM ──`, `// ── BREAK ROOM ──`, and `// ── COMMON / HALLWAY ──` blocks, add **+2.0** to each `gx` (the first numeric argument of `engine.box`/`mon`/`engine.g`, the chair `[x, y]` tuples' `x`, and the `engine.g(...)` points in the entrance mat / reception). Leave the two left-edge plants at gx `0.1` unchanged. This keeps the common areas centered under the now-wider zone strip.

- [ ] **Step 5: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Visual verification**

Run: `npm run dev` and open `http://localhost:3000`.

Verify in the browser:
- Six office zones render left→right: CEO, **CyberX (green desk)**, Marketing, R&D, Operations, Finance.
- The CyberX zone sits directly right of the CEO with its green wall screen and monitors.
- No desks/furniture overlap zone partitions; the meeting room and break room sit centered below the zones.
- The camera pans across all six zones (no zone cut off at the right edge).

If any furniture overlaps a partition or sits off-center, nudge the offending gx values by small amounts (±0.1–0.3) and re-check. Capture a screenshot for the commit.

- [ ] **Step 7: Commit**

```bash
git add src/lib/iso/engine.ts src/lib/iso/furniture.ts
git commit -m "feat: widen office to 6 zones, add CyberX workspace"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — previous 41 tests plus the new ones (~45 total): `claude.test.ts` (2), `threatintel.test.ts` (4), `departments.test.ts` (2), `cyberx.test.ts` (2), and the new `runner` case (1).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Smoke-test the agent locally (optional, needs env)**

If `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `CRON_SECRET` are set locally, trigger a CyberX run:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/run?dept=cyb" | head
```

Expected: JSON `{ "ok": true, "dept": "cyb", "summary": "… newly-exploited CVEs · top: CVE-…" }`. Skip if env is not configured locally (the design notes the runner requires Redis).

- [ ] **Step 6: Final commit (if any verification fixes were made)**

```bash
git add -A
git commit -m "chore: v0.4 CyberX verification fixes"
```

---

## Self-Review

**Spec coverage:**
- §1 Identity & placement → Task 3 (departments) + Task 6 (zone visuals). ✓
- §2 threatintel source → Task 2. ✓
- §3 cyberx module → Task 4. ✓
- §3a model override → Task 1. ✓
- §4 persona (+ Ops nudge) → Task 3 Step 4. ✓
- §5 cron + DEPT_ORDER seed wiring → Task 5 (the spec's "implementation check" resolved: `DEPT_ORDER` is hardcoded; `cyb` added first). ✓
- §6 canvas relayout (ROOM_W, departments bounds, waypoints, furniture, sprite) → Tasks 3 + 6. ✓
- §7 registry/glue (index, personas, sprites, departments, waypoints, logMessages) → Tasks 3–4. ✓
- §8 tests (41→~45) → Tasks 1–5 add 11 tests; Task 7 verifies total. ✓

**Type consistency:** `KevEntry`/`NewsItem`/`KevCatalog` are defined in Task 2 and consumed unchanged in Tasks 2/4. `complete()`'s `model`/`maxTokens` fields (Task 1) match the call in Task 4. `DeptId = '…|cyb|…'` (Task 3) is used by every map and by `DEPT_ORDER` (Task 5). `briefSummary(kev)` returns the `summary` string asserted in the Task 4 test. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The furniture shift (Task 6 Steps 3–4) is a precise mechanical transform (+4.0 / +2.0 per labeled block) with concrete reference values and a visual-verify-and-nudge step, since pixel aesthetics can't be fully predetermined. ✓
