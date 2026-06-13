# v1.6 — Thai-fund MCP server + Finance integration (design spec)

**Status:** Approved design — implementation plan to follow.
**Scope:** Replace the Finance agent's fragile `web_search`-only fund discovery with a dedicated **remote MCP server** wrapping the **Thai SEC Open Data API** (deterministic, citable fund data) plus keyless **market-context** tools, wired into the agent via the **Anthropic MCP connector**. Spans two repos: a new standalone `thai-funds-mcp` and the existing `company.nanoteofficial.me`.
**Foundation:** Builds on the v1.4 "never uncited" invariant and the v1.4.5/v1.4.7 streamed `completeRaw()` + `pause_turn` engine. Provenance stays `'web'` (now cited to SEC, not the open web).

---

## 1. Problem

The Finance agent has **no data adapter** — CoinGecko was retired in v1.4 and Finance now discovers and prices Thai mutual funds entirely through Anthropic's `web_search` server tool (`finance.ts` `run()`, `webSearch: true`). When `web_search` is rate-limited mid-run (an Anthropic account-tier throttle), the model writes uncited funds, `parseFinanceFindings()` drops every one for failing `hasCitation()`, and the run stores empty — the `noCitedFunds` path at `finance.ts:94`. The deliverable is unreliable by construction: it depends on a general-purpose web search succeeding against a niche domain (Thai open-end funds) under a throttle.

The fix is a **dedicated, authoritative data source**. Thailand's SEC publishes an official **Open Data API** (`secopendata.sec.or.th`, formerly `api-portal.sec.or.th`) covering every registered fund: factsheet (fees/TER, AUM, returns, policy/category, AMC, tax privilege), daily NAV, and fund lists — free, JSON, generous limit (3,000 calls / 300s). The user chose to expose it through a **custom remote MCP server** (reusable beyond this app) consumed via the **Anthropic MCP connector**, rather than an in-process `src/lib/sources` adapter.

## 2. Decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Goal | **Both** — replace fund discovery with real data **and** enrich with market context | User selected "Both". |
| Delivery mechanism | **Custom remote MCP connector** (not an in-process adapter) | User chose reusability over the adapter's determinism/simplicity; accepted model-mediated `'web'` provenance. |
| Fund data source | **Thai SEC Open Data API** | Official, free, authoritative, citable; the only complete Thai open-end-fund source. (TradingView MCP rejected: no Thai-fund coverage, local-desktop/stdio architecture incompatible with serverless + the Anthropic connector requires a remote HTTPS server.) |
| Market context source | **stooq** (indices, keyless CSV) + **Frankfurter** (FX, keyless) | No key, serverless-friendly, sufficient for benchmark/FX context. |
| MCP server hosting | **Separate repo + Vercel project** (`thai-funds-mcp`) | User chose the reusable standalone artifact over a route in the existing app. |
| Finance model | **Switch Finance to Sonnet** (per-run override) | Reliable multi-step tool-use; Haiku has been flaky with programmatic tool-calling (v1.4.9). Finance runs Mon/Wed/Fri, so ~3× cost is bounded. |
| web_search for Finance | **Drop it** — MCP-only for fund facts | Eliminates the rate-limit dependency that causes today's empty runs; cleaner citations. Re-addable later for qualitative color. |

## 3. Architecture

```
[ thai-funds-mcp ]   NEW standalone repo → own Vercel project
  app/api/mcp/route.ts        mcp-handler, Streamable HTTP, bearer auth (withMcpAuth)
   ├─ search_thai_funds / thai_fund_factsheet / thai_fund_nav  → SEC Open Data API (SEC_API_KEY)
   ├─ market_index            → stooq (keyless)
   └─ fx_rate                 → Frankfurter (keyless)
        every tool returns { ...data, sourceUrl, asOf }   ← citation material
            ▲  Anthropic executes tool calls server-side (no client proxying)
            │
[ company.nanoteofficial.me ]
  claude.ts  completeRaw({ mcpServers })  → beta.messages.stream, betas:['mcp-client-2025-11-20']
  finance.ts run()           → Sonnet, no web_search; prompt: "use fund tools, cite sourceUrl+asOf"
   → model emits ```json findings → parseFinanceFindings() (citation required) → financeArtifacts()
   → provenance 'web' (cited to SEC)
