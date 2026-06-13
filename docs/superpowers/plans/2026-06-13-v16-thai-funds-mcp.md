# v1.6 Thai-fund MCP + Finance Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Finance agent's `web_search`-only fund discovery with a dedicated remote MCP server wrapping the Thai SEC Open Data API (+ keyless market/FX tools), consumed via the Anthropic MCP connector.

**Architecture:** Two repos. **Phase 1** builds a standalone `thai-funds-mcp` (Next.js + `mcp-handler`, Streamable HTTP, bearer auth) exposing 5 tools, each returning `sourceUrl` + `asOf` for citations. **Phase 2** extends `company.nanoteofficial.me`'s `claude.ts` with a beta MCP-connector streaming path and points `finance.ts` (now Sonnet, no web_search) at the server. Provenance stays `'web'` (cited to SEC).

**Tech Stack:** TypeScript, Next.js 16 (App Router), `mcp-handler`, `zod`, Vitest; `@anthropic-ai/sdk` beta Messages API (`betas: ['mcp-client-2025-11-20']`).

**Spec:** `docs/superpowers/specs/2026-06-13-v16-thai-funds-mcp-design.md`

---

## ⚠️ Phasing & manual gates

- **Phase 1** is built in a NEW repo at `/project/src/thai-funds-mcp` (its own git repo, own Vercel project). It produces working, independently testable software.
- **MANUAL GATE A** (between phases, done by the human): register the SEC Open Data key at `secopendata.sec.or.th`; reconcile the SEC adapter's assumed field shapes against the live API (Task 4 fixtures are provisional); create the `thai-funds-mcp` Vercel project; set `SEC_API_KEY` + `MCP_AUTH_TOKEN`; deploy; verify all 5 tools via the MCP inspector.
- **Phase 2** integrates the (now live) server into the company app.
- **MANUAL GATE B**: set `THAI_FUNDS_MCP_URL` + `THAI_FUNDS_MCP_TOKEN` on the company Vercel project; trigger a Finance run; verify the dashboard.

The SEC API's exact paths/field names are unconfirmed (the portal blocks anonymous fetches). Task 4 codes an **explicit assumed shape** with fixtures; if the live API differs, adjust the shape interface **and** its fixture together — the tool *contract* (Task 5) does not change.

---

## File Structure

**Phase 1 — `/project/src/thai-funds-mcp/` (new repo):**
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `next.config.ts`, `README.md`
- `src/sources/stooq.ts` (+ `.test.ts`) — index quotes from stooq CSV
- `src/sources/frankfurter.ts` (+ `.test.ts`) — FX from Frankfurter JSON
- `src/sources/sec.ts` (+ `.test.ts`) — SEC factsheet/nav/search select+shape+fetch
- `src/tools.ts` — the 5 tool handlers (pure-ish, call sources)
- `app/api/mcp/route.ts` — `mcp-handler` wiring + `withMcpAuth`

**Phase 2 — `/project/src/company.nanoteofficial.me/` (existing repo):**
- `src/lib/claude.ts` — add `mcpServers` opt + beta streaming path
- `src/lib/claude.mcp.test.ts` (new) — MCP-path unit test
- `src/lib/agents/finance.ts` — wire MCP, Sonnet, drop web_search
- `src/lib/agents/finance.test.ts` or `finance.artifacts.test.ts` — update call-shape
- `package.json`, `CLAUDE.md`

---

# PHASE 1 — thai-funds-mcp server

## Task 1: Scaffold the repo

**Files:**
- Create: `/project/src/thai-funds-mcp/package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `next.config.ts`, `README.md`

- [ ] **Step 1: Create the project directory and init git**

```bash
mkdir -p /project/src/thai-funds-mcp
cd /project/src/thai-funds-mcp
git init
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "thai-funds-mcp",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "mcp-handler": "^1.0.0",
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', globals: true },
});
```

- [ ] **Step 5: Write `next.config.ts`**

```ts
import type { NextConfig } from 'next';
const nextConfig: NextConfig = {};
export default nextConfig;
```

- [ ] **Step 6: Write `.gitignore`**

```
node_modules
.next
.env*.local
.vercel
*.tsbuildinfo
next-env.d.ts
```

- [ ] **Step 7: Write `README.md` skeleton**

```markdown
# thai-funds-mcp

Remote MCP server exposing Thai SEC Open Data (mutual funds) + market/FX context.
Built with Next.js + `mcp-handler` (Streamable HTTP). Deployed on Vercel.

## Tools
- `search_thai_funds` · `thai_fund_factsheet` · `thai_fund_nav` · `market_index` · `fx_rate`

Every tool returns `sourceUrl` + `asOf` so consumers can cite the data.

## Env vars
- `SEC_API_KEY` — SEC Open Data subscription key (register at secopendata.sec.or.th). Sent as `Ocp-Apim-Subscription-Key`.
- `MCP_AUTH_TOKEN` — bearer token clients must present.

