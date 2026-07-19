# /plan AI Slide Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-gated `/plan` module to the company app where each user-created plan can one-click-generate a bespoke, human-quality slide deck (versioned, exportable to PPTX/PDF) through a transparent 4-step Sonnet pipeline.

**Architecture:** Plans + deck versions live in Neon Postgres via a `planDb.ts` store that mirrors the existing `kbDb.ts` contract (fail-soft reads, throwing writes, in-memory test fake). A deck is a validated JSON model (`Deck`/`Slide`) rendered by hand-designed React layout components in one of 3 themes. Generation runs synchronously (`completeRaw`, not the batch path): outline → draft → free deterministic anti-slop linter → critic-revise, streamed to a Manus-split UI over SSE.

**Tech Stack:** Next.js 16 (App Router, Node runtime routes), React 19, TypeScript, `@neondatabase/serverless`, `@anthropic-ai/sdk` (via existing `claude.ts`), `pptxgenjs` (new dep), Vitest.

## Global Constraints

- **Next.js 16 / React 19** — App Router; server components gate auth via `cookies()`, no middleware.
- **Auth:** every `/plan` page and `/api/plan/*` route re-checks `verifySession(cookies().get(ADMIN_COOKIE)?.value)` from `src/lib/auth.ts`. Fails closed.
- **Model:** the generation model is the **latest Sonnet**. The spec named `claude-sonnet-5`; **before coding Task 8, confirm the exact model id and its input/output price via the `claude-api` skill.** Use that verified id everywhere as the `PLAN_MODEL` constant and add its price to `cost.ts` (Task 6). Do not hardcode `claude-sonnet-4-6` (that's the older agent-run pricing already present).
- **Cost:** interactive calls → `costOf(model, usage, batch=false)` (standard rate, never the batch half-rate). Every generation stores its token/cost ledger in `deck_version.meta_json`.
- **No `dangerouslySetInnerHTML`** anywhere — deck text renders as React children.
- **DB fail-soft:** `planDb` reads return `null`/`[]` + `console.warn` on a Neon outage; writes throw. A missing `DATABASE_URL` must not crash a page render.
- **Tests:** pure logic (store via memory fake, deck schema, slop linter, pptx mapper, cost estimate) is unit-tested with Vitest. Renderer/UI has **no** visual unit tests — verify via dev server + screenshots (repo convention).
- **Commits:** conventional-commit messages, `feat(v1.14): …`; commit at the end of each task. Work stays on branch `feat/v114-plan-slides`.

---

## File Structure

**New:**
- `db/plan-schema.sql` — idempotent DDL for `plan` + `deck_version`.
- `src/lib/planDb.ts` — `PlanStore` interface, `makePlanDbStore()`, `makeMemoryPlanStore()`.
- `src/lib/planDb.test.ts` — store contract tests (memory fake).
- `src/lib/slides/deck.ts` — `Deck`/`Slide`/`ThemeId` types + `validateDeck()`.
- `src/lib/slides/deck.test.ts`
- `src/lib/slides/slopLint.ts` — pure anti-AI-slop linter.
- `src/lib/slides/slopLint.test.ts`
- `src/lib/slides/prompts.ts` — `outlinePrompt`, `draftPrompt`, `criticPrompt` builders.
- `src/lib/slides/pipeline.ts` — `PLAN_MODEL`, `generateDeck()` orchestrator + `estimateCost()`.
- `src/lib/slides/pipeline.test.ts` — orchestration with a stubbed `completeRaw`.
- `src/lib/slides/pptx.ts` — `deckToPptx()` mapper.
- `src/lib/slides/pptx.test.ts`
- `src/app/plan/page.tsx` — list + create (server-gated).
- `src/app/plan/[id]/page.tsx` — detail (server-gated).
- `src/components/plan/PlanList.tsx`, `PlanDetail.tsx`, `GenerateWizard.tsx`, `ThinkingPane.tsx`, `DeckRenderer.tsx`, `DeckThemes.css` (or module), `VersionSwitcher.tsx`, `ExportButtons.tsx`.
- `src/app/api/plan/route.ts` — GET/POST.
- `src/app/api/plan/[id]/route.ts` — GET.
- `src/app/api/plan/[id]/generate/route.ts` — POST (SSE).
- `src/app/api/plan/[id]/export/route.ts` — GET.
- `src/app/api/plan/migrate/route.ts` — POST one-shot.

**Modified:**
- `src/lib/cost.ts` — add `PLAN_MODEL` price (Task 6).
- `src/components/NavBar.tsx` — add `/plan` link (Task 12).
- `package.json` — add `pptxgenjs`; bump version to `1.14.0` (Task 13).
- `CHANGELOG.md` — v1.14.0 entry (Task 13).

---

## Task 1: `planDb` store + schema

**Files:**
- Create: `db/plan-schema.sql`, `src/lib/planDb.ts`, `src/lib/planDb.test.ts`

**Interfaces:**
- Produces:
  - `interface PlanRow { id: string; title: string; brief: string; audience: string; createdAt: string; updatedAt: string }`
  - `interface DeckVersionRow { id: string; planId: string; versionNo: number; deck: unknown; meta: unknown; createdAt: string }`
  - `interface PlanStore { listPlans(): Promise<PlanRow[]>; getPlan(id): Promise<PlanRow|null>; createPlan(input:{title;brief;audience}): Promise<PlanRow>; listVersions(planId): Promise<DeckVersionRow[]>; getVersion(planId, versionNo): Promise<DeckVersionRow|null>; addVersion(planId, deck, meta): Promise<DeckVersionRow> }`
  - `makePlanDbStore(): PlanStore` (Neon), `makeMemoryPlanStore(): PlanStore` (test fake), `newId(prefix): string`.

- [ ] **Step 1: Write `db/plan-schema.sql`**

```sql
-- idempotent; applied via POST /api/plan/migrate
CREATE TABLE IF NOT EXISTS plan (
  id          text PRIMARY KEY,
  title       text NOT NULL,
  brief       text NOT NULL DEFAULT '',
  audience    text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS deck_version (
  id          text PRIMARY KEY,
  plan_id     text NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  version_no  int  NOT NULL,
  deck_json   jsonb NOT NULL,
  meta_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version_no)
);
CREATE INDEX IF NOT EXISTS deck_version_plan_idx ON deck_version(plan_id, version_no DESC);
```

- [ ] **Step 2: Write the failing test** (`src/lib/planDb.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { makeMemoryPlanStore } from './planDb';

describe('PlanStore (memory)', () => {
  it('creates and lists plans newest-first', async () => {
    const s = makeMemoryPlanStore();
    const a = await s.createPlan({ title: 'A', brief: 'x', audience: 'board' });
    const b = await s.createPlan({ title: 'B', brief: 'y', audience: 'team' });
    const list = await s.listPlans();
    expect(list.map((p) => p.id)).toEqual([b.id, a.id]);
    expect(await s.getPlan(a.id)).toMatchObject({ title: 'A', audience: 'board' });
  });

  it('appends deck versions with incrementing version_no', async () => {
    const s = makeMemoryPlanStore();
    const p = await s.createPlan({ title: 'P', brief: '', audience: '' });
    const v1 = await s.addVersion(p.id, { theme: 'midnight', slides: [] }, { model: 'm' });
    const v2 = await s.addVersion(p.id, { theme: 'editorial', slides: [] }, {});
    expect([v1.versionNo, v2.versionNo]).toEqual([1, 2]);
    expect((await s.listVersions(p.id)).map((v) => v.versionNo)).toEqual([2, 1]);
    expect(await s.getVersion(p.id, 1)).toMatchObject({ versionNo: 1 });
  });

  it('getPlan returns null for unknown id', async () => {
    expect(await makeMemoryPlanStore().getPlan('nope')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**
Run: `npx vitest run src/lib/planDb.test.ts`
Expected: FAIL — `makeMemoryPlanStore` not exported.

- [ ] **Step 4: Implement `src/lib/planDb.ts`**

```ts
import { neon } from '@neondatabase/serverless';

export interface PlanRow { id: string; title: string; brief: string; audience: string; createdAt: string; updatedAt: string }
export interface DeckVersionRow { id: string; planId: string; versionNo: number; deck: unknown; meta: unknown; createdAt: string }

export interface PlanStore {
  listPlans(): Promise<PlanRow[]>;
  getPlan(id: string): Promise<PlanRow | null>;
  createPlan(input: { title: string; brief: string; audience: string }): Promise<PlanRow>;
  listVersions(planId: string): Promise<DeckVersionRow[]>;
  getVersion(planId: string, versionNo: number): Promise<DeckVersionRow | null>;
  addVersion(planId: string, deck: unknown, meta: unknown): Promise<DeckVersionRow>;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const planRow = (r: Record<string, unknown>): PlanRow => ({
  id: r.id as string, title: r.title as string, brief: r.brief as string,
  audience: r.audience as string, createdAt: String(r.created_at), updatedAt: String(r.updated_at),
});
const verRow = (r: Record<string, unknown>): DeckVersionRow => ({
  id: r.id as string, planId: r.plan_id as string, versionNo: Number(r.version_no),
  deck: r.deck_json, meta: r.meta_json, createdAt: String(r.created_at),
});

export function makePlanDbStore(): PlanStore {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const sql = url ? neon(url) : null;
  const warn = (e: unknown) => console.warn('[planDb] read failed', e);

  return {
    async listPlans() {
      if (!sql) return [];
      try { return (await sql`SELECT * FROM plan ORDER BY created_at DESC`).map(planRow); }
      catch (e) { warn(e); return []; }
    },
    async getPlan(id) {
      if (!sql) return null;
      try { const r = await sql`SELECT * FROM plan WHERE id=${id}`; return r[0] ? planRow(r[0]) : null; }
      catch (e) { warn(e); return null; }
    },
    async createPlan(input) {
      if (!sql) throw new Error('DATABASE_URL not set');
      const id = newId('plan');
      const r = await sql`INSERT INTO plan (id,title,brief,audience) VALUES (${id},${input.title},${input.brief},${input.audience}) RETURNING *`;
      return planRow(r[0]);
    },
    async listVersions(planId) {
      if (!sql) return [];
      try { return (await sql`SELECT * FROM deck_version WHERE plan_id=${planId} ORDER BY version_no DESC`).map(verRow); }
      catch (e) { warn(e); return []; }
    },
    async getVersion(planId, versionNo) {
      if (!sql) return null;
      try { const r = await sql`SELECT * FROM deck_version WHERE plan_id=${planId} AND version_no=${versionNo}`; return r[0] ? verRow(r[0]) : null; }
      catch (e) { warn(e); return null; }
    },
    async addVersion(planId, deck, meta) {
      if (!sql) throw new Error('DATABASE_URL not set');
      const id = newId('deck');
      const r = await sql`
        INSERT INTO deck_version (id, plan_id, version_no, deck_json, meta_json)
        VALUES (${id}, ${planId},
          (SELECT COALESCE(MAX(version_no),0)+1 FROM deck_version WHERE plan_id=${planId}),
          ${JSON.stringify(deck)}::jsonb, ${JSON.stringify(meta)}::jsonb)
        RETURNING *`;
      await sql`UPDATE plan SET updated_at=now() WHERE id=${planId}`;
      return verRow(r[0]);
    },
  };
}

export function makeMemoryPlanStore(): PlanStore {
  const plans: PlanRow[] = [];
  const versions: DeckVersionRow[] = [];
  return {
    async listPlans() { return [...plans].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
    async getPlan(id) { return plans.find((p) => p.id === id) ?? null; },
    async createPlan(input) {
      const now = new Date(Date.now() + plans.length).toISOString();
      const p: PlanRow = { id: newId('plan'), ...input, createdAt: now, updatedAt: now };
      plans.push(p); return p;
    },
    async listVersions(planId) {
      return versions.filter((v) => v.planId === planId).sort((a, b) => b.versionNo - a.versionNo);
    },
    async getVersion(planId, versionNo) {
      return versions.find((v) => v.planId === planId && v.versionNo === versionNo) ?? null;
    },
    async addVersion(planId, deck, meta) {
      const versionNo = versions.filter((v) => v.planId === planId).length + 1;
      const v: DeckVersionRow = { id: newId('deck'), planId, versionNo, deck, meta, createdAt: new Date().toISOString() };
      versions.push(v); return v;
    },
  };
}
```

- [ ] **Step 5: Run tests, verify pass**
Run: `npx vitest run src/lib/planDb.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 6: Commit**
```bash
git add db/plan-schema.sql src/lib/planDb.ts src/lib/planDb.test.ts
git commit -m "feat(v1.14): planDb store + schema (Neon, memory fake, kbDb pattern)"
```

---

## Task 2: `/api/plan/migrate` one-shot DDL route

**Files:**
- Create: `src/app/api/plan/migrate/route.ts`

**Interfaces:**
- Consumes: `db/plan-schema.sql`. Guarded by `Authorization: Bearer $CRON_SECRET`.
- Produces: `POST` → `{ applied: true }`.

- [ ] **Step 1: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return NextResponse.json({ error: 'no DATABASE_URL' }, { status: 500 });
  const sql = neon(url);
  const ddl = readFileSync(join(process.cwd(), 'db', 'plan-schema.sql'), 'utf8');
  // split on ';' at statement end; strip -- comments (mirrors migrate-kb handling)
  const stmts = ddl.replace(/^\s*--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
  for (const s of stmts) await sql.query(s);
  return NextResponse.json({ applied: true, statements: stmts.length });
}
```

- [ ] **Step 2: Add `db/` to server bundle tracing** — in `next.config.ts`, ensure `outputFileTracingIncludes` covers `db/plan-schema.sql` for this route. Read `next.config.ts`; if an `outputFileTracingIncludes` map exists, add:
```ts
'/api/plan/migrate': ['./db/plan-schema.sql'],
```
If none exists, add the key. (The migrate-kb route already reads `db/schema.sql`, so a pattern likely exists — follow it.)

- [ ] **Step 3: Verify build compiles**
Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 4: Commit**
```bash
git add src/app/api/plan/migrate/route.ts next.config.ts
git commit -m "feat(v1.14): one-shot /api/plan/migrate (Bearer CRON_SECRET, applies plan-schema.sql)"
```

---

## Task 3: Plan CRUD API (`/api/plan`, `/api/plan/[id]`)

**Files:**
- Create: `src/app/api/plan/route.ts`, `src/app/api/plan/[id]/route.ts`
- Test: `src/app/api/plan/route.test.ts`

**Interfaces:**
- Consumes: `PlanStore` (Task 1), `verifySession`/`ADMIN_COOKIE` (`src/lib/auth.ts`).
- Produces: a shared `requireAdmin(req): boolean` inline helper (duplicate the 3-line check in each route — do not over-abstract). `GET /api/plan` → `{ plans: PlanRow[] }`; `POST /api/plan` `{title,brief,audience}` → `{ plan }` (400 if title empty); `GET /api/plan/[id]` → `{ plan, versions, latest }` (404 if unknown).

- [ ] **Step 1: Write failing test** (`src/app/api/plan/route.test.ts`) — test the pure validation helper, not the Next runtime.

```ts
import { describe, it, expect } from 'vitest';
import { validateCreate } from './validate';

describe('plan create validation', () => {
  it('rejects empty title', () => {
    expect(validateCreate({ title: '  ', brief: 'x', audience: '' }).ok).toBe(false);
  });
  it('accepts and trims', () => {
    const r = validateCreate({ title: ' Growth ', brief: 'b', audience: 'board' });
    expect(r).toEqual({ ok: true, value: { title: 'Growth', brief: 'b', audience: 'board' } });
  });
  it('coerces missing brief/audience to empty string', () => {
    const r = validateCreate({ title: 'X' } as Record<string, unknown>);
    expect(r).toEqual({ ok: true, value: { title: 'X', brief: '', audience: '' } });
  });
});
```

- [ ] **Step 2: Run test, verify fail** — `npx vitest run src/app/api/plan/route.test.ts` → FAIL (no `./validate`).

- [ ] **Step 3: Implement `src/app/api/plan/validate.ts`**

```ts
export type CreateInput = { title: string; brief: string; audience: string };
export function validateCreate(body: Record<string, unknown>):
  { ok: true; value: CreateInput } | { ok: false; error: string } {
  const title = String(body?.title ?? '').trim();
  if (!title) return { ok: false, error: 'title required' };
  return { ok: true, value: { title, brief: String(body?.brief ?? ''), audience: String(body?.audience ?? '') } };
}
```

- [ ] **Step 4: Implement `src/app/api/plan/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';
import { makePlanDbStore } from '@/lib/planDb';
import { validateCreate } from './validate';

export const dynamic = 'force-dynamic';

async function authed(): Promise<boolean> {
  return verifySession((await cookies()).get(ADMIN_COOKIE)?.value);
}

export async function GET() {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ plans: await makePlanDbStore().listPlans() });
}

export async function POST(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const v = validateCreate(await req.json().catch(() => ({})));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  return NextResponse.json({ plan: await makePlanDbStore().createPlan(v.value) });
}
```

- [ ] **Step 5: Implement `src/app/api/plan/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';
import { makePlanDbStore } from '@/lib/planDb';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verifySession((await cookies()).get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const store = makePlanDbStore();
  const plan = await store.getPlan(id);
  if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const versions = await store.listVersions(id);
  return NextResponse.json({ plan, versions, latest: versions[0] ?? null });
}
```

- [ ] **Step 6: Run tests + typecheck** — `npx vitest run src/app/api/plan/route.test.ts && npx tsc --noEmit` → PASS / no errors.

- [ ] **Step 7: Commit**
```bash
git add src/app/api/plan
git commit -m "feat(v1.14): plan CRUD API (cookie-gated list/create/get + validation)"
```

---

## Task 4: `/plan` list + create page

**Files:**
- Create: `src/app/plan/page.tsx`, `src/components/plan/PlanList.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/plan`, `verifySession`, `AdminLogin` (reuse for the gate).
- Produces: a navigable list; clicking a card → `/plan/[id]`; "New plan" posts and redirects.

- [ ] **Step 1: Implement the gated server page** (`src/app/plan/page.tsx`)

```tsx
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { NavBar } from '@/components/NavBar';
import { AdminLogin } from '@/components/AdminLogin';
import { PlanList } from '@/components/plan/PlanList';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';

export const metadata: Metadata = { title: 'Plans', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PlanPage() {
  const authed = verifySession((await cookies()).get(ADMIN_COOKIE)?.value);
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <NavBar />
      {authed ? <PlanList /> : <AdminLogin />}
    </div>
  );
}
```

- [ ] **Step 2: Implement `PlanList.tsx`** (client) — fetches `/api/plan`, renders cards, has a "New plan" form (title + brief + audience) that POSTs then routes to the new plan.

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Plan = { id: string; title: string; audience: string; updatedAt: string };

export function PlanList() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({ title: '', brief: '', audience: '' });
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => { fetch('/api/plan').then((r) => r.json()).then((d) => setPlans(d.plans ?? [])); }, []);

  async function create() {
    if (!form.title.trim()) return;
    const r = await fetch('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
    const d = await r.json();
    if (d.plan) router.push(`/plan/${d.plan.id}`);
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Plans</h1>
        <button onClick={() => setOpen((v) => !v)} style={{ padding: '8px 14px', borderRadius: 8, background: '#3b5bff', color: '#fff', border: 0 }}>+ New plan</button>
      </div>
      {open && (
        <div style={{ border: '1px solid #2a3038', borderRadius: 10, padding: 16, marginBottom: 20, display: 'grid', gap: 8 }}>
          <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea placeholder="Plan brief" rows={4} value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} />
          <input placeholder="Audience (e.g. board, team)" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
          <button onClick={create}>Create</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
        {plans.map((p) => (
          <a key={p.id} href={`/plan/${p.id}`} style={{ border: '1px solid #2a3038', borderRadius: 10, padding: 16, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontWeight: 600 }}>{p.title}</div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>{p.audience || 'no audience set'}</div>
          </a>
        ))}
        {plans.length === 0 && <p style={{ opacity: 0.6 }}>No plans yet. Create one to get started.</p>}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify in dev server** — `npm run dev`, log in at `/plan`, create a plan, confirm redirect to `/plan/[id]` (404 body is fine until Task 5). Screenshot.

- [ ] **Step 4: Typecheck + commit**
```bash
npx tsc --noEmit
git add src/app/plan/page.tsx src/components/plan/PlanList.tsx
git commit -m "feat(v1.14): /plan list + create page (admin-gated)"
```

---

## Task 5: Deck model + validation (`slides/deck.ts`)

**Files:**
- Create: `src/lib/slides/deck.ts`, `src/lib/slides/deck.test.ts`

**Interfaces:**
- Produces:
  - `type ThemeId = 'midnight' | 'editorial' | 'grid'`
  - `Slide` discriminated union on `layout`: `title`, `agenda`, `section`, `bulletsVisual`, `quote`, `data`, `comparison`, `closing` (fields below).
  - `interface Deck { theme: ThemeId; slides: Slide[] }`
  - `validateDeck(x: unknown): { ok: true; deck: Deck } | { ok: false; error: string }`
  - `THEMES: ThemeId[]`

- [ ] **Step 1: Write failing test** (`deck.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { validateDeck } from './deck';

const good = { theme: 'midnight', slides: [
  { layout: 'title', title: 'Q3 Plan', subtitle: 'three bets' },
  { layout: 'bulletsVisual', heading: 'Why now', bullets: ['Churn up 4pts', 'CAC flat'] },
] };

describe('validateDeck', () => {
  it('accepts a valid deck', () => {
    const r = validateDeck(good);
    expect(r.ok).toBe(true);
  });
  it('rejects unknown theme', () => {
    expect(validateDeck({ ...good, theme: 'neon' }).ok).toBe(false);
  });
  it('rejects unknown slide layout', () => {
    expect(validateDeck({ theme: 'grid', slides: [{ layout: 'wat' }] }).ok).toBe(false);
  });
  it('rejects non-array slides', () => {
    expect(validateDeck({ theme: 'grid', slides: {} }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/lib/slides/deck.test.ts` → FAIL.

- [ ] **Step 3: Implement `deck.ts`**

```ts
export type ThemeId = 'midnight' | 'editorial' | 'grid';
export const THEMES: ThemeId[] = ['midnight', 'editorial', 'grid'];

export type Slide =
  | { layout: 'title'; title: string; subtitle?: string }
  | { layout: 'agenda'; heading: string; items: string[] }
  | { layout: 'section'; title: string; kicker?: string }
  | { layout: 'bulletsVisual'; heading: string; bullets: string[]; note?: string }
  | { layout: 'quote'; quote: string; attribution?: string }
  | { layout: 'data'; heading: string; stat: string; caption?: string }
  | { layout: 'comparison'; heading: string; left: { title: string; points: string[] }; right: { title: string; points: string[] } }
  | { layout: 'closing'; title: string; cta?: string };

export interface Deck { theme: ThemeId; slides: Slide[] }

const LAYOUTS = new Set<Slide['layout']>(['title','agenda','section','bulletsVisual','quote','data','comparison','closing']);

export function validateDeck(x: unknown): { ok: true; deck: Deck } | { ok: false; error: string } {
  if (!x || typeof x !== 'object') return { ok: false, error: 'not an object' };
  const d = x as Record<string, unknown>;
  if (!THEMES.includes(d.theme as ThemeId)) return { ok: false, error: `bad theme: ${String(d.theme)}` };
  if (!Array.isArray(d.slides)) return { ok: false, error: 'slides must be an array' };
  for (const [i, s] of d.slides.entries()) {
    if (!s || typeof s !== 'object' || !LAYOUTS.has((s as Record<string, unknown>).layout as Slide['layout'])) {
      return { ok: false, error: `slide ${i}: bad layout` };
    }
  }
  return { ok: true, deck: x as Deck };
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/lib/slides/deck.test.ts` → PASS (4).

- [ ] **Step 5: Commit**
```bash
git add src/lib/slides/deck.ts src/lib/slides/deck.test.ts
git commit -m "feat(v1.14): deck JSON model + validateDeck (8 layouts, 3 themes)"
```

---

## Task 6: Anti-slop linter + Sonnet pricing (`slopLint.ts`, `cost.ts`)

**Files:**
- Create: `src/lib/slides/slopLint.ts`, `src/lib/slides/slopLint.test.ts`
- Modify: `src/lib/cost.ts` (add `PLAN_MODEL` price + export `PLAN_MODEL`)

**Interfaces:**
- Consumes: `Deck`, `Slide` (Task 5). The plan brief string (for evidence checks).
- Produces:
  - `interface LintIssue { slideIndex: number; rule: string; detail: string }`
  - `lintDeck(deck: Deck, brief: string): LintIssue[]`
  - In `cost.ts`: `export const PLAN_MODEL` (verified Sonnet id — see Global Constraints) and its `PRICING` entry.

- [ ] **Step 1: Confirm the Sonnet id + price** via the `claude-api` skill. Record the id (e.g. `claude-sonnet-5`) and input/output USD/Mtok. Add to `src/lib/cost.ts` `PRICING` and export:
```ts
export const PLAN_MODEL = 'claude-sonnet-5'; // ← replace with verified id
// add to PRICING object:
'claude-sonnet-5': { input: 3, output: 15 }, // ← replace with verified rates
```

- [ ] **Step 2: Write failing test** (`slopLint.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { lintDeck } from './slopLint';
import type { Deck } from './deck';

const brief = 'Churn rose to 8% in Q2. CAC is 420 dollars. Acme launched Pro tier.';

describe('lintDeck', () => {
  it('flags banned filler phrases', () => {
    const deck: Deck = { theme: 'midnight', slides: [{ layout: 'title', title: 'In today’s fast-paced world' }] };
    expect(lintDeck(deck, brief).some((i) => i.rule === 'filler')).toBe(true);
  });
  it('flags a bullet wall (>5 bullets)', () => {
    const deck: Deck = { theme: 'grid', slides: [{ layout: 'bulletsVisual', heading: 'X', bullets: ['a','b','c','d','e','f'] }] };
    expect(lintDeck(deck, brief).some((i) => i.rule === 'bullet-wall')).toBe(true);
  });
  it('flags layout monotony (>2 same in a row)', () => {
    const s = { layout: 'bulletsVisual', heading: 'h', bullets: ['x churn 8%'] } as const;
    const deck: Deck = { theme: 'grid', slides: [s, s, s] };
    expect(lintDeck(deck, brief).some((i) => i.rule === 'monotony')).toBe(true);
  });
  it('flags evidence-free content slides', () => {
    const deck: Deck = { theme: 'grid', slides: [{ layout: 'bulletsVisual', heading: 'Synergy', bullets: ['We will grow fast'] }] };
    expect(lintDeck(deck, brief).some((i) => i.rule === 'no-evidence')).toBe(true);
  });
  it('passes a clean, specific deck', () => {
    const deck: Deck = { theme: 'midnight', slides: [
      { layout: 'title', title: 'Acme Q3 Growth' },
      { layout: 'data', heading: 'Churn', stat: '8%', caption: 'up from 6% in Q1' },
      { layout: 'bulletsVisual', heading: 'Plan', bullets: ['Cut CAC below 420', 'Ship Pro tier retention'] },
    ] };
    expect(lintDeck(deck, brief)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run, verify fail** — `npx vitest run src/lib/slides/slopLint.test.ts` → FAIL.

- [ ] **Step 4: Implement `slopLint.ts`**

```ts
import type { Deck, Slide } from './deck';

export interface LintIssue { slideIndex: number; rule: string; detail: string }

const FILLER = [
  'fast-paced world', 'leverage synergies', 'synergy', "it's not just", 'it is not just',
  'at the end of the day', 'game-changer', 'game changer', 'revolutionize', 'paradigm shift',
  'unlock value', 'take it to the next level', 'move the needle', 'best-in-class', 'cutting-edge',
];
const CONTENT_LAYOUTS = new Set<Slide['layout']>(['bulletsVisual', 'data', 'comparison', 'agenda']);

function slideText(s: Slide): string {
  return JSON.stringify(s).toLowerCase();
}

// evidence = a digit, a %, a $, or a capitalized token that also appears in the brief
function hasEvidence(s: Slide, brief: string): boolean {
  const t = slideText(s);
  if (/\d/.test(t) || t.includes('%') || t.includes('$')) return true;
  const briefWords = new Set(brief.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const proper = JSON.stringify(s).match(/[A-Z][a-z]{3,}/g) ?? [];
  return proper.some((w) => briefWords.has(w.toLowerCase()));
}

export function lintDeck(deck: Deck, brief: string): LintIssue[] {
  const issues: LintIssue[] = [];
  deck.slides.forEach((s, i) => {
    const t = slideText(s);
    for (const phrase of FILLER) {
      if (t.includes(phrase)) issues.push({ slideIndex: i, rule: 'filler', detail: phrase });
    }
    const emDashes = (t.match(/—/g) ?? []).length;
    if (emDashes > 2) issues.push({ slideIndex: i, rule: 'em-dash', detail: `${emDashes} em-dashes` });
    if (s.layout === 'bulletsVisual' && s.bullets.length > 5) {
      issues.push({ slideIndex: i, rule: 'bullet-wall', detail: `${s.bullets.length} bullets` });
    }
    if (CONTENT_LAYOUTS.has(s.layout) && !hasEvidence(s, brief)) {
      issues.push({ slideIndex: i, rule: 'no-evidence', detail: 'no number/proper-noun traceable to brief' });
    }
    if (i >= 2 && deck.slides[i - 1].layout === s.layout && deck.slides[i - 2].layout === s.layout) {
      issues.push({ slideIndex: i, rule: 'monotony', detail: `3rd ${s.layout} in a row` });
    }
  });
  return issues;
}
```

- [ ] **Step 5: Run, verify pass** — `npx vitest run src/lib/slides/slopLint.test.ts` → PASS (5). Then `npx vitest run src/lib/cost.test.ts` to confirm the new price didn't break cost tests.

- [ ] **Step 6: Commit**
```bash
git add src/lib/slides/slopLint.ts src/lib/slides/slopLint.test.ts src/lib/cost.ts
git commit -m "feat(v1.14): anti-slop linter + Sonnet PLAN_MODEL pricing"
```

---

## Task 7: Prompt builders + pipeline orchestrator (`prompts.ts`, `pipeline.ts`)

**Files:**
- Create: `src/lib/slides/prompts.ts`, `src/lib/slides/pipeline.ts`, `src/lib/slides/pipeline.test.ts`

**Interfaces:**
- Consumes: `completeRaw` from `@/lib/claude` (`{ system, prompt, model, maxTokens } → { text, usage, model }`), `validateDeck`, `lintDeck`, `PLAN_MODEL`, `costOf`.
- Produces:
  - `interface GenParams { theme: ThemeId; slideCount: number; audience: string; brief: string; extra?: string }`
  - `interface StepNote { step: 'outline'|'draft'|'lint'|'critic'; note: string; data?: unknown }`
  - `interface GenResult { deck: Deck; meta: { model: string; theme: ThemeId; slideCount: number; usage: {input:number;output:number}; costUsd: number; trace: StepNote[]; lintFixed: number } }`
  - `async function generateDeck(p: GenParams, complete = completeRaw, onStep?: (n: StepNote)=>void): Promise<GenResult>`
  - `function estimateCost(slideCount: number): number` (pre-generate estimate)
  - `const STEP_BUDGET = { outline: 1200, draft: 6000, critic: 3000 }` (max_tokens per step)

- [ ] **Step 1: Implement `prompts.ts`** — three builders returning `{ system, prompt }`. The draft/critic prompts embed the `Deck`/`Slide` schema and the anti-slop rules as instructions.

```ts
import type { Deck, ThemeId } from './deck';

const SCHEMA_DOC = `Return ONLY JSON: {"theme": "<theme>", "slides": Slide[]}.
Slide layouts (pick the RIGHT one per idea; vary them, never 3 of the same in a row):
- {"layout":"title","title":"...","subtitle":"..."}
- {"layout":"agenda","heading":"...","items":["..."]}
- {"layout":"section","title":"...","kicker":"..."}
- {"layout":"bulletsVisual","heading":"...","bullets":["..."],"note":"..."}  (max 5 bullets)
- {"layout":"quote","quote":"...","attribution":"..."}
- {"layout":"data","heading":"...","stat":"42%","caption":"..."}
- {"layout":"comparison","heading":"...","left":{"title":"...","points":["..."]},"right":{"title":"...","points":["..."]}}
- {"layout":"closing","title":"...","cta":"..."}`;

const VOICE = `Write like a sharp human operator, NOT an AI. Rules:
- Every content slide cites a specific number or proper noun FROM THE BRIEF. No vague claims.
- Ban filler: "fast-paced world", "leverage synergies", "game-changer", "it's not just X it's Y", "move the needle".
- Short, declarative. No triads-for-the-sake-of-it. No emoji. Vary sentence and slide shape.`;

export function outlinePrompt(p: { brief: string; audience: string; slideCount: number; extra?: string }) {
  return {
    system: `You are a presentation strategist. Output a numbered narrative arc (problem → insight → evidence → ask) for a ${p.slideCount}-slide deck. ${VOICE}`,
    prompt: `Audience: ${p.audience || 'executives'}\n\nPLAN BRIEF:\n${p.brief}\n${p.extra ? `\nEXTRA CONTEXT:\n${p.extra}` : ''}\n\nGive ${p.slideCount} one-line slide beats. No slide JSON yet.`,
  };
}

export function draftPrompt(p: { brief: string; theme: ThemeId; outline: string }) {
  return {
    system: `You turn an outline into a slide deck JSON. ${VOICE}\n\n${SCHEMA_DOC}`,
    prompt: `Theme: "${p.theme}".\n\nOUTLINE:\n${p.outline}\n\nBRIEF (source of all facts):\n${p.brief}\n\nReturn the deck JSON now.`,
  };
}

export function criticPrompt(p: { deck: Deck; brief: string; issues: string }) {
  return {
    system: `You are a ruthless deck editor. Fix ONLY the flagged slides so they read as human-made and specific. Keep unflagged slides byte-identical. ${VOICE}\n\n${SCHEMA_DOC}`,
    prompt: `BRIEF:\n${p.brief}\n\nFLAGGED ISSUES:\n${p.issues}\n\nCURRENT DECK JSON:\n${JSON.stringify(p.deck)}\n\nReturn the FULL corrected deck JSON.`,
  };
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
}
```

- [ ] **Step 2: Write failing test** (`pipeline.test.ts`) — inject a fake `complete` so no network is hit.

```ts
import { describe, it, expect } from 'vitest';
import { generateDeck, estimateCost } from './pipeline';

const cleanDeck = { theme: 'midnight', slides: [
  { layout: 'title', title: 'Acme Q3 Growth' },
  { layout: 'data', heading: 'Churn', stat: '8%', caption: 'up from 6%' },
] };

function fakeComplete(seq: string[]) {
  let i = 0;
  return async () => ({ text: seq[Math.min(i++, seq.length - 1)], stopReason: 'end_turn', usage: { input: 100, output: 200 }, model: 'claude-sonnet-5' });
}

describe('generateDeck', () => {
  it('runs outline→draft→lint→critic and returns a valid deck + trace', async () => {
    const complete = fakeComplete([
      '1. title\n2. data',                       // outline
      JSON.stringify(cleanDeck),                  // draft (clean → lint passes)
      JSON.stringify(cleanDeck),                  // critic (unused if no issues, but safe)
    ]);
    const steps: string[] = [];
    const r = await generateDeck(
      { theme: 'midnight', slideCount: 2, audience: 'board', brief: 'Churn 8%. Acme.' },
      complete as never,
      (n) => steps.push(n.step),
    );
    expect(r.deck.slides.length).toBe(2);
    expect(r.meta.trace.map((t) => t.step)).toContain('lint');
    expect(steps).toContain('outline');
    expect(r.meta.costUsd).toBeGreaterThan(0);
  });

  it('throws a clear error on unparseable draft', async () => {
    const complete = fakeComplete(['outline', 'not json', 'still not json']);
    await expect(generateDeck({ theme: 'grid', slideCount: 1, audience: '', brief: 'x' }, complete as never))
      .rejects.toThrow();
  });

  it('estimateCost scales with slide count', () => {
    expect(estimateCost(10)).toBeGreaterThan(estimateCost(4));
  });
});
```

- [ ] **Step 3: Run, verify fail** — `npx vitest run src/lib/slides/pipeline.test.ts` → FAIL.

- [ ] **Step 4: Implement `pipeline.ts`**

```ts
import { completeRaw } from '@/lib/claude';
import { costOf, PLAN_MODEL } from '@/lib/cost';
import { validateDeck, type Deck, type ThemeId } from './deck';
import { lintDeck } from './slopLint';
import { outlinePrompt, draftPrompt, criticPrompt, extractJson } from './prompts';

export const STEP_BUDGET = { outline: 1200, draft: 6000, critic: 3000 } as const;

export interface GenParams { theme: ThemeId; slideCount: number; audience: string; brief: string; extra?: string }
export interface StepNote { step: 'outline' | 'draft' | 'lint' | 'critic'; note: string; data?: unknown }
export interface GenResult {
  deck: Deck;
  meta: { model: string; theme: ThemeId; slideCount: number; usage: { input: number; output: number }; costUsd: number; trace: StepNote[]; lintFixed: number };
}

type Complete = typeof completeRaw;

// rough pre-generate estimate: ~ (outline + draft + critic) budgets at Sonnet output price
export function estimateCost(slideCount: number): number {
  const outTokens = STEP_BUDGET.outline + slideCount * 350 + STEP_BUDGET.critic * 0.5;
  return costOf(PLAN_MODEL, { input: 1500 + slideCount * 120, output: outTokens });
}

function parseDeck(text: string, theme: ThemeId): Deck {
  const parsed = extractJson(text);
  const v = validateDeck(parsed);
  if (!v.ok) throw new Error(`deck parse failed: ${v.error}`);
  if (v.deck.theme !== theme) v.deck.theme = theme; // force requested theme
  return v.deck;
}

export async function generateDeck(p: GenParams, complete: Complete = completeRaw, onStep?: (n: StepNote) => void): Promise<GenResult> {
  const trace: StepNote[] = [];
  let inTok = 0, outTok = 0;
  const emit = (n: StepNote) => { trace.push(n); onStep?.(n); };
  const call = async (step: StepNote['step'], args: { system: string; prompt: string }, maxTokens: number) => {
    const r = await complete({ ...args, model: PLAN_MODEL, maxTokens });
    inTok += r.usage.input; outTok += r.usage.output;
    return r.text;
  };

  // 1. outline
  const outline = await call('outline', outlinePrompt(p), STEP_BUDGET.outline);
  emit({ step: 'outline', note: 'Narrative arc drafted' });

  // 2. draft (one repair retry on parse failure)
  let deck: Deck;
  try {
    deck = parseDeck(await call('draft', draftPrompt({ brief: p.brief, theme: p.theme, outline }), STEP_BUDGET.draft), p.theme);
  } catch {
    deck = parseDeck(await call('draft', draftPrompt({ brief: p.brief, theme: p.theme, outline }), STEP_BUDGET.draft), p.theme);
  }
  emit({ step: 'draft', note: `Drafted ${deck.slides.length} slides` });

  // 3. lint (free)
  const issues = lintDeck(deck, p.brief);
  emit({ step: 'lint', note: issues.length ? `${issues.length} quality issues found` : 'No AI-slop detected', data: issues });

  // 4. critic-revise (only if issues)
  let lintFixed = 0;
  if (issues.length) {
    const issueText = issues.map((i) => `slide ${i.slideIndex}: ${i.rule} — ${i.detail}`).join('\n');
    const revised = parseDeck(await call('critic', criticPrompt({ deck, brief: p.brief, issues: issueText }), STEP_BUDGET.critic), p.theme);
    lintFixed = issues.length - lintDeck(revised, p.brief).length;
    deck = revised;
    emit({ step: 'critic', note: `Revised ${issues.length} flagged slide(s); ${lintFixed} issue(s) cleared` });
  } else {
    emit({ step: 'critic', note: 'Skipped — nothing flagged' });
  }

  const usage = { input: inTok, output: outTok };
  return { deck, meta: { model: PLAN_MODEL, theme: p.theme, slideCount: deck.slides.length, usage, costUsd: costOf(PLAN_MODEL, usage), trace, lintFixed } };
}
```

- [ ] **Step 5: Run, verify pass** — `npx vitest run src/lib/slides/pipeline.test.ts` → PASS (3).

- [ ] **Step 6: Commit**
```bash
git add src/lib/slides/prompts.ts src/lib/slides/pipeline.ts src/lib/slides/pipeline.test.ts
git commit -m "feat(v1.14): generation pipeline (outline→draft→lint→critic) + cost estimate"
```

---

## Task 8: Generate route with SSE (`/api/plan/[id]/generate`)

**Files:**
- Create: `src/app/api/plan/[id]/generate/route.ts`

**Interfaces:**
- Consumes: `generateDeck`, `makePlanDbStore`, auth. Body: `{ theme, slideCount, extra? }` (brief+audience come from the stored plan).
- Produces: `POST` → `text/event-stream`. Events: `data: {"type":"step",...}` per `StepNote`; final `data: {"type":"done","versionNo":N,"deck":...,"meta":...}`; on error `data: {"type":"error","message":...}`.

- [ ] **Step 1: Implement the route (Node runtime, streaming)**

```ts
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';
import { makePlanDbStore } from '@/lib/planDb';
import { generateDeck } from '@/lib/slides/pipeline';
import { THEMES, type ThemeId } from '@/lib/slides/deck';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verifySession((await cookies()).get(ADMIN_COOKIE)?.value)) {
    return new Response('unauthorized', { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const theme: ThemeId = THEMES.includes(body.theme) ? body.theme : 'midnight';
  const slideCount = Math.min(Math.max(Number(body.slideCount) || 8, 3), 20);
  const store = makePlanDbStore();
  const plan = await store.getPlan(id);
  if (!plan) return new Response('not found', { status: 404 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      try {
        const result = await generateDeck(
          { theme, slideCount, audience: plan.audience, brief: plan.brief, extra: body.extra },
          undefined,
          (n) => send({ type: 'step', ...n }),
        );
        const version = await store.addVersion(id, result.deck, result.meta);
        send({ type: 'done', versionNo: version.versionNo, deck: result.deck, meta: result.meta });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : 'generation failed' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' } });
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → no errors.

- [ ] **Step 3: Manual smoke (dev server, real Sonnet key)** — create a plan with a factual brief, `curl -N` the endpoint with the admin cookie, confirm you see `step` events then a `done` event with a valid deck. Screenshot/log the event stream.

- [ ] **Step 4: Commit**
```bash
git add src/app/api/plan/[id]/generate/route.ts
git commit -m "feat(v1.14): SSE generate route — runs pipeline, streams steps, persists version"
```

---

## Task 9: Deck renderer + 3 themes (`DeckRenderer.tsx`)

**Files:**
- Create: `src/components/plan/DeckRenderer.tsx`, `src/components/plan/deck-themes.css`

**Interfaces:**
- Consumes: `Deck`, `Slide`. Produces `<DeckRenderer deck={deck} />` (renders all slides as 16:9 frames) and `<SlideView slide={s} />`. Theme applied via `data-theme={deck.theme}` + CSS vars.

- [ ] **Step 1: Implement `deck-themes.css`** — CSS-variable sets for the 3 themes on `[data-theme="..."]`, plus `.slide` 16:9 base + `@media print` (one slide per page, `break-after: page`, forced backgrounds via `print-color-adjust: exact`). Use the exact palettes from the approved mockups:
  - `midnight`: bg `#0b0e14`, fg `#eef1f6`, accent `#5cc8ff`.
  - `editorial`: bg `#f7f6f2`, fg `#17140f`, accent `#c8452d`.
  - `grid`: bg `#111` + faint grid, fg `#fff`, accent `#e8ff00` (uppercase headings).

```css
.slide { aspect-ratio: 16/9; width: 100%; padding: 6% 7%; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; font-family: var(--slide-font, -apple-system, Segoe UI, Roboto, sans-serif); }
.slide[data-theme="midnight"] { background: #0b0e14; color: #eef1f6; --accent: #5cc8ff; }
.slide[data-theme="editorial"] { background: #f7f6f2; color: #17140f; --accent: #c8452d; }
.slide[data-theme="grid"] { background: #111; color: #fff; --accent: #e8ff00; background-image: linear-gradient(#ffffff10 1px, transparent 1px), linear-gradient(90deg, #ffffff10 1px, transparent 1px); background-size: 40px 40px; }
.slide-title { font-size: clamp(24px, 4vw, 52px); font-weight: 800; letter-spacing: -0.02em; }
.slide[data-theme="grid"] .slide-title { text-transform: uppercase; font-weight: 900; }
.slide-kicker { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.7; }
.slide ul { list-style: none; padding: 0; display: grid; gap: 10px; }
.slide li::before { content: "—"; color: var(--accent); margin-right: 10px; }
.slide-stat { font-size: clamp(40px, 9vw, 110px); font-weight: 800; color: var(--accent); }
@media print { .slide { break-after: page; height: 100vh; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } }
```

- [ ] **Step 2: Implement `DeckRenderer.tsx`** — `switch (slide.layout)` → per-layout markup, no `dangerouslySetInnerHTML`.

```tsx
import type { Deck, Slide } from '@/lib/slides/deck';
import './deck-themes.css';

function SlideView({ slide, theme }: { slide: Slide; theme: string }) {
  const frame = (children: React.ReactNode) => <div className="slide" data-theme={theme}>{children}</div>;
  switch (slide.layout) {
    case 'title': return frame(<><div /><div><div className="slide-title">{slide.title}</div>{slide.subtitle && <p style={{ opacity: 0.7, marginTop: 12 }}>{slide.subtitle}</p>}</div><div /></>);
    case 'section': return frame(<><span className="slide-kicker">{slide.kicker}</span><div className="slide-title">{slide.title}</div><div /></>);
    case 'agenda': return frame(<><span className="slide-kicker">{slide.heading}</span><ul>{slide.items.map((x, i) => <li key={i}>{x}</li>)}</ul><div /></>);
    case 'bulletsVisual': return frame(<><h2 className="slide-title" style={{ fontSize: 32 }}>{slide.heading}</h2><ul>{slide.bullets.map((x, i) => <li key={i}>{x}</li>)}</ul>{slide.note && <p style={{ opacity: 0.6 }}>{slide.note}</p>}</>);
    case 'quote': return frame(<><div /><blockquote style={{ fontSize: 30, fontWeight: 600 }}>“{slide.quote}”</blockquote><cite style={{ opacity: 0.6 }}>{slide.attribution}</cite></>);
    case 'data': return frame(<><span className="slide-kicker">{slide.heading}</span><div className="slide-stat">{slide.stat}</div><p style={{ opacity: 0.7 }}>{slide.caption}</p></>);
    case 'comparison': return frame(<><h2 className="slide-title" style={{ fontSize: 30 }}>{slide.heading}</h2><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>{[slide.left, slide.right].map((c, i) => <div key={i}><h3 style={{ color: 'var(--accent)' }}>{c.title}</h3><ul>{c.points.map((p, j) => <li key={j}>{p}</li>)}</ul></div>)}</div><div /></>);
    case 'closing': return frame(<><div /><div className="slide-title">{slide.title}</div><p style={{ color: 'var(--accent)' }}>{slide.cta}</p></>);
  }
}

export function DeckRenderer({ deck }: { deck: Deck }) {
  return <div style={{ display: 'grid', gap: 16 }}>{deck.slides.map((s, i) => <SlideView key={i} slide={s} theme={deck.theme} />)}</div>;
}
```

- [ ] **Step 3: Verify in dev server** — temporarily render a hardcoded deck at `/plan` (or a scratch route), screenshot all 3 themes. Confirm no layout renders 3-in-a-row identically and the palettes match the mockups.

- [ ] **Step 4: Typecheck + commit**
```bash
npx tsc --noEmit
git add src/components/plan/DeckRenderer.tsx src/components/plan/deck-themes.css
git commit -m "feat(v1.14): deck renderer + 3 themes (Midnight/Editorial/Grid) + print CSS"
```

---

## Task 10: Plan detail — Manus split UI (wizard + thinking + deck)

**Files:**
- Create: `src/app/plan/[id]/page.tsx`, `src/components/plan/PlanDetail.tsx`, `src/components/plan/GenerateWizard.tsx`, `src/components/plan/ThinkingPane.tsx`, `src/components/plan/VersionSwitcher.tsx`
- Modify: `src/components/NavBar.tsx` (add `/plan` link)

**Interfaces:**
- Consumes: `GET /api/plan/[id]`, `POST /api/plan/[id]/generate` (SSE), `DeckRenderer`, `estimateCost`, `THEMES`.
- Produces: the full experience — left `ThinkingPane` (streamed steps), right live `DeckRenderer`; `GenerateWizard` (theme/slideCount/audience/extra + cost estimate); `VersionSwitcher`.

- [ ] **Step 1: Implement gated server page** (`src/app/plan/[id]/page.tsx`) — same gate pattern as Task 4, renders `<PlanDetail id={id} />` when authed.

```tsx
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { NavBar } from '@/components/NavBar';
import { AdminLogin } from '@/components/AdminLogin';
import { PlanDetail } from '@/components/plan/PlanDetail';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';

export const metadata: Metadata = { title: 'Plan', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const authed = verifySession((await cookies()).get(ADMIN_COOKIE)?.value);
  const { id } = await params;
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <NavBar />
      {authed ? <PlanDetail id={id} /> : <AdminLogin />}
    </div>
  );
}
```

- [ ] **Step 2: Implement `GenerateWizard.tsx`** — controlled fields `theme` (THEMES), `slideCount` (3–20), `extra`; shows `estimateCost(slideCount)` formatted as `$0.0X`; calls `onGenerate({theme,slideCount,extra})`.

```tsx
'use client';
import { useState } from 'react';
import { THEMES, type ThemeId } from '@/lib/slides/deck';
import { estimateCost } from '@/lib/slides/pipeline';

export function GenerateWizard({ audience, onGenerate, busy }: { audience: string; onGenerate: (o: { theme: ThemeId; slideCount: number; extra: string }) => void; busy: boolean }) {
  const [theme, setTheme] = useState<ThemeId>('midnight');
  const [slideCount, setSlideCount] = useState(8);
  const [extra, setExtra] = useState('');
  return (
    <div style={{ display: 'grid', gap: 10, border: '1px solid #2a3038', borderRadius: 10, padding: 16 }}>
      <label>Theme
        <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeId)}>
          {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label>Slides: {slideCount}
        <input type="range" min={3} max={20} value={slideCount} onChange={(e) => setSlideCount(Number(e.target.value))} />
      </label>
      <div style={{ fontSize: 12, opacity: 0.7 }}>Audience: {audience || 'executives'}</div>
      <textarea placeholder="Optional extra context" rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} />
      <div style={{ fontSize: 12, opacity: 0.7 }}>Est. cost: ${estimateCost(slideCount).toFixed(3)}</div>
      <button disabled={busy} onClick={() => onGenerate({ theme, slideCount, extra })} style={{ padding: '10px 16px', borderRadius: 8, background: '#3b5bff', color: '#fff', border: 0 }}>
        {busy ? 'Generating…' : '✦ AI Slide'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Implement `ThinkingPane.tsx`** — renders the streamed `StepNote[]` as a live vertical trace with per-step status (done/active), and lint issues expanded under the `lint` step.

```tsx
'use client';
import type { StepNote } from '@/lib/slides/pipeline';

const LABEL: Record<string, string> = { outline: 'Outlining narrative', draft: 'Drafting slides', lint: 'Quality check', critic: 'Revising flagged slides' };

export function ThinkingPane({ steps, done }: { steps: StepNote[]; done: boolean }) {
  return (
    <div style={{ display: 'grid', gap: 12, gridAutoRows: 'min-content' }}>
      <div className="slide-kicker">Thinking</div>
      {steps.map((s, i) => (
        <div key={i} style={{ borderLeft: '2px solid var(--accent,#3b5bff)', paddingLeft: 12 }}>
          <div style={{ fontWeight: 600 }}>{LABEL[s.step] ?? s.step}</div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>{s.note}</div>
          {s.step === 'lint' && Array.isArray(s.data) && (s.data as unknown[]).length > 0 && (
            <ul style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
              {(s.data as { slideIndex: number; rule: string }[]).map((it, j) => <li key={j}>slide {it.slideIndex}: {it.rule}</li>)}
            </ul>
          )}
        </div>
      ))}
      {!done && steps.length > 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>working…</div>}
    </div>
  );
}
```

- [ ] **Step 4: Implement `PlanDetail.tsx`** — the two-pane split. Fetches the plan; renders `GenerateWizard`; on generate, opens `fetch(.../generate)` and reads the SSE stream, pushing `step` events into `ThinkingPane` (left) and rendering the deck on `done` (right); after done, refetches versions and shows `VersionSwitcher`.

```tsx
'use client';
import { useEffect, useState } from 'react';
import type { ThemeId, Deck } from '@/lib/slides/deck';
import type { StepNote } from '@/lib/slides/pipeline';
import { GenerateWizard } from './GenerateWizard';
import { ThinkingPane } from './ThinkingPane';
import { DeckRenderer } from './DeckRenderer';
import { VersionSwitcher } from './VersionSwitcher';
import { ExportButtons } from './ExportButtons';

type Plan = { id: string; title: string; brief: string; audience: string };
type Version = { versionNo: number; deck: Deck; meta: { costUsd: number; lintFixed: number } };

export function PlanDetail({ id }: { id: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [shown, setShown] = useState<Deck | null>(null);
  const [steps, setSteps] = useState<StepNote[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    const d = await fetch(`/api/plan/${id}`).then((r) => r.json());
    setPlan(d.plan); setVersions(d.versions ?? []);
    if (d.latest) setShown(d.latest.deck);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function generate(opts: { theme: ThemeId; slideCount: number; extra: string }) {
    setBusy(true); setErr(''); setSteps([]); setShown(null);
    const res = await fetch(`/api/plan/${id}/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(opts) });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n'); buf = parts.pop() ?? '';
      for (const p of parts) {
        const line = p.replace(/^data: /, '').trim();
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.type === 'step') setSteps((s) => [...s, ev]);
        else if (ev.type === 'done') { setShown(ev.deck); await load(); }
        else if (ev.type === 'error') setErr(ev.message);
      }
    }
    setBusy(false);
  }

  if (!plan) return <main style={{ padding: 24 }}>Loading…</main>;
  return (
    <main style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 20, padding: 20, alignItems: 'start' }}>
      <section style={{ display: 'grid', gap: 16 }}>
        <div><h1 style={{ fontSize: 22, fontWeight: 700 }}>{plan.title}</h1><p style={{ fontSize: 13, opacity: 0.7, whiteSpace: 'pre-wrap' }}>{plan.brief}</p></div>
        <GenerateWizard audience={plan.audience} onGenerate={generate} busy={busy} />
        {steps.length > 0 && <ThinkingPane steps={steps} done={!busy} />}
        {err && <p style={{ color: '#ff6b6b' }}>{err}</p>}
        {versions.length > 0 && <VersionSwitcher planId={id} versions={versions} onPick={setShown} />}
      </section>
      <section>
        {shown ? <><ExportButtons planId={id} versionNo={versions[0]?.versionNo ?? 1} /><DeckRenderer deck={shown} /></> : <p style={{ opacity: 0.5 }}>Generate a deck to see it here.</p>}
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Implement `VersionSwitcher.tsx`** — lists versions (newest first) with cost + `lintFixed`; clicking sets the shown deck.

```tsx
'use client';
import type { Deck } from '@/lib/slides/deck';
type Version = { versionNo: number; deck: Deck; meta: { costUsd: number; lintFixed: number } };
export function VersionSwitcher({ versions, onPick }: { planId: string; versions: Version[]; onPick: (d: Deck) => void }) {
  return (
    <div>
      <div className="slide-kicker" style={{ marginBottom: 6 }}>Versions</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {versions.map((v) => (
          <button key={v.versionNo} onClick={() => onPick(v.deck)} style={{ textAlign: 'left', padding: 8, border: '1px solid #2a3038', borderRadius: 6, background: 'transparent', color: 'inherit' }}>
            v{v.versionNo} · ${v.meta.costUsd?.toFixed(3)} · {v.meta.lintFixed ?? 0} fixed
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add `/plan` link to `NavBar.tsx`** — follow the existing nav-item pattern (read the file first; add a `Plan` link next to the admin/dashboard entries).

- [ ] **Step 7: Verify full flow in dev server** — log in, open a plan, click ✦ AI Slide, watch the thinking pane stream and the deck appear on the right, switch versions. Screenshot. (`ExportButtons` wired in Task 11.)

- [ ] **Step 8: Typecheck + commit**
```bash
npx tsc --noEmit
git add src/app/plan/[id] src/components/plan/GenerateWizard.tsx src/components/plan/ThinkingPane.tsx src/components/plan/PlanDetail.tsx src/components/plan/VersionSwitcher.tsx src/components/NavBar.tsx
git commit -m "feat(v1.14): plan detail Manus-split UI (wizard + thinking pane + live deck + versions)"
```

---

## Task 11: Export — PPTX (`pptxgenjs`) + PDF (print)

**Files:**
- Create: `src/lib/slides/pptx.ts`, `src/lib/slides/pptx.test.ts`, `src/app/api/plan/[id]/export/route.ts`, `src/components/plan/ExportButtons.tsx`
- Modify: `package.json` (add `pptxgenjs`)

**Interfaces:**
- Consumes: `Deck`, `Slide`, `pptxgenjs`, `makePlanDbStore`.
- Produces: `async function deckToPptx(deck: Deck): Promise<Buffer>`; `GET /api/plan/[id]/export?fmt=pptx&v=N` → downloadable `.pptx`; PDF via client `window.print()`.

- [ ] **Step 1: Add dep** — `npm install pptxgenjs` (pure JS, no native build).

- [ ] **Step 2: Write failing test** (`pptx.test.ts`) — assert the mapper emits one PPTX slide per deck slide and returns a non-empty buffer.

```ts
import { describe, it, expect } from 'vitest';
import { deckToPptx, countPptxSlides } from './pptx';
import type { Deck } from './deck';

const deck: Deck = { theme: 'midnight', slides: [
  { layout: 'title', title: 'T', subtitle: 's' },
  { layout: 'data', heading: 'Churn', stat: '8%', caption: 'up' },
  { layout: 'bulletsVisual', heading: 'Plan', bullets: ['a', 'b'] },
] };

describe('deckToPptx', () => {
  it('produces a slide per deck slide', () => {
    expect(countPptxSlides(deck)).toBe(3);
  });
  it('returns a non-empty buffer', async () => {
    const buf = await deckToPptx(deck);
    expect(buf.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run, verify fail** — `npx vitest run src/lib/slides/pptx.test.ts` → FAIL.

- [ ] **Step 4: Implement `pptx.ts`** — map each `Slide` to pptxgenjs shapes using the theme's bg/fg/accent. `countPptxSlides` = `deck.slides.length` (pure, testable without generating the binary).

```ts
import PptxGenJS from 'pptxgenjs';
import type { Deck, Slide } from './deck';

const THEME_COLORS: Record<string, { bg: string; fg: string; accent: string }> = {
  midnight: { bg: '0B0E14', fg: 'EEF1F6', accent: '5CC8FF' },
  editorial: { bg: 'F7F6F2', fg: '17140F', accent: 'C8452D' },
  grid: { bg: '111111', fg: 'FFFFFF', accent: 'E8FF00' },
};

export function countPptxSlides(deck: Deck): number { return deck.slides.length; }

function addSlide(pptx: PptxGenJS, s: Slide, c: { bg: string; fg: string; accent: string }) {
  const slide = pptx.addSlide();
  slide.background = { color: c.bg };
  const body = (text: string, y: number, opts: object = {}) => slide.addText(text, { x: 0.6, y, w: 9, color: c.fg, fontSize: 18, ...opts });
  switch (s.layout) {
    case 'title': body(s.title, 2.2, { fontSize: 40, bold: true }); if (s.subtitle) body(s.subtitle, 3.4, { color: c.accent }); break;
    case 'section': body(s.kicker ?? '', 2.0, { color: c.accent, fontSize: 12 }); body(s.title, 2.6, { fontSize: 34, bold: true }); break;
    case 'agenda': body(s.heading, 0.6, { color: c.accent, fontSize: 12 }); slide.addText(s.items.map((t) => ({ text: t, options: { bullet: true } })), { x: 0.6, y: 1.4, w: 9, color: c.fg, fontSize: 18 }); break;
    case 'bulletsVisual': body(s.heading, 0.6, { fontSize: 26, bold: true }); slide.addText(s.bullets.map((t) => ({ text: t, options: { bullet: true } })), { x: 0.6, y: 1.6, w: 9, color: c.fg, fontSize: 18 }); break;
    case 'quote': body(`“${s.quote}”`, 2.0, { fontSize: 28, italic: true }); if (s.attribution) body(s.attribution, 3.6, { color: c.accent }); break;
    case 'data': body(s.heading, 0.8, { color: c.accent, fontSize: 12 }); body(s.stat, 1.6, { fontSize: 72, bold: true, color: c.accent }); if (s.caption) body(s.caption, 3.8); break;
    case 'comparison': body(s.heading, 0.6, { fontSize: 24, bold: true }); slide.addText(s.left.points.map((t) => ({ text: t, options: { bullet: true } })), { x: 0.6, y: 1.6, w: 4.2, color: c.fg }); slide.addText(s.right.points.map((t) => ({ text: t, options: { bullet: true } })), { x: 5.2, y: 1.6, w: 4.2, color: c.fg }); break;
    case 'closing': body(s.title, 2.4, { fontSize: 36, bold: true }); if (s.cta) body(s.cta, 3.8, { color: c.accent }); break;
  }
}

export async function deckToPptx(deck: Deck): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'W', width: 10, height: 5.63 });
  pptx.layout = 'W';
  const c = THEME_COLORS[deck.theme] ?? THEME_COLORS.midnight;
  for (const s of deck.slides) addSlide(pptx, s, c);
  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
}
```

- [ ] **Step 5: Run, verify pass** — `npx vitest run src/lib/slides/pptx.test.ts` → PASS (2).

- [ ] **Step 6: Implement export route** (`src/app/api/plan/[id]/export/route.ts`)

```ts
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';
import { makePlanDbStore } from '@/lib/planDb';
import { deckToPptx } from '@/lib/slides/pptx';
import { validateDeck } from '@/lib/slides/deck';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verifySession((await cookies()).get(ADMIN_COOKIE)?.value)) return new Response('unauthorized', { status: 401 });
  const { id } = await params;
  const url = new URL(req.url);
  const v = Number(url.searchParams.get('v'));
  const ver = await makePlanDbStore().getVersion(id, v);
  if (!ver) return new Response('not found', { status: 404 });
  const parsed = validateDeck(ver.deck);
  if (!parsed.ok) return new Response('bad deck', { status: 422 });
  const buf = await deckToPptx(parsed.deck);
  return new Response(buf, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'content-disposition': `attachment; filename="plan-${id}-v${v}.pptx"` } });
}
```

- [ ] **Step 7: Implement `ExportButtons.tsx`** — PPTX = link to the export route; PDF = `window.print()` (the deck-themes `@media print` handles pagination).

```tsx
'use client';
export function ExportButtons({ planId, versionNo }: { planId: string; versionNo: number }) {
  return (
    <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <a href={`/api/plan/${planId}/export?fmt=pptx&v=${versionNo}`} style={{ padding: '6px 12px', border: '1px solid #2a3038', borderRadius: 6 }}>Export PPTX</a>
      <button onClick={() => window.print()} style={{ padding: '6px 12px', border: '1px solid #2a3038', borderRadius: 6, background: 'transparent', color: 'inherit' }}>Export PDF</button>
    </div>
  );
}
```

- [ ] **Step 8: Verify** — `npx vitest run` (full suite green), then dev server: export a real deck to PPTX (open in PowerPoint/Keynote/Google Slides) and to PDF (print dialog → one slide per page). Screenshot both.

- [ ] **Step 9: Commit**
```bash
git add src/lib/slides/pptx.ts src/lib/slides/pptx.test.ts src/app/api/plan/[id]/export/route.ts src/components/plan/ExportButtons.tsx package.json package-lock.json
git commit -m "feat(v1.14): export — PPTX via pptxgenjs + PDF via print CSS"
```

---

## Task 12: Release — version bump, verify, ship v1.14.0

**Files:**
- Modify: `package.json` (`version` → `1.14.0`), `CHANGELOG.md`

**Interfaces:** none — this is the release task.

- [ ] **Step 1: Full verification gate** — run all of:
```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```
Expected: all green. Fix anything red before proceeding (do NOT claim done on a red gate).

- [ ] **Step 2: Bump version** — set `"version": "1.14.0"` in `package.json` (the NavBar reads it).

- [ ] **Step 3: CHANGELOG entry** — add a `## 1.14.0 — /plan AI Slide Generator` section summarizing: new `/plan` module, JSON-deck engine, 4-step anti-slop pipeline, Manus-split UI, 3 themes, PPTX/PDF export, Neon `plan`/`deck_version` tables.

- [ ] **Step 4: Commit**
```bash
git add package.json CHANGELOG.md
git commit -m "release(v1.14.0): /plan AI slide generator"
```

- [ ] **Step 5: Deploy** — hand off to the `base-deployment` skill (vibe-code → verify → version bump → Vercel prod confirm). Merge `feat/v114-plan-slides` → `main`, push, confirm the Vercel production deploy succeeds.

- [ ] **Step 6: Post-deploy migration (one-shot)** — after the deploy is live, apply the schema:
```bash
curl -X POST https://company.nanoteofficial.me/api/plan/migrate -H "Authorization: Bearer $CRON_SECRET"
```
Expected: `{ "applied": true, ... }`. Then smoke-test: create a plan and generate a deck in production.

---

## Self-Review

**Spec coverage:**
- Req 1 (per-plan AI-Slide button) → Task 10 (GenerateWizard). ✅
- Req 2 (Sonnet via API key) → Task 6 (`PLAN_MODEL`) + Task 7 (pipeline via `completeRaw`). ✅
- Req 3 (presentation add-on + skill) → `src/lib/slides/*` module + `pptxgenjs` (Task 7, 11). ✅
- Req 4 (theme/slides/audience/context before one-click) → Task 10 (GenerateWizard). ✅
- Req 5 (Manus-like UX) → Task 10 (split UI + ThinkingPane). ✅
- Req 6 (versioning + pptx/pdf export) → Task 1 (`deck_version`), Task 11 (export). ✅
- Req 7 (not AI-generated) → Task 6 (linter) + Task 7 (critic-revise) + Task 9 (varied layouts/themes). ✅
- Req 8 (step review + chain-of-thought transparency) → Task 7 (`trace`) + Task 10 (ThinkingPane) + `meta_json`. ✅
- Req 9 (cost management) → Task 6 (pricing), Task 7 (STEP_BUDGET + estimateCost), Task 10 (estimate shown), `costUsd` ledger. ✅
- Req 10 (production launch) → Task 12 (base-deployment). ✅

**Placeholder scan:** No TBD/TODO; every code step has full code. The one deliberate lookup is the verified Sonnet id/price (Task 6 Step 1) — flagged, not a placeholder.

**Type consistency:** `PlanStore`/`DeckVersionRow` (Task 1) consumed unchanged in Tasks 3, 8, 11. `Deck`/`Slide`/`ThemeId`/`THEMES` (Task 5) consumed in 6, 7, 9, 10, 11. `GenParams`/`StepNote`/`GenResult`/`estimateCost` (Task 7) consumed in 8, 10. `deckToPptx`/`countPptxSlides` (Task 11) match their test. `PLAN_MODEL` (Task 6) consumed in 7. No signature drift found.