```

The two pieces are independent units with one interface: the MCP tool contract (§4). The MCP server knows nothing about the agent; the agent knows only the server URL + token + tool names.

## 4. The MCP server (`thai-funds-mcp`)

**Stack:** Next.js (App Router) + `mcp-handler` + `zod`, TypeScript, deployed to Vercel (Fluid Compute default). One route `app/api/mcp/route.ts` exporting `GET`/`POST`/`DELETE` via `createMcpHandler`, wrapped in `withMcpAuth` for bearer-token auth (`MCP_AUTH_TOKEN`). Transport: Streamable HTTP (the connector also accepts SSE).

**Tools** — each returns its data plus `sourceUrl` (a stable, public, citable URL) and `asOf` (ISO `YYYY-MM-DD`), so the model can emit findings that pass `hasCitation()` (needs `url` + `date`):

| Tool | Input (zod) | Output |
|---|---|---|
| `search_thai_funds` | `{ query: string, amc?: string, taxType?: 'none'\|'ssf'\|'rmf'\|'thaiesg', limit?: number }` | `{ funds: { proj_id, name, amc, category, taxType, sourceUrl }[] }` |
| `thai_fund_factsheet` | `{ proj_id: string }` | `{ proj_id, name, amc, ter, aum, masterFund, return1y, hedged, taxType, asOf, sourceUrl }` |
| `thai_fund_nav` | `{ proj_id: string, date?: string }` | `{ proj_id, nav, date, sourceUrl }` |
| `market_index` | `{ symbol: string }` | `{ symbol, price, changePct, asOf, sourceUrl }` |
| `fx_rate` | `{ base: string, quote: string }` | `{ base, quote, rate, asOf, sourceUrl }` |

**Data layer** mirrors the company app's `src/lib/sources/` discipline: each source is a pure `select`/`shape` unit (transforms a raw payload → the typed shape, unit-tested with fixtures) plus a fetcher that swallows errors → empty/typed-null so a tool never throws unhandled. SEC adapter reads `SEC_API_KEY` and sends it as `Ocp-Apim-Subscription-Key`. **Expected** SEC endpoints (confirmed against the dev-portal docs at build time, since the portal blocks anonymous fetches): factsheet family under `/FundFactsheet/fund/...` (fund list, policy, fee, performance, AMC), daily NAV under `/FundDailyInfo/.../dailynav/...`. `sourceUrl` is the public SEC fund-info page for the `proj_id` (or the API resource URL if no public page exists). stooq: keyless CSV quote endpoint (`https://stooq.com/q/l/?s=<symbol>&f=sd2t2ohlcv&h&e=csv`). Frankfurter: `https://api.frankfurter.app/latest?from=<base>&to=<quote>`.

**Repo deliverables:** `package.json`, `README.md` (how to get the SEC key, env vars, how to add to an MCP host), the route, the source units + tests, `vercel` config. Its own git repo under `khantee8/`, its own Vercel project, auto-deploy from `main`.

## 5. Finance integration (`company.nanoteofficial.me`)

**`claude.ts`** — `completeRaw()` gains an optional `mcpServers?: { url: string; name: string; token?: string }[]` arg. When present it routes through `client.beta.messages.stream({ ..., betas: ['mcp-client-2025-11-20'], mcp_servers: [{ type: 'url', url, name, authorization_token: token }], tools: [{ type: 'mcp_toolset', mcp_server_name: name }] })`. The existing `streamOnce()` 429/5xx retry, `pause_turn` resumption (`MAX_PAUSE_RESUMES`), text concatenation, and usage summing are preserved — server-side MCP tool loops resume the same way `web_search` loops do. Callers that pass no `mcpServers` are byte-for-byte unchanged (still the non-beta path, or beta path without servers). `complete()` wrapper unaffected.

**`finance.ts`** — `run()`:
- Builds `mcpServers` from `THAI_FUNDS_MCP_URL` + `THAI_FUNDS_MCP_TOKEN` (skips MCP wiring if unset, degrading to the current behavior so local/dev without the server still runs).
- Calls `completeRaw({ system: PERSONAS.fin, prompt, model: SONNET, mcpServers, maxTokens: 8000 })` — **`webSearch` removed**.
- Prompt updated: "use the fund tools to fetch real Thai funds for today's theme + benchmark/FX context; open with the ` ```json findings ` block citing each tool's `sourceUrl` + `asOf`."
- `parseFinanceFindings()`, `financeArtifacts()`, `financeTags()`, and the `incomplete`/`noCitedFunds`/`draft`-gate logic are **unchanged**; `noCitedFunds` now means an MCP/SEC failure rather than a web_search throttle (summary text generalized accordingly).
- Provenance stays `'web'` (charts built by `financeArtifacts()` from validated, cited findings — invariant intact).