## Local dev
`npm i && npm run dev` → server at http://localhost:3000/api/mcp
Test with the MCP inspector: `npx @modelcontextprotocol/inspector` → Streamable HTTP → http://localhost:3000/api/mcp

## Tests
`npm test` (vitest; pure select/shape units against fixtures, no live network).
```

- [ ] **Step 8: Install and commit**

```bash
cd /project/src/thai-funds-mcp
npm install
git add -A
git commit -m "chore: scaffold thai-funds-mcp (Next.js + mcp-handler)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Expected: `npm install` succeeds; commit created.

---

## Task 2: stooq market-index adapter

**Files:**
- Create: `/project/src/thai-funds-mcp/src/sources/stooq.ts`
- Test: `/project/src/thai-funds-mcp/src/sources/stooq.test.ts`

stooq's keyless quote CSV: `https://stooq.com/q/l/?s=<symbol>&f=sd2t2ohlcv&h&e=csv` returns a header row + one data row, e.g.:
`Symbol,Date,Time,Open,High,Low,Close,Volume`
`^SPX,2026-06-12,22:15:00,5400,5450,5390,5432.1,0`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { shapeStooqQuote } from './stooq';

describe('shapeStooqQuote', () => {
  it('parses a stooq CSV quote into a typed shape with sourceUrl + asOf', () => {
    const csv = '﻿Symbol,Date,Time,Open,High,Low,Close,Volume\n^SPX,2026-06-12,22:15:00,5400,5450,5390,5432.1,0\n';
    const q = shapeStooqQuote('^SPX', csv);
    expect(q).toEqual({
      symbol: '^SPX',
      price: 5432.1,
      changePct: expect.any(Number),
      asOf: '2026-06-12',
      sourceUrl: 'https://stooq.com/q/?s=^SPX',
    });
    // changePct = (close-open)/open*100
    expect(q!.changePct).toBeCloseTo(((5432.1 - 5400) / 5400) * 100, 4);
  });

  it('returns null on N/D or malformed rows', () => {
    expect(shapeStooqQuote('^BAD', 'Symbol,Date,Time,Open,High,Low,Close,Volume\n^BAD,N/D,N/D,N/D,N/D,N/D,N/D,N/D\n')).toBeNull();
    expect(shapeStooqQuote('^X', 'garbage')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /project/src/thai-funds-mcp && npx vitest run src/sources/stooq.test.ts`
Expected: FAIL — `shapeStooqQuote` not exported.

- [ ] **Step 3: Implement `stooq.ts`**

```ts
export interface IndexQuote {
  symbol: string; price: number; changePct: number; asOf: string; sourceUrl: string;
}

const num = (s: string): number | null => {
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Parse stooq's `f=sd2t2ohlcv` CSV (header + one data row) into IndexQuote. */
export function shapeStooqQuote(symbol: string, csv: string): IndexQuote | null {
  const lines = csv.replace(/^﻿/, '').trim().split('\n');
  if (lines.length < 2) return null;
  const cols = lines[1].split(',');
  if (cols.length < 7) return null;
  const [, date, , openS, , , closeS] = cols;
  const open = num(openS);
  const close = num(closeS);
  if (open === null || close === null || open === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    symbol,
    price: close,
    changePct: ((close - open) / open) * 100,
    asOf: date,
    sourceUrl: `https://stooq.com/q/?s=${symbol}`,
  };
}

const QUOTE_URL = (symbol: string) =>
  `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`;

/** Fetch a single index quote; swallow errors → null. */
export async function fetchIndexQuote(symbol: string): Promise<IndexQuote | null> {
  try {
    const res = await fetch(QUOTE_URL(symbol), { headers: { 'User-Agent': 'thai-funds-mcp' } });
    if (!res.ok) return null;
    return shapeStooqQuote(symbol, await res.text());
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/sources/stooq.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sources/stooq.ts src/sources/stooq.test.ts
git commit -m "feat(sources): stooq index-quote adapter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Frankfurter FX adapter

**Files:**
- Create: `/project/src/thai-funds-mcp/src/sources/frankfurter.ts`
- Test: `/project/src/thai-funds-mcp/src/sources/frankfurter.test.ts`

Frankfurter `https://api.frankfurter.app/latest?from=USD&to=THB` returns `{ "amount":1, "base":"USD", "date":"2026-06-12", "rates":{ "THB": 36.5 } }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { shapeFxRate } from './frankfurter';

describe('shapeFxRate', () => {
  it('extracts the quote rate + date + sourceUrl', () => {
    const raw = { amount: 1, base: 'USD', date: '2026-06-12', rates: { THB: 36.5 } };
    expect(shapeFxRate('USD', 'THB', raw)).toEqual({
      base: 'USD', quote: 'THB', rate: 36.5, asOf: '2026-06-12',
      sourceUrl: 'https://api.frankfurter.app/latest?from=USD&to=THB',
    });
  });

  it('returns null when the quote currency is missing', () => {
    expect(shapeFxRate('USD', 'THB', { amount: 1, base: 'USD', date: '2026-06-12', rates: {} })).toBeNull();
    expect(shapeFxRate('USD', 'THB', null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sources/frankfurter.test.ts`
Expected: FAIL — `shapeFxRate` not exported.

- [ ] **Step 3: Implement `frankfurter.ts`**

```ts
export interface FxRate {
  base: string; quote: string; rate: number; asOf: string; sourceUrl: string;
}

interface FrankfurterRaw { base?: string; date?: string; rates?: Record<string, number> }

const url = (base: string, quote: string) =>
  `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(quote)}`;

export function shapeFxRate(base: string, quote: string, raw: unknown): FxRate | null {
  const r = raw as FrankfurterRaw | null;
  const rate = r?.rates?.[quote];
  if (typeof rate !== 'number' || !Number.isFinite(rate) || !r?.date) return null;
  return { base, quote, rate, asOf: r.date, sourceUrl: url(base, quote) };
}

export async function fetchFxRate(base: string, quote: string): Promise<FxRate | null> {
  try {
    const res = await fetch(url(base, quote));
    if (!res.ok) return null;
    return shapeFxRate(base, quote, await res.json());
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/sources/frankfurter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sources/frankfurter.ts src/sources/frankfurter.test.ts
git commit -m "feat(sources): frankfurter FX-rate adapter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: SEC fund adapter (PROVISIONAL shapes — reconcile at Gate A)

**Files:**
- Create: `/project/src/thai-funds-mcp/src/sources/sec.ts`
- Test: `/project/src/thai-funds-mcp/src/sources/sec.test.ts`

> **PROVISIONAL:** the SEC API field names below are an assumed shape (the portal blocks anonymous inspection). The `select/shape` functions and their fixtures encode this assumption. At Gate A, with the live key, reconcile: if real field names differ, change the `*Raw` interface **and** the fixture in the test together; the exported shapes (`FundSummary`/`FundFactsheet`/`FundNav`) and Task 5's tool contract stay fixed.

Assumed SEC base: `https://api.sec.or.th/`. Auth header: `Ocp-Apim-Subscription-Key: <SEC_API_KEY>`. Public citable page per fund: `https://www.sec.or.th/PublishingImages/...` is not stable, so cite the SEC fund-info page `https://market.sec.or.th/public/idisc/en/Product/Fund/<proj_id>` (reconcile the exact public URL at Gate A; keep the `secFundUrl()` helper as the single place to change it).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { shapeFundSummary, shapeFactsheet, shapeNav, secFundUrl } from './sec';

describe('sec shapers', () => {
  it('shapeFundSummary maps a fund-list row', () => {
    const raw = { proj_id: 'M0123_2555', proj_name_en: 'SCB US Index', unique_id: 'SCBS&P500', regis_date: '2012-01-01' };
    expect(shapeFundSummary(raw, 'SCBAM', 'feeder', 'none')).toEqual({
      proj_id: 'M0123_2555', name: 'SCB US Index', amc: 'SCBAM',
      category: 'feeder', taxType: 'none', sourceUrl: secFundUrl('M0123_2555'),
    });
  });

  it('shapeFactsheet maps fees/aum/return into the typed shape', () => {
    const raw = {
      proj_id: 'M0123_2555', proj_name_en: 'SCB US Index', amc_name_en: 'SCBAM',
      total_expense_ratio: 0.45, net_asset: 12345.6, master_fund_name: 'iShares S&P 500',
      return_1y: 18.2, fx_hedge: 'N', as_of_date: '2026-06-12',
    };
    const f = shapeFactsheet(raw, 'none');
    expect(f).toEqual({
      proj_id: 'M0123_2555', name: 'SCB US Index', amc: 'SCBAM',
      ter: 0.45, aum: 12345.6, masterFund: 'iShares S&P 500',
      return1y: 18.2, hedged: false, taxType: 'none',
      asOf: '2026-06-12', sourceUrl: secFundUrl('M0123_2555'),
    });
  });

  it('shapeNav maps the latest daily nav', () => {
    const raw = { proj_id: 'M0123_2555', nav: 12.3456, nav_date: '2026-06-12' };
    expect(shapeNav(raw)).toEqual({
      proj_id: 'M0123_2555', nav: 12.3456, date: '2026-06-12', sourceUrl: secFundUrl('M0123_2555'),
    });
  });

  it('returns null on missing required numbers', () => {
    expect(shapeFactsheet({ proj_id: 'X' }, 'none')).toBeNull();
    expect(shapeNav({ proj_id: 'X', nav: 'n/a', nav_date: '2026-06-12' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sources/sec.test.ts`
Expected: FAIL — module not found / exports missing.

- [ ] **Step 3: Implement `sec.ts`**

```ts
export type TaxType = 'none' | 'ssf' | 'rmf' | 'thaiesg';

export interface FundSummary {
  proj_id: string; name: string; amc: string; category: string; taxType: TaxType; sourceUrl: string;
}
export interface FundFactsheet {
  proj_id: string; name: string; amc: string; ter: number; aum: number;
  masterFund: string; return1y: number; hedged: boolean; taxType: TaxType;
  asOf: string; sourceUrl: string;
}
export interface FundNav {
  proj_id: string; nav: number; date: string; sourceUrl: string;
}

// Single place to change the public citable URL once confirmed at Gate A.
export const secFundUrl = (projId: string) =>
  `https://market.sec.or.th/public/idisc/en/Product/Fund/${projId}`;

const SEC_BASE = 'https://api.sec.or.th';
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

// --- PROVISIONAL raw shapes (reconcile field names at Gate A) ---
interface FundListRaw { proj_id?: string; proj_name_en?: string; unique_id?: string; regis_date?: string }
interface FactsheetRaw {
  proj_id?: string; proj_name_en?: string; amc_name_en?: string;
  total_expense_ratio?: number; net_asset?: number; master_fund_name?: string;
  return_1y?: number; fx_hedge?: string; as_of_date?: string;
}
interface NavRaw { proj_id?: string; nav?: unknown; nav_date?: string }

export function shapeFundSummary(raw: FundListRaw, amc: string, category: string, taxType: TaxType): FundSummary | null {
  if (!raw?.proj_id || !raw.proj_name_en) return null;
  return { proj_id: raw.proj_id, name: raw.proj_name_en, amc, category, taxType, sourceUrl: secFundUrl(raw.proj_id) };
}

export function shapeFactsheet(raw: FactsheetRaw, taxType: TaxType): FundFactsheet | null {
  const ter = num(raw?.total_expense_ratio);
  const aum = num(raw?.net_asset);
  const r1y = num(raw?.return_1y);
  if (!raw?.proj_id || ter === null || aum === null || r1y === null) return null;
  return {
    proj_id: raw.proj_id, name: raw.proj_name_en ?? raw.proj_id, amc: raw.amc_name_en ?? '',
    ter, aum, masterFund: raw.master_fund_name ?? '', return1y: r1y,
    hedged: (raw.fx_hedge ?? '').toUpperCase() === 'Y', taxType,
    asOf: raw.as_of_date ?? '', sourceUrl: secFundUrl(raw.proj_id),
  };
}

export function shapeNav(raw: NavRaw): FundNav | null {
  const nav = num(raw?.nav);
  if (!raw?.proj_id || nav === null || !raw.nav_date) return null;
  return { proj_id: raw.proj_id, nav, date: raw.nav_date, sourceUrl: secFundUrl(raw.proj_id) };
}

async function secGet(path: string): Promise<unknown | null> {
  const key = process.env.SEC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${SEC_BASE}${path}`, { headers: { 'Ocp-Apim-Subscription-Key': key } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Fetchers — PROVISIONAL endpoint paths; reconcile at Gate A. Each swallows errors → []/null.
export async function fetchFactsheet(projId: string, taxType: TaxType = 'none'): Promise<FundFactsheet | null> {
  const raw = await secGet(`/FundFactsheet/fund/${encodeURIComponent(projId)}/FundFactsheet`);
  return raw ? shapeFactsheet(raw as FactsheetRaw, taxType) : null;
}
export async function fetchNav(projId: string, date?: string): Promise<FundNav | null> {
  const suffix = date ? `/dailynav/${date}` : `/dailynav`;
  const raw = await secGet(`/FundDailyInfo/${encodeURIComponent(projId)}${suffix}`);
  const row = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  return row ? shapeNav(row as NavRaw) : null;
}
export async function searchFunds(query: string, taxType: TaxType = 'none', limit = 8): Promise<FundSummary[]> {
  const raw = await secGet(`/FundFactsheet/fund`);
  if (!Array.isArray(raw)) return [];
  const q = query.toLowerCase();
  const out: FundSummary[] = [];
  for (const row of raw as FundListRaw[]) {
    if (!row?.proj_name_en || !row.proj_name_en.toLowerCase().includes(q)) continue;
    const s = shapeFundSummary(row, '', 'fund', taxType);
    if (s) out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/sources/sec.test.ts`
Expected: PASS (shapers tested against fixtures; fetchers exercised live only at Gate A).

- [ ] **Step 5: Commit**

```bash
git add src/sources/sec.ts src/sources/sec.test.ts
git commit -m "feat(sources): SEC fund adapter (provisional shapes, reconciled at deploy)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: MCP route — 5 tools + bearer auth

**Files:**
- Create: `/project/src/thai-funds-mcp/app/api/mcp/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { z } from 'zod';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { fetchIndexQuote } from '@/sources/stooq';
import { fetchFxRate } from '@/sources/frankfurter';
import { fetchFactsheet, fetchNav, searchFunds, type TaxType } from '@/sources/sec';

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });
const taxEnum = z.enum(['none', 'ssf', 'rmf', 'thaiesg']);

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'search_thai_funds',
      'Search Thai mutual funds by name/policy keyword (e.g. "S&P 500", "semiconductor"). Returns matching funds with proj_id and a citable sourceUrl.',
      { query: z.string(), amc: z.string().optional(), taxType: taxEnum.optional(), limit: z.number().int().min(1).max(20).optional() },
      async ({ query, taxType, limit }) => json({ funds: await searchFunds(query, (taxType ?? 'none') as TaxType, limit ?? 8) }),
    );
    server.tool(
      'thai_fund_factsheet',
      'Get a Thai fund factsheet by proj_id: TER, AUM, master fund, 1-year return, hedging, tax type, with sourceUrl + asOf for citation.',
      { proj_id: z.string(), taxType: taxEnum.optional() },
      async ({ proj_id, taxType }) => json(await fetchFactsheet(proj_id, (taxType ?? 'none') as TaxType)),
    );
    server.tool(
      'thai_fund_nav',
      'Get the latest (or a given date) daily NAV for a Thai fund by proj_id, with sourceUrl.',
      { proj_id: z.string(), date: z.string().optional() },
      async ({ proj_id, date }) => json(await fetchNav(proj_id, date)),
    );
    server.tool(
      'market_index',
      'Get a market index quote (e.g. ^spx S&P 500, ^sox semiconductors, ^set Thailand) with price, % change, asOf, sourceUrl.',
      { symbol: z.string() },
      async ({ symbol }) => json(await fetchIndexQuote(symbol)),
    );
    server.tool(
      'fx_rate',
      'Get a foreign-exchange rate (e.g. base USD, quote THB) with rate, asOf, sourceUrl.',
      { base: z.string(), quote: z.string() },
      async ({ base, quote }) => json(await fetchFxRate(base, quote)),
    );
  },
  {},
  { basePath: '/api' },
);

// Bearer-token auth: the Anthropic connector passes MCP_AUTH_TOKEN as authorization_token.
const verifyToken = async (_req: Request, bearer?: string): Promise<AuthInfo | undefined> => {
  const expected = process.env.MCP_AUTH_TOKEN;
  if (!expected || !bearer || bearer !== expected) return undefined;
  return { token: bearer, scopes: ['read:funds'], clientId: 'company-finance-agent' };
};

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
```

- [ ] **Step 2: Type-check + build**

Run: `cd /project/src/thai-funds-mcp && npx tsc --noEmit && npm run build`
Expected: clean. If `mcp-handler`'s `server.tool` signature differs in the installed version, adjust the call to match its types (keep tool names, descriptions, zod schemas, and handler bodies identical).

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: stooq + frankfurter + sec shaper tests all pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/mcp/route.ts
git commit -m "feat(mcp): 5 tools (funds + market + fx) with bearer auth

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Finalize README + create GitHub repo

**Files:**
- Modify: `/project/src/thai-funds-mcp/README.md` (already drafted in Task 1 — verify it documents all 5 tools, both env vars, the inspector flow; no code change needed if accurate)

- [ ] **Step 1: Create the GitHub repo and push**

```bash
cd /project/src/thai-funds-mcp
gh repo create khantee8/thai-funds-mcp --private --source=. --remote=origin
git branch -M main
git push -u origin main
```

Expected: repo created, `main` pushed.

---

## ⏸️ MANUAL GATE A (human steps — not a coding task)

The implementer STOPS here and reports that Gate A is required. The human:
1. Registers for the SEC Open Data key at `secopendata.sec.or.th`.
2. **Reconciles Task 4's provisional shapes** against the live API (adjust `*Raw` interfaces + fixtures together if field names differ; confirm `secFundUrl`).
3. Creates the `thai-funds-mcp` Vercel project (import the GitHub repo); sets `SEC_API_KEY` and `MCP_AUTH_TOKEN`; deploys.
4. Verifies via `npx @modelcontextprotocol/inspector` (Streamable HTTP, the deployed `/api/mcp` URL, bearer = `MCP_AUTH_TOKEN`): all 5 tools list and each returns data + `sourceUrl` + `asOf`.

Only once the server is live + verified does Phase 2 integration runtime work; Phase 2 *code* (Tasks 7-9) can be written before the gate clears.

---

# PHASE 2 — company.nanoteofficial.me integration

Work from `/project/src/company.nanoteofficial.me`.

## Task 7: `claude.ts` — MCP-connector streaming path

**Files:**
- Modify: `src/lib/claude.ts`
- Test: `src/lib/claude.mcp.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Anthropic SDK: capture the params passed to beta.messages.stream.
const betaStream = vi.fn();
const baseStream = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { stream: baseStream };
    beta = { messages: { stream: betaStream } };
  },
}));

import { completeRaw } from './claude';

const finalMessage = (msg: unknown) => ({ finalMessage: async () => msg });
const text = (t: string, stop = 'end_turn') => ({
  content: [{ type: 'text', text: t }], stop_reason: stop, usage: { input_tokens: 1, output_tokens: 2 },
});

beforeEach(() => { betaStream.mockReset(); baseStream.mockReset(); });

describe('completeRaw with mcpServers', () => {
  it('routes through beta.messages.stream with the connector beta + mcp_servers + mcp_toolset', async () => {
    betaStream.mockReturnValueOnce(finalMessage(text('hi')));
    const res = await completeRaw({
      system: 's', prompt: 'p', model: 'claude-sonnet-4-6',
      mcpServers: [{ url: 'https://x/api/mcp', name: 'thai-funds', token: 'secret' }],
    });
    expect(res.text).toBe('hi');
    expect(baseStream).not.toHaveBeenCalled();
    const params = betaStream.mock.calls[0][0];
    expect(params.betas).toContain('mcp-client-2025-11-20');
    expect(params.mcp_servers).toEqual([
      { type: 'url', url: 'https://x/api/mcp', name: 'thai-funds', authorization_token: 'secret' },
    ]);
    expect(params.tools).toEqual([{ type: 'mcp_toolset', mcp_server_name: 'thai-funds' }]);
  });

  it('resumes a pause_turn in the beta path', async () => {
    betaStream
      .mockReturnValueOnce(finalMessage(text('part1', 'pause_turn')))
      .mockReturnValueOnce(finalMessage(text('part2', 'end_turn')));
    const res = await completeRaw({
      system: 's', prompt: 'p',
      mcpServers: [{ url: 'https://x/api/mcp', name: 'tf' }],
    });
    expect(betaStream).toHaveBeenCalledTimes(2);
    expect(res.text).toBe('part1\npart2');
  });

  it('uses the plain (non-beta) path when no mcpServers', async () => {
    baseStream.mockReturnValueOnce(finalMessage(text('plain')));
    const res = await completeRaw({ system: 's', prompt: 'p' });
    expect(res.text).toBe('plain');
    expect(betaStream).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/claude.mcp.test.ts`
Expected: FAIL — `mcpServers` not handled (beta path not implemented).

- [ ] **Step 3: Implement the MCP path in `claude.ts`**

Add the `mcpServers` field to `CompleteOpts` (after `maxSearches?: number;`):

```ts
  /** Remote MCP servers for the Anthropic MCP connector. When set, the request
   *  routes through the beta Messages API and web_search is ignored. */
  mcpServers?: { url: string; name: string; token?: string }[];
```

Replace the body of `streamOnce` and `completeRaw` region (lines ~41-99) with:

```ts
const MCP_BETA = 'mcp-client-2025-11-20';

/** One streamed request (plain or beta) with transient-error retry (429/5xx). */
async function streamOnce(
  params: Anthropic.Messages.MessageStreamParams,
  beta = false,
): Promise<Anthropic.Messages.Message> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const stream = beta
        ? client().beta.messages.stream({ ...(params as object), betas: [MCP_BETA] } as never)
        : client().messages.stream(params);
      return (await stream.finalMessage()) as Anthropic.Messages.Message;
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (status && status < 500 && status !== 429) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}

export async function completeRaw(opts: CompleteOpts): Promise<CompleteResult> {
  const { system, prompt, model = MODEL, maxTokens = 1500, webSearch = false, maxSearches = 5, mcpServers } = opts;
  const useMcp = !!mcpServers && mcpServers.length > 0;

  // MCP connector and web_search are mutually exclusive in this wrapper; MCP wins.
  const tools: unknown[] | undefined = useMcp
    ? mcpServers!.map((s) => ({ type: 'mcp_toolset', mcp_server_name: s.name }))
    : webSearch
      ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches, allowed_callers: ['direct'] }]
      : undefined;

  const mcp_servers = useMcp
    ? mcpServers!.map((s) => ({ type: 'url', url: s.url, name: s.name, ...(s.token ? { authorization_token: s.token } : {}) }))
    : undefined;

  const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: prompt }];
  const texts: string[] = [];
  let stopReason: string | null = null;
  let input = 0;
  let output = 0;

  for (let resume = 0; resume <= MAX_PAUSE_RESUMES; resume++) {
    const msg = await streamOnce(
      {
        model,
        max_tokens: maxTokens,
        system,
        messages,
        ...(tools ? { tools } : {}),
        ...(mcp_servers ? { mcp_servers } : {}),
      } as unknown as Anthropic.Messages.MessageStreamParams,
      useMcp,
    );
    texts.push(textOf(msg));
    input += msg.usage.input_tokens;
    output += msg.usage.output_tokens;
    stopReason = msg.stop_reason;
    if (msg.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: msg.content });
  }

  return { text: texts.filter(Boolean).join('\n').trim(), stopReason, usage: { input, output } };
}
```

Keep `MAX_PAUSE_RESUMES`, `textOf`, `complete()` unchanged.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/claude.mcp.test.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/lib/claude.ts src/lib/claude.mcp.test.ts
git commit -m "feat(claude): MCP-connector streaming path (beta mcp-client-2025-11-20)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `finance.ts` — wire MCP, Sonnet, drop web_search

**Files:**
- Modify: `src/lib/agents/finance.ts` (the `run()` function, ~lines 76-108)
- Test: `src/lib/agents/finance.run.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const completeRaw = vi.fn();
vi.mock('@/lib/claude', () => ({ completeRaw }));

import { run } from './finance';

const FINDINGS = '```json findings\n{"theme":"t","funds":[{"name":"SCB US","amc":"SCBAM","ter":0.4,"aum":1000,"masterFund":"iShares","return1y":18,"hedged":false,"taxType":"none","citation":{"url":"https://market.sec.or.th/x","title":"SEC","date":"2026-06-12"}}]}\n```\n## Highlight\nok\n<!-- ===EN=== -->\nok\n## Flags\nNone.\n---\nbody';

beforeEach(() => {
  completeRaw.mockReset();
  process.env.THAI_FUNDS_MCP_URL = 'https://tf/api/mcp';
  process.env.THAI_FUNDS_MCP_TOKEN = 'tok';
});

describe('finance.run with MCP', () => {
  it('calls completeRaw on Sonnet, with mcpServers, and no webSearch', async () => {
    completeRaw.mockResolvedValueOnce({ text: FINDINGS, stopReason: 'end_turn', usage: { input: 1, output: 1 } });
    const res = await run({ history: [], digest: [], todayPeers: {} } as never);
    const opts = completeRaw.mock.calls[0][0];
    expect(opts.model).toBe('claude-sonnet-4-6');
    expect(opts.webSearch).toBeFalsy();
    expect(opts.mcpServers).toEqual([{ url: 'https://tf/api/mcp', name: 'thai-funds', token: 'tok' }]);
    expect(res.provenance).toBe('web');
    expect(res.artifacts.length).toBeGreaterThan(0);
  });

  it('still runs (no MCP wiring) when env unset', async () => {
    delete process.env.THAI_FUNDS_MCP_URL;
    delete process.env.THAI_FUNDS_MCP_TOKEN;
    completeRaw.mockResolvedValueOnce({ text: FINDINGS, stopReason: 'end_turn', usage: { input: 1, output: 1 } });
    const res = await run({ history: [], digest: [], todayPeers: {} } as never);
    const opts = completeRaw.mock.calls[0][0];
    expect(opts.mcpServers).toBeUndefined();
    expect(res.artifacts.length).toBeGreaterThan(0);
  });
});
```

> Note: confirm `AgentContext`'s real field names by reading `finance.ts`'s existing `formatContext(ctx)` usage; if the minimal `{ history, digest, todayPeers }` cast doesn't satisfy `formatContext`, pass the shape that does (read `runner.ts` `formatContext`). The assertions on `completeRaw` opts are the point.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/agents/finance.run.test.ts`
Expected: FAIL — current `run()` calls with `webSearch: true`, no `mcpServers`, default model.

- [ ] **Step 3: Modify `run()` in `finance.ts`**

Add a Sonnet constant near the top of the file (after the imports):

```ts
const FINANCE_MODEL = 'claude-sonnet-4-6';
```

Replace the `completeRaw({...})` call (currently `webSearch: true, maxSearches: 6, maxTokens: 8000`) with:

```ts
  const mcpUrl = process.env.THAI_FUNDS_MCP_URL;
  const mcpToken = process.env.THAI_FUNDS_MCP_TOKEN;
  const mcpServers = mcpUrl
    ? [{ url: mcpUrl, name: 'thai-funds', ...(mcpToken ? { token: mcpToken } : {}) }]
    : undefined;
  const { text: markdown, stopReason } = await completeRaw({
    system: PERSONAS.fin,
    prompt: `${context ? context + '\n\n---\n\n' : ''}ธีมประจำรอบวันนี้: **${label}** (theme: ${theme}).\nใช้เครื่องมือกองทุน (search_thai_funds → thai_fund_factsheet/thai_fund_nav) ดึงข้อมูลกองทุนรวมไทยจริง 3-5 กองในธีมนี้ และใช้ market_index/fx_rate เป็นบริบทเปรียบเทียบ. อ้างอิง sourceUrl + asOf จากผลของเครื่องมือทุกตัวเลข เปิดรายงานด้วยบล็อก \`\`\`json findings ตามสคีมา แล้วเขียนรายงานตามโครงสร้างในบทบาท`,
    model: FINANCE_MODEL,
    mcpServers,
    maxTokens: 8000,
  });
```

The `noCitedFunds` summary string is generalized — change `(การค้นเว็บอาจติด rate limit)` to `(แหล่งข้อมูล SEC/MCP อาจไม่ตอบสนอง)`:

```ts
  const summary = noCitedFunds
    ? `⚠️ ไม่พบกองที่อ้างอิงได้ในธีม ${label} (แหล่งข้อมูล SEC/MCP อาจไม่ตอบสนอง)`
    : `${findings.funds.length} กองในธีม ${label}`;
```

Everything else in `run()` (parse, artifacts, tags, incomplete, provenance, meta) is unchanged.

- [ ] **Step 4: Run to verify it passes + full suite**

Run: `npx vitest run src/lib/agents/finance.run.test.ts`
Expected: PASS.

Run: `npm test`
Expected: all pass. If a pre-existing Finance test asserted `webSearch: true`, update that assertion to the new call shape (MCP/Sonnet, no webSearch).

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add src/lib/agents/finance.ts src/lib/agents/finance.run.test.ts
git commit -m "feat(finance): source funds via Thai-funds MCP on Sonnet (drop web_search)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Version bump + docs + env vars

**Files:**
- Modify: `package.json`, `CLAUDE.md`

- [ ] **Step 1: Bump the version**

Run: `npm version 1.6.0 --no-git-tag-version`
Expected: `package.json` → `1.6.0`.

- [ ] **Step 2: Update `CLAUDE.md`**

(a) Change `**Current version: 1.5.2**` → `**Current version: 1.6.0**`.

(b) Remove `(current)` from the v1.5.2 paragraph header.

(c) Insert a new current-version paragraph immediately before the v1.5.2 paragraph:

```markdown
**v1.6.0 (current) — Thai-fund MCP + Finance via MCP connector.** Finance stops discovering funds through Anthropic `web_search` (fragile, rate-limited → empty runs) and instead calls a dedicated remote MCP server, **`thai-funds-mcp`** (separate repo, own Vercel project), which wraps the **Thai SEC Open Data API** (factsheet/NAV/search) plus keyless **stooq** (indices) and **Frankfurter** (FX) tools — five tools, each returning `sourceUrl` + `asOf` for citations. `claude.ts` `completeRaw()` gained an `mcpServers` arg that routes through the beta Messages API (`betas: ['mcp-client-2025-11-20']`, `mcp_servers` + `mcp_toolset`), preserving the streamed `pause_turn` resume + 429/5xx retry; non-MCP callers are unchanged. `finance.ts` runs on **Sonnet** (per-run override, for reliable tool-use), drops `webSearch`, and points at the server via `THAI_FUNDS_MCP_URL` + `THAI_FUNDS_MCP_TOKEN` (degrades to no-MCP if unset). `parseFinanceFindings`/`financeArtifacts`/the draft gate are unchanged — provenance stays **`'web'`**, now cited to SEC. See `docs/superpowers/specs/2026-06-13-v16-thai-funds-mcp-design.md`.
```

(d) In `## Env Vars (Vercel)`, append: `, THAI_FUNDS_MCP_URL + THAI_FUNDS_MCP_TOKEN (Finance's Thai-funds MCP server URL + bearer token; unset = Finance runs without MCP)`.

- [ ] **Step 3: Verify nothing broke**

Run: `npx tsc --noEmit && npm test`
Expected: clean / all pass.

- [ ] **Step 4: Commit**

```bash
git add package.json CLAUDE.md
git commit -m "release: v1.6.0 — Thai-fund MCP + Finance MCP connector

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## ⏸️ MANUAL GATE B (human steps)

1. On the **company.nanoteofficial.me** Vercel project, set `THAI_FUNDS_MCP_URL` (the deployed `https://thai-funds-mcp.vercel.app/api/mcp`) and `THAI_FUNDS_MCP_TOKEN` (= the server's `MCP_AUTH_TOKEN`).
2. Push `main` (auto-deploys).
3. Trigger a Finance run (admin run, or wait for the Mon/Wed/Fri cron).
4. Verify on `/dashboard/fin`: cited funds with SEC `sourceUrl`s, charts populated, provenance `web · cited`, no `noCitedFunds` warning, and the Telegram notice clean.

---

## Self-Review Notes

- **Spec coverage:** §4 server → Tasks 1-6; §5 claude.ts → Task 7, finance.ts → Task 8; §6 env vars → Tasks 1/9 + Gates; §7 tests → Tasks 2-5,7,8; §9 risks (SEC shapes/two-repo) → Gate A + Task 4 provisional note; §11 verification → Gates A/B + Task 9.
- **Type consistency:** `mcpServers: { url, name, token? }[]` defined in Task 7 (`CompleteOpts`) is exactly what Task 8 builds. Tool names in Task 5 (`search_thai_funds` etc.) match the finance prompt in Task 8. SEC shapes (`FundFactsheet` fields `ter/aum/masterFund/return1y/hedged/taxType`) align with the existing `FundFinding` the findings block carries.
- **No placeholders:** every code step shows full code; the only deliberate provisional is the SEC raw shape (Task 4), explicitly flagged with a reconcile-at-Gate-A procedure (not a TODO — it has working fixture-backed code).
