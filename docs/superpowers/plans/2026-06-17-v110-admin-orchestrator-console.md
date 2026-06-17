# /admin Orchestrator Console (v1.10.0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the company `/admin` page into an orchestration console (Layout B: left nav + agent list + right inspector + ⌘K) where each agent is managed like a service and KB curation publishes straight to the Library.

**Architecture:** One client shell `AdminConsole` (replaces `AdminClient`) with in-component section panels (Overview/Agents/Knowledge/Activity) — no new routes, the existing server-side cookie gate in `app/admin/page.tsx` stays. New backend is minimal and reuses existing seams: an enable/disable Redis flag honored by the cron route, an optional `overrides` field on `AgentContext` for run-with-options, and a fire-and-forget Library sync push on publish.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Upstash Redis, Vitest. **No new dependencies.**

## Global Constraints

- **No new runtime dependencies** — native browser APIs only (hand-rolled ⌘K; no `cmdk`).
- **No `dangerouslySetInnerHTML`** — render KB content with the existing `Markdown` component + `ArtifactRenderer`.
- **Auth model unchanged** — HMAC cookie (`ADMIN_COOKIE`, `verifySession`), gate in `app/admin/page.tsx`, every `/api/admin/*` route re-checks `verifySession(req.cookies.get(ADMIN_COOKIE)?.value)`. No middleware.
- **Default-compatible** — absent `overrides` and absent `agent:disabled:*` reproduce today's exact behavior; no regression to cron runs.
- **`RedisRepo` is `ReturnType<typeof makeRedisRepo>`** (`redis.ts:216`) — adding methods to `makeRedisRepo` extends the type automatically.
- **Tests:** Vitest with the in-memory `RedisClientLike` stand-in (`memoryClient()` pattern from `src/lib/dashboard.test.ts:7-23`). No visual unit tests — UI verified via dev server + screenshots (repo convention).
- **Final version:** bump `package.json` `1.9.0` → `1.10.0`; the NavBar reads it.

---

### Task 1: Enable/Disable scheduled runs — Redis flag + cron gate + admin route

**Files:**
- Modify: `src/lib/redis.ts` (add two methods inside `makeRedisRepo`, after `getUsageSince` ~line 156)
- Test: `src/lib/redis.disabled.test.ts` (create)
- Modify: `src/app/api/cron/run/route.ts` (gate before run)
- Create: `src/app/api/admin/agent/route.ts`