**Model:** Finance runs on Sonnet via the per-run model override (the `model` param already threaded through `completeRaw`). The default agent model (`CLAUDE_MODEL`, Haiku) is untouched for the other five agents.

**Enrich:** `market_index` (e.g. `^spx`, `^sox`, `^set`) and `fx_rate` (THB/USD) give the model benchmark + hedging context woven into the narrative; an optional small "funds 1Y vs benchmark" artifact may be added if it falls out cleanly (not required).

## 6. Environment variables

| Var | Where | Purpose |
|---|---|---|
| `SEC_API_KEY` | thai-funds-mcp (Vercel) | SEC Open Data subscription key (`Ocp-Apim-Subscription-Key`). User registers at `secopendata.sec.or.th`. |
| `MCP_AUTH_TOKEN` | thai-funds-mcp (Vercel) | Bearer token the server requires (`withMcpAuth`). |
| `THAI_FUNDS_MCP_URL` | company app (Vercel) | The deployed MCP route URL (`https://thai-funds-mcp.vercel.app/api/mcp`). |
| `THAI_FUNDS_MCP_TOKEN` | company app (Vercel) | Same value as `MCP_AUTH_TOKEN`; passed as `authorization_token`. |

## 7. Testing

**thai-funds-mcp:** unit tests on every `select`/`shape` (SEC factsheet parse, SEC daily-NAV parse, fund-search shaping, stooq CSV parse, Frankfurter parse) with realistic fixtures, asserting `sourceUrl`/`asOf` are always populated. One tool-level smoke check via the MCP inspector (manual, documented in README). No live network in unit tests.

**company app:** `claude.ts` MCP-path unit test (mock the SDK; assert the beta header, `mcp_servers`/`tools` shape, token pass-through, and that `pause_turn` resumption still fires). `finance.ts` run test (mock `completeRaw`; assert Sonnet model, no `webSearch`, `mcpServers` populated from env, and that a findings block still parses → artifacts). Existing Finance tests updated to the new call shape. No live SEC/MCP calls.

## 8. Invariants preserved

- **Never uncited** — charts still built by `financeArtifacts()` from findings validated by `hasCitation()`; the MCP tools supply `sourceUrl` + `asOf` as the citation. Provenance `'web'`.
- **Draft→publish gate** — unchanged; an MCP/SEC failure yields `noCitedFunds` → `incomplete` → archived `draft`, never auto-published.
- **No `dangerouslySetInnerHTML`**, no new client rendering. The MCP server has no UI.
- Other five agents, their cadence, the runner, storage, `/api/kb`, and the dashboard are untouched.

## 9. Risks / unknowns (flagged, not blockers)

- **Exact SEC endpoint shapes** — the portal blocks anonymous fetches (403), so paths/field names are confirmed against the dev-portal docs once the key exists. The tool *contract* (§4) is stable regardless; only the SEC adapter internals depend on this.
- **Sonnet tool-use reliability** — chosen specifically to de-risk Haiku's tool-calling flakiness; if Sonnet still mis-uses tools, the `incomplete`/draft gate protects the dashboard (no clean-looking empty runs).
- **Two-repo / two-Vercel-project overhead** — new repo init, env vars on both projects, and a deploy order dependency (the MCP server must be deployed and reachable before the Finance integration can run a real cron).
- **MCP connector data retention** — the connector is not ZDR-eligible; tool data follows standard retention. Acceptable for public SEC fund data.

## 10. Out of scope (deliberate)

Rolling the MCP connector to the other five agents · real-time/intraday pricing (Thai funds are daily NAV) · deterministic `'api'` provenance (user chose model-mediated `'web'`) · OAuth flows beyond a static bearer token · a public UI for the MCP server · caching/Redis on the MCP server (rely on Vercel function reuse + SEC's own freshness).

## 11. Verification

**thai-funds-mcp:** unit suite + `tsc` + lint green; MCP inspector lists all 5 tools and each returns data + `sourceUrl` + `asOf` against the live SEC key; deploy to Vercel; confirm the public URL responds to an inspector/connector handshake with the bearer token.
**company app:** unit suite + `tsc` + lint green; set the two env vars; trigger a Finance run (cron cadence Mon/Wed/Fri, or admin run once the key/server exist) and confirm the dashboard shows cited funds with SEC `sourceUrl`s, charts populated, provenance `web · cited`, and no `noCitedFunds` warning. `CLAUDE.md` + `package.json` bump to **1.6.0**.