**Interfaces:**
- Produces: `repo.setAgentDisabled(dept: DeptId, disabled: boolean): Promise<void>`, `repo.getDisabledDepts(): Promise<DeptId[]>`, `repo.isAgentDisabled(dept: DeptId): Promise<boolean>`.
- Consumes: `RedisClientLike.set/get/del` (`redis.ts:93-101`), `isDeptId` (`@/lib/agents`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/redis.disabled.test.ts
import { describe, it, expect } from 'vitest';
import { makeRedisRepo, type RedisClientLike } from './redis';

function memoryClient(): RedisClientLike {
  const store = new Map<string, unknown>();
  return {
    async set(k, v) { store.set(k, v); return 'OK'; },
    async get<T>(k: string) { return (store.get(k) as T) ?? null; },
    async del(...keys: string[]) { keys.forEach((k) => store.delete(k)); return keys.length; },
    async mget<T>(keys: string[]) { return keys.map((k) => (store.get(k) as T) ?? null); },
    async lpush() { return 1; },
    async lrem() { return 0; },
    async ltrim() { return 'OK'; },
    async lrange<T>() { return [] as T[]; },
  };
}

describe('agent disabled flag', () => {
  it('defaults to enabled (not disabled)', async () => {
    const repo = makeRedisRepo(memoryClient());
    expect(await repo.isAgentDisabled('fin')).toBe(false);
    expect(await repo.getDisabledDepts()).toEqual([]);
  });

  it('sets, reads, and clears a disabled flag', async () => {
    const repo = makeRedisRepo(memoryClient());
    await repo.setAgentDisabled('fin', true);
    expect(await repo.isAgentDisabled('fin')).toBe(true);
    expect(await repo.getDisabledDepts()).toEqual(['fin']);
    await repo.setAgentDisabled('fin', false);
    expect(await repo.isAgentDisabled('fin')).toBe(false);
    expect(await repo.getDisabledDepts()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/redis.disabled.test.ts`
Expected: FAIL — `repo.setAgentDisabled is not a function`.

- [ ] **Step 3: Add the repo methods**

In `src/lib/redis.ts`, inside `makeRedisRepo`'s returned object (after the `getUsageSince` method, ~line 156), add. Also add `import { DEPARTMENTS } from '@/lib/data/departments';` if not already imported (it imports `DeptId` from there already — extend the import).

```typescript
    async setAgentDisabled(dept: DeptId, disabled: boolean) {
      if (disabled) await client.set(`agent:disabled:${dept}`, '1');
      else await client.del(`agent:disabled:${dept}`);
    },
    async isAgentDisabled(dept: DeptId): Promise<boolean> {
      return (await client.get<string>(`agent:disabled:${dept}`)) === '1';
    },
    async getDisabledDepts(): Promise<DeptId[]> {
      const flags = await Promise.all(
        DEPARTMENTS.map(async (d) => ((await client.get<string>(`agent:disabled:${d.id}`)) === '1' ? d.id : null)),
      );
      return flags.filter((d): d is DeptId => d !== null);
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/redis.disabled.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Gate the cron route**

In `src/app/api/cron/run/route.ts`, after the `isDeptId` check (line 19) and before the `try`, add:

```typescript
  if (await getRepo().isAgentDisabled(dept)) {
    return NextResponse.json({ ok: true, dept, skipped: 'disabled' });
  }
```

(`getRepo` is already imported.)

- [ ] **Step 6: Create the admin toggle route**

```typescript
// src/app/api/admin/agent/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';
import { isDeptId } from '@/lib/agents';
import { getRepo } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  if (!verifySession(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { dept?: string; disabled?: boolean };
  if (!body.dept || !isDeptId(body.dept)) return new NextResponse('bad dept', { status: 400 });
  if (typeof body.disabled !== 'boolean') return new NextResponse('bad disabled', { status: 400 });
  await getRepo().setAgentDisabled(body.dept, body.disabled);
  return NextResponse.json({ ok: true, dept: body.dept, disabled: body.disabled });
}
```

- [ ] **Step 7: Verify type-check + tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/redis.disabled.test.ts`
Expected: clean; 2 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/redis.ts src/lib/redis.disabled.test.ts src/app/api/cron/run/route.ts src/app/api/admin/agent/route.ts
git commit -m "feat(admin): enable/disable agent scheduled runs (Redis flag + cron gate + PATCH /api/admin/agent)"
```

---

### Task 2: Run-with-options — `overrides` on AgentContext, threaded into runs

**Scope note (ponytail):** overrides are limited to **`model` and `maxSearches`** — the two knobs every dept passes to `completeRaw`. `theme` override is deferred (per-dept theme logic, low value vs. cost). This narrows the spec's `{theme?,maxSearches?,model?}` to `{maxSearches?,model?}`; flag at review if theme is wanted now.

**Files:**
- Modify: `src/lib/agents/types.ts` (add `RunOverrides` + `AgentContext.overrides`)
- Modify: `src/lib/claude.ts` (add `applyOverrides` helper)
- Modify: `src/lib/agents/runner.ts` (`runAgent` + `buildContext` accept/attach overrides)
- Modify (one-line wrap each): `src/lib/agents/{cyberx,finance,marketing,rnd,operations,ceo}.ts`
- Modify: `src/app/api/admin/run/route.ts` (read `overrides` from body)
- Test: `src/lib/claude.overrides.test.ts` (create)

**Interfaces:**
- Produces: `RunOverrides = { maxSearches?: number; model?: string }`; `AgentContext.overrides?: RunOverrides`; `applyOverrides(opts: CompleteOpts, ctx: AgentContext): CompleteOpts`; `runAgent(agent, deps, overrides?: RunOverrides)`.
- Consumes: `CompleteOpts` (`claude.ts:25`), `AgentContext` (`types.ts:133`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/claude.overrides.test.ts
import { describe, it, expect } from 'vitest';
import { applyOverrides } from './claude';
import type { AgentContext } from './agents/types';

const baseCtx: AgentContext = { ownHistory: [], companyDigest: [], todayPeers: [] };
const opts = { system: 's', prompt: 'p', maxSearches: 5, model: 'claude-haiku-4-5', maxTokens: 8000, webSearch: true };

describe('applyOverrides', () => {
  it('returns opts unchanged when no overrides', () => {
    expect(applyOverrides(opts, baseCtx)).toEqual(opts);
  });
  it('overlays maxSearches and model when present', () => {
    const ctx = { ...baseCtx, overrides: { maxSearches: 2, model: 'claude-sonnet-4-6' } };
    const out = applyOverrides(opts, ctx);
    expect(out.maxSearches).toBe(2);
    expect(out.model).toBe('claude-sonnet-4-6');
    expect(out.maxTokens).toBe(8000); // untouched
  });
  it('ignores undefined override fields', () => {
    const ctx = { ...baseCtx, overrides: { maxSearches: 3 } };
    expect(applyOverrides(opts, ctx).model).toBe('claude-haiku-4-5');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/claude.overrides.test.ts`
Expected: FAIL — `applyOverrides is not exported`.

- [ ] **Step 3: Add types**

In `src/lib/agents/types.ts`, add near `AgentContext`:

```typescript
export interface RunOverrides { maxSearches?: number; model?: string }
```

and add to the `AgentContext` interface body:

```typescript
  /** v1.10 — operator run-with-options overrides (run-now from /admin). */
  overrides?: RunOverrides;
```

- [ ] **Step 4: Add `applyOverrides` to claude.ts**

```typescript
// src/lib/claude.ts — add near CompleteOpts
import type { AgentContext } from './agents/types';

/** v1.10 — overlay operator run-with-options onto a completeRaw opts object. */
export function applyOverrides<T extends { maxSearches?: number; model?: string }>(
  opts: T, ctx: { overrides?: { maxSearches?: number; model?: string } },
): T {
  const o = ctx.overrides;
  if (!o) return opts;
  return {
    ...opts,
    ...(o.maxSearches !== undefined ? { maxSearches: o.maxSearches } : {}),
    ...(o.model !== undefined ? { model: o.model } : {}),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/claude.overrides.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Thread overrides through the runner**

In `src/lib/agents/runner.ts`: change `buildContext` signature to `export async function buildContext(dept: DeptId, repo: RedisRepo, overrides?: RunOverrides): Promise<AgentContext>` (import `RunOverrides` from `./types`), and at the `return { ownHistory, ... }` add `overrides,`. Change `runAgent` to `export async function runAgent(agent: Agent, deps: RunnerDeps, overrides?: RunOverrides)` and the internal call to `await buildContext(dept, repo, overrides)`.

- [ ] **Step 7: Wrap each dept's completeRaw call**

In each of `cyberx.ts`, `finance.ts`, `marketing.ts`, `rnd.ts`, `operations.ts`, `ceo.ts`: import `applyOverrides` from `@/lib/claude` (extend the existing `completeRaw` import), and wrap the opts object — change `await completeRaw({ ... })` to `await completeRaw(applyOverrides({ ... }, ctx))`. The opts object and `ctx` are already in scope in each `run(ctx)`. (6 identical edits.)

- [ ] **Step 8: Read overrides in the admin run route**

In `src/app/api/admin/run/route.ts`, parse an optional body and pass it through:

```typescript
  const body = (await req.json().catch(() => ({}))) as { overrides?: { maxSearches?: number; model?: string } };
  // ...
  const result = await runAgent(
    { dept, run: AGENTS[dept] },
    { repo: getRepo(), notify: (t) => sendMessage(t) },
    body.overrides,
  );
```

- [ ] **Step 9: Verify type-check + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean; all tests PASS (including the new overrides test and unchanged dept tests — absent overrides reproduce prior calls).

- [ ] **Step 10: Commit**

```bash
git add src/lib/agents/types.ts src/lib/claude.ts src/lib/claude.overrides.test.ts src/lib/agents/runner.ts src/lib/agents/*.ts src/app/api/admin/run/route.ts
git commit -m "feat(admin): run-with-options — optional maxSearches/model overrides threaded through runAgent"
```

---

### Task 3: Instant publish → Library sync push (must-have #2)

**Files:**
- Create: `src/lib/librarySync.ts`
- Test: `src/lib/librarySync.test.ts`
- Modify: `src/lib/redis.ts` (add `pushSyncLog`/`getSyncLog`)
- Modify: `src/app/api/admin/kb/route.ts` (fire push when status→published)

**Interfaces:**
- Produces: `pushLibrarySync(entrySlug: string, repo: RedisRepo): Promise<{ ok: boolean; detail: string }>`; `SyncLogEntry = { slug: string; ok: boolean; detail: string; ts: number }`; `repo.pushSyncLog(e: SyncLogEntry)`, `repo.getSyncLog(): Promise<SyncLogEntry[]>`.
- Env consumed: `LIBRARY_SYNC_URL`, `LIBRARY_SYNC_SECRET`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/librarySync.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { pushLibrarySync } from './librarySync';

const repo = { pushSyncLog: vi.fn(async () => {}) } as any;
afterEach(() => { vi.restoreAllMocks(); delete process.env.LIBRARY_SYNC_URL; delete process.env.LIBRARY_SYNC_SECRET; });

describe('pushLibrarySync', () => {
  it('no-ops when env is unset', async () => {
    const r = await pushLibrarySync('fin-2026-06-17-x', repo);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/not configured/i);
  });
  it('posts to the Library and logs success on 2xx', async () => {
    process.env.LIBRARY_SYNC_URL = 'https://kb.example/api/sync';
    process.env.LIBRARY_SYNC_SECRET = 'secret';
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    const r = await pushLibrarySync('fin-2026-06-17-x', repo);
    expect(fetchMock).toHaveBeenCalledWith('https://kb.example/api/sync', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
    }));
    expect(r.ok).toBe(true);
    expect(repo.pushSyncLog).toHaveBeenCalled();
  });
  it('is fail-soft on non-2xx (resolves, ok=false)', async () => {
    process.env.LIBRARY_SYNC_URL = 'https://kb.example/api/sync';
    process.env.LIBRARY_SYNC_SECRET = 'secret';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response));
    const r = await pushLibrarySync('fin-2026-06-17-x', repo);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/librarySync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `librarySync.ts`**

```typescript
// src/lib/librarySync.ts
import type { RedisRepo } from './redis';

export interface SyncLogEntry { slug: string; ok: boolean; detail: string; ts: number }

/**
 * Fire-and-forget push to the Library's POST /api/sync (idempotent runSync).
 * Fail-soft: never throws — a failed push is logged; the Library's daily cron
 * is the backstop. No-op when env unset (like other optional integrations).
 */
export async function pushLibrarySync(entrySlug: string, repo: RedisRepo): Promise<{ ok: boolean; detail: string }> {
  const url = process.env.LIBRARY_SYNC_URL;
  const secret = process.env.LIBRARY_SYNC_SECRET;
  if (!url || !secret) return { ok: false, detail: 'Library sync not configured' };
  let ok = false; let detail = '';
  try {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
    ok = res.ok; detail = ok ? `synced (${res.status})` : `push failed (${res.status})`;
  } catch (err) {
    detail = `push error: ${err instanceof Error ? err.message : String(err)}`;
  }
  await repo.pushSyncLog({ slug: entrySlug, ok, detail, ts: Date.now() });
  return { ok, detail };
}
```

- [ ] **Step 4: Add synclog repo methods**

In `src/lib/redis.ts`, add a constant near `USAGE_KEY`: `const SYNCLOG_KEY = 'library:synclog'; const SYNCLOG_CAP = 20;`, import `SyncLogEntry` (`import type { SyncLogEntry } from './librarySync';`), and add inside `makeRedisRepo`:

```typescript
    async pushSyncLog(e: SyncLogEntry) {
      await client.lpush(SYNCLOG_KEY, e);
      await client.ltrim(SYNCLOG_KEY, 0, SYNCLOG_CAP - 1);
    },
    async getSyncLog(): Promise<SyncLogEntry[]> {
      return await client.lrange<SyncLogEntry>(SYNCLOG_KEY, 0, SYNCLOG_CAP - 1);
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/librarySync.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Fire the push on publish**

In `src/app/api/admin/kb/route.ts` `PATCH`, after a successful `updateKbEntry` (line 68-70), when the patch published the entry, fire the push (do not await-block the response on failure):

```typescript
    const entry = await getRepo().updateKbEntry(body.id, patch);
    if (!entry) return new NextResponse('not found', { status: 404 });
    if (patch.status === 'published') {
      // fire-and-forget; pushLibrarySync is itself fail-soft
      void (await import('@/lib/librarySync')).pushLibrarySync(entry.slug, getRepo());
    }
    return NextResponse.json({ ok: true, entry });
```

- [ ] **Step 7: Verify type-check + tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/librarySync.test.ts`
Expected: clean; 3 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/librarySync.ts src/lib/librarySync.test.ts src/lib/redis.ts src/app/api/admin/kb/route.ts
git commit -m "feat(admin): instant publish→Library sync push (fail-soft) + sync log"
```

---

### Task 4: Console shell + left nav + section state

**Files:**
- Create: `src/components/admin/AdminConsole.tsx` (shell)
- Create: `src/components/admin/AdminNav.tsx`
- Modify: `src/app/admin/page.tsx` (render `AdminConsole` instead of `AdminClient`)
- Keep (reused by panels in later tasks): `src/components/AdminClient.tsx` helper functions are migrated; once panels exist `AdminClient.tsx` is deleted in Task 8.

**Interfaces:**
- Produces: `AdminConsole` (default-ish client component, no props); `type AdminSection = 'overview' | 'agents' | 'knowledge' | 'activity'`; `AdminNav` props `{ section: AdminSection; onSection: (s: AdminSection) => void; health: 'ok'|'warn'|'down'; version: string }`.
- Consumes: nothing from later tasks (this is the container; panels are added in Tasks 5-9 as placeholders first).

- [ ] **Step 1: Build the shell with placeholder panels**

Create `AdminConsole.tsx` (client). State: `section` (default `'overview'`), `selectedDept` (`DeptId | null`), `paletteOpen` (bool). Layout: `<div style={flex row, height:100%}>` → `<AdminNav .../>` + `<main style={flex:1, overflow:auto}>` switching on `section` to placeholder `<div>` panels (`OverviewPanel`/`AgentsPanel`/`KnowledgePanel`/`ActivityPanel` imported in later tasks; for now inline `<section>{section}</section>`). Read version from `import pkg from '../../../package.json'` or pass via a constant — use `process.env.NEXT_PUBLIC_APP_VERSION` if present, else hardcode read from package.json import (Next allows JSON import). Keyboard: `useEffect` adding a `keydown` listener that opens the palette on `(e.metaKey||e.ctrlKey) && e.key==='k'` and switches sections on `⌘1..⌘4`.

- [ ] **Step 2: Build `AdminNav.tsx`**

Render brand + a health dot (color from `health`), four buttons (Overview/Agents/Knowledge/Activity) calling `onSection`, and a footer with a Sync→Library status line (filled in Task 9), a Sign-out button (POST `/api/admin/logout` then `router.refresh()` — copy the existing logout handler from `AdminClient.tsx`), and `v{version}`. Style with inline styles matching the dark console aesthetic (see the approved mockup `.superpowers/brainstorm/.../admin-shell.html` for reference colors: bg `#0d1117`, active inset border `#1f6feb`, text `#c9d1d9`).

- [ ] **Step 3: Wire into the page**

In `src/app/admin/page.tsx`, replace `import { AdminClient }` with `import { AdminConsole } from '@/components/admin/AdminConsole';` and render `<AdminConsole />` in the authed branch. Leave `AdminLogin` unchanged.

- [ ] **Step 4: Verify (dev server)**

Run: `npm run dev`, log in at `http://localhost:3001/admin`. Expected: left nav with 4 sections; clicking switches the placeholder panel; ⌘1–⌘4 switch sections; ⌘K toggles `paletteOpen` (no overlay yet). `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ src/app/admin/page.tsx
git commit -m "feat(admin): console shell + left nav + section/keyboard state"
```

---

### Task 5: ⌘K command palette

**Files:**
- Create: `src/components/admin/CommandPalette.tsx`
- Create: `src/lib/adminPalette.ts` (pure index builder)
- Test: `src/lib/adminPalette.test.ts`
- Modify: `src/components/admin/AdminConsole.tsx` (mount palette, pass index + handlers)

**Interfaces:**
- Produces: `type PaletteItem = { id: string; label: string; kind: 'section'|'agent'|'kb'|'action'; run: () => void }` is built in the component; the pure part is `buildPaletteIndex(depts: {id:DeptId;name:string}[], kb: {id:string;slug:string;summary:string}[]): Array<{ id:string; label:string; kind:'agent'|'kb' }>` and `filterPalette(items, query)`.
- Consumes: the dashboard agents + KB list fetched by `AdminConsole`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/adminPalette.test.ts
import { describe, it, expect } from 'vitest';
import { buildPaletteIndex, filterPalette } from './adminPalette';

const depts = [{ id: 'fin' as const, name: 'Finance' }, { id: 'cyb' as const, name: 'CyberX' }];
const kb = [{ id: 'fin:1', slug: 'fin-funds', summary: 'Thai funds brief' }];

describe('palette index', () => {
  it('builds agent + kb entries', () => {
    const idx = buildPaletteIndex(depts, kb);
    expect(idx.find((i) => i.kind === 'agent' && i.label.includes('Finance'))).toBeTruthy();
    expect(idx.find((i) => i.kind === 'kb' && i.label.includes('Thai funds'))).toBeTruthy();
  });
  it('filters case-insensitively by label', () => {
    const idx = buildPaletteIndex(depts, kb);
    expect(filterPalette(idx, 'cyber').length).toBe(1);
    expect(filterPalette(idx, '').length).toBe(idx.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/adminPalette.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `adminPalette.ts`**

```typescript
// src/lib/adminPalette.ts
import type { DeptId } from '@/lib/data/departments';

export interface PaletteIndexItem { id: string; label: string; kind: 'agent' | 'kb' }

export function buildPaletteIndex(
  depts: { id: DeptId; name: string }[],
  kb: { id: string; slug: string; summary: string }[],
): PaletteIndexItem[] {
  return [
    ...depts.map((d) => ({ id: `agent:${d.id}`, label: `Agent · ${d.name}`, kind: 'agent' as const })),
    ...kb.map((e) => ({ id: `kb:${e.id}`, label: `Brief · ${e.summary}`, kind: 'kb' as const })),
  ];
}

export function filterPalette(items: PaletteIndexItem[], query: string): PaletteIndexItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.label.toLowerCase().includes(q));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/adminPalette.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Build `CommandPalette.tsx`**

A controlled overlay (`{ open, onClose, items }`) with a text input, arrow-key navigation, and Enter to invoke the selected item's handler. Static section/action items (Overview/Agents/Knowledge/Activity, "Run <dept>") are appended in the component where the handlers (`onSection`, run trigger) are in scope. No external lib — plain `useState`/`useRef`/`onKeyDown`.

- [ ] **Step 6: Mount in shell + verify (dev server)**

Mount `<CommandPalette open={paletteOpen} .../>` in `AdminConsole`. Run `npm run dev`: ⌘K opens overlay, typing filters, Enter navigates/runs, Esc closes. `npx tsc --noEmit` clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/CommandPalette.tsx src/lib/adminPalette.ts src/lib/adminPalette.test.ts src/components/admin/AdminConsole.tsx
git commit -m "feat(admin): ⌘K command palette (agents + briefs + actions)"
```

---

### Task 6: Overview panel (health/cost cockpit)

**Files:**
- Create: `src/components/admin/OverviewPanel.tsx`
- Modify: `src/components/admin/AdminConsole.tsx` (fetch dashboard once, pass down)

**Interfaces:**
- Consumes: `DashboardData` from `GET /api/dashboard` (existing); cost via the ops agent's `cost & budget` artifact already present in the dashboard payload, or the health scorecard. Reuse `parseHighlight`/health badges.
- Produces: `OverviewPanel` props `{ data: DashboardData | null }`.

- [ ] **Step 1: Fetch dashboard in the shell**

In `AdminConsole`, `useEffect` → `fetch('/api/dashboard').then(r=>r.json())` into `data` state; pass to panels. (This single fetch also feeds the palette index and AgentsPanel — fetch once, share.)

- [ ] **Step 2: Build `OverviewPanel.tsx`**

KPI tiles: # agents ok / # warnings / # down (derive from each agent's `status.state` + the ops health scorecard if present), cost MTD (read the ops `cost & budget` table artifact's "spend (MTD)" row), last activity time (max `lastRun`). Below: a compact per-agent health row list. Read-only, inline-styled. No new endpoints.

- [ ] **Step 3: Verify (dev server)**

`npm run dev` → Overview shows tiles + per-agent rows from live `/api/dashboard`. `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/OverviewPanel.tsx src/components/admin/AdminConsole.tsx
git commit -m "feat(admin): Overview panel — health/cost cockpit (reuses /api/dashboard)"
```

---

### Task 7: Agents panel + inspector (run / telemetry / enable-disable / run-with-options)

**Files:**
- Create: `src/components/admin/AgentsPanel.tsx`
- Create: `src/components/admin/AgentInspector.tsx`
- Modify: `src/components/admin/AdminConsole.tsx` (route `selectedDept`)

**Interfaces:**
- Consumes: `DashboardData` (list + telemetry); `POST /api/admin/run` (optional `{ overrides }` body, Task 2); `PATCH /api/admin/agent` (Task 1); disabled state via `GET /api/dashboard` is not present — fetch disabled depts from a tiny addition: extend `OverviewPanel` fetch with `GET /api/admin/agent` list **or** read from the dashboard. To avoid a new GET, include disabled flags in the dashboard payload is out of scope; instead `AgentInspector` calls `PATCH /api/admin/agent` and tracks the toggle optimistically, seeding from a new `GET /api/admin/agent` returning `getDisabledDepts()`.
- Produces: `AgentsPanel` props `{ data; selectedDept; onSelect }`; `AgentInspector` props `{ dept; agent: DashboardAgent; disabled: boolean; onToggleDisabled; onRan }`.

- [ ] **Step 1: Add GET to the agent route**

In `src/app/api/admin/agent/route.ts` add a `GET` (session-gated) returning `{ disabled: await getRepo().getDisabledDepts() }`.

- [ ] **Step 2: Build `AgentsPanel.tsx`**

Left: the 6 agents as rows (name, cadence label from `DEPARTMENTS`, health badge from `status.state`, last-run age). Click sets `selectedDept`. Right: `<AgentInspector/>` for the selected dept.

- [ ] **Step 3: Build `AgentInspector.tsx`**

- Telemetry block: state, last run, cost MTD (from ops cost artifact if dept matches, else "—"), model (from `output.meta.model` if present), incomplete/error flags, "View latest report" (renders `output.markdown` via `Markdown` in a modal/expander — reuse the existing render path from `AdminClient.tsx`).
- "Scheduled runs" toggle → `PATCH /api/admin/agent { dept, disabled }`, optimistic.
- "Run now" → `POST /api/admin/run?dept=<dept>` (no body), shows running state, calls `onRan` to refetch dashboard.
- "Run with options…" → expander with `maxSearches` (number) + `model` (select from the known model ids in `cost.ts` `PRICING` keys) → `POST /api/admin/run?dept=<dept>` with `{ overrides }`.

- [ ] **Step 4: Verify (dev server)**

`npm run dev`: select an agent → inspector shows telemetry; toggle disables/enables (confirm via the returned JSON / re-fetch); Run now triggers (will error locally without Redis/keys — acceptable, verify the request fires and UI states change). `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/AgentsPanel.tsx src/components/admin/AgentInspector.tsx src/components/admin/AdminConsole.tsx src/app/api/admin/agent/route.ts
git commit -m "feat(admin): Agents panel + inspector (run/telemetry/enable-disable/run-with-options)"
```

---

### Task 8: Knowledge panel (curation + review-read) — migrate & retire KbManager

**Files:**
- Create: `src/components/admin/KnowledgePanel.tsx`
- Modify: `src/components/admin/AdminConsole.tsx`
- Delete: `src/components/AdminClient.tsx` and `src/components/KbManager.tsx` (functionality migrated into the console; confirm no other importers via `grep -rn "AdminClient\|KbManager" src/`)

**Interfaces:**
- Consumes: `GET/PATCH/DELETE /api/admin/kb` (existing, Task 3-extended for publish push); `Markdown` + `ArtifactRenderer` for review-read.
- Produces: `KnowledgePanel` (no props; self-fetches).

- [ ] **Step 1: Build `KnowledgePanel.tsx`**

Port `KbManager.tsx` logic (status filter, list, publish/archive/restore/pin/delete, tags/category edit via PATCH). Add a **review-read pane**: on selecting an entry, render its `markdown` via `Markdown` + its `artifacts` via `ArtifactRenderer` (import from `@/components/charts`). Publish button hits the existing PATCH `{ id, status: 'published' }` (which now triggers the Library push from Task 3).

- [ ] **Step 2: Wire into shell + delete old components**

Render `<KnowledgePanel/>` for the `knowledge` section. Delete `AdminClient.tsx` + `KbManager.tsx`; migrate any still-needed export helpers (`downloadBlob`, `csvCell`, …) into `KnowledgePanel`/`AgentInspector` or a small `src/components/admin/exporters.ts`. Run `grep -rn "AdminClient\|KbManager" src/` → expect no remaining imports.

- [ ] **Step 3: Verify (dev server + tests)**

`npm run dev`: Knowledge section lists drafts, review-read renders markdown + charts safely, publish flips status. `npx tsc --noEmit && npm test && npm run lint` all clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/ src/app/admin/page.tsx
git rm src/components/AdminClient.tsx src/components/KbManager.tsx
git commit -m "feat(admin): Knowledge panel (curation + safe review-read); retire AdminClient/KbManager"
```

---

### Task 9: Activity panel (run feed + sync log)

**Files:**
- Create: `src/components/admin/ActivityPanel.tsx`
- Create: `src/app/api/admin/synclog/route.ts` (GET, session-gated → `repo.getSyncLog()`)
- Modify: `src/components/admin/AdminNav.tsx` (footer Sync→Library status from latest synclog)

**Interfaces:**
- Consumes: `GET /api/feed` (existing) + new `GET /api/admin/synclog` (`{ log: SyncLogEntry[] }`).
- Produces: `ActivityPanel` (self-fetches both).

- [ ] **Step 1: Create the synclog GET route**

```typescript
// src/app/api/admin/synclog/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';
import { getRepo } from '@/lib/redis';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  if (!verifySession(req.cookies.get(ADMIN_COOKIE)?.value)) return new NextResponse('unauthorized', { status: 401 });
  return NextResponse.json({ log: await getRepo().getSyncLog() });
}
```

- [ ] **Step 2: Build `ActivityPanel.tsx`**

Two columns: run feed (`GET /api/feed`) and the sync log (`GET /api/admin/synclog`) — each row: time, dept/slug, ok/fail badge, detail.

- [ ] **Step 3: Footer status in AdminNav**

`AdminNav` fetches `GET /api/admin/synclog`, shows "Sync → Library: ✓ <time>" or "⚠ <detail>" from `log[0]`.

- [ ] **Step 4: Verify (dev server)**

`npm run dev`: Activity shows feed + sync-log; footer reflects latest push. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ActivityPanel.tsx src/app/api/admin/synclog/route.ts src/components/admin/AdminNav.tsx
git commit -m "feat(admin): Activity panel (run feed + Library sync log) + nav sync status"
```

---

### Task 10: Version bump, docs, quality gates, deploy

**Files:**
- Modify: `package.json` (`1.9.0` → `1.10.0`)
- Modify: `CHANGELOG.md`, `CLAUDE.md` (current-version line + new env vars)
- Modify: `.env.example` if present (add `LIBRARY_SYNC_URL`, `LIBRARY_SYNC_SECRET`)

- [ ] **Step 1: Bump version + changelog + docs**

Set `package.json` version `1.10.0`. Add a `## [1.10.0] — 2026-06-17` CHANGELOG entry (console redesign; enable/disable; run-with-options; instant Library sync push; new env). Update `CLAUDE.md` current-version line and Env Vars list (`LIBRARY_SYNC_URL`, `LIBRARY_SYNC_SECRET`).

- [ ] **Step 2: Full quality gates**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all clean; tests green.

- [ ] **Step 3: Manual smoke (dev server)**

`npm run dev`, log in, click through all four sections, ⌘K, run an agent, toggle disable, open a draft + publish (confirm a synclog row appears). Screenshot each section.

- [ ] **Step 4: Commit + deploy (base-deployment)**

Use the base-deployment workflow (Phase 6 stops for explicit push approval):
```bash
git add package.json CHANGELOG.md CLAUDE.md .env.example
git commit -m "release: v1.10.0 — /admin orchestrator console + instant Library sync"
```
Then push to `main` only on user confirmation (auto-deploys to Vercel). Set `LIBRARY_SYNC_URL` + `LIBRARY_SYNC_SECRET` in Vercel env (= the Library's `SYNC_SECRET`) for the push to fire in prod.

---

## Self-Review

**Spec coverage:** shell B + ⌘K (Tasks 4-5) ✓ · Overview (6) ✓ · Agents+inspector with all 4 controls (1,2,7) ✓ · Knowledge curation + review-read (8) ✓ · Activity + sync log (9) ✓ · instant publish→Library sync (3) ✓ · enable/disable feasible-substitute (1) ✓ · nav Overview/Agents/Knowledge/Activity + footer (4,9) ✓ · env vars (3,10) ✓. **Deviation:** run-with-options narrowed to `maxSearches`+`model` (theme deferred) — flagged in Task 2.

**Placeholder scan:** no TBD/TODO; backend steps carry full code + exact commands; UI steps carry exact files/props/interfaces with dev-server verification (repo has no visual unit tests — convention).

**Type consistency:** `RunOverrides { maxSearches?; model? }` used identically in types.ts, claude.ts, runner.ts, route; `SyncLogEntry` shared between `librarySync.ts` and redis methods; `repo.isAgentDisabled/getDisabledDepts/setAgentDisabled` names consistent across Task 1 and Task 7; `buildPaletteIndex`/`filterPalette` names match between lib and test.
