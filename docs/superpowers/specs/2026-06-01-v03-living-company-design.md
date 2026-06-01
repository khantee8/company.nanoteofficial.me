# v0.3 Design: Living Company

**Date**: 2026-06-01
**Status**: Approved
**Scope**: Inter-agent collaboration, agent memory/continuity, visual life in the office

---

## 1. Agent Memory (Rolling Context)

### Storage

New Redis keys:

- `agent:{dept}:history` — Redis list, last 7 outputs per agent (own work only)
- `company:digest` — Redis list, cross-department highlights, capped at 25 entries (5 depts x 5 days)

### History Entry Schema

```ts
interface HistoryEntry {
  dept: DeptId;
  date: string;       // ISO date (YYYY-MM-DD)
  summary: string;    // 1-line summary
  highlight: string;  // 1-2 sentence key takeaway
  markdown: string;   // full output
}
```

### Digest Entry Schema

```ts
interface DigestEntry {
  dept: DeptId;
  date: string;
  summary: string;
  highlight: string;
  flags: string[];    // actionable items for other departments
}
```

### Flow

On each agent run, before calling Claude:

1. Fetch own last 7 outputs from `agent:{dept}:history`
2. Fetch the company digest (last 25 entries, filtered to exclude own dept)
3. Inject both as context sections in the prompt: `## Your Recent Work` and `## Company Digest`

On each agent completion, the runner:

1. Pushes a `HistoryEntry` to `agent:{dept}:history` (LPUSH + LTRIM to 7)
2. Pushes a `DigestEntry` to `company:digest` (LPUSH + LTRIM to 25)

### Prompt Integration

Each agent's persona prompt is updated to require two new output sections:

- `## Highlight` — 1-2 sentence key takeaway (parsed out by runner, stored in history + digest)
- `## Flags` — short actionable items for other departments (parsed out, stored in digest)

---

## 2. Inter-Agent Collaboration (Reactive Triggers)

### Mechanism

Leverages the existing staggered cron schedule:

| Time (UTC) | Dept | Sees Today's Output From |
|------------|------|--------------------------|
| 11:00 | fin | (none — runs first) |
| 12:00 | rnd | fin |
| 13:00 | mkt | fin, rnd |
| 14:00 | ops | fin, rnd, mkt |
| 15:00 | ceo | fin, rnd, mkt, ops |

### `buildContext(dept)` Function

New function in the runner module:

1. Determine which departments have already run today (check `agent:{dept}:status.lastRun` for today's date)
2. Fetch their outputs and flags
3. Build a `## Today's Company Activity` prompt section with:
   - Each earlier dept's summary + highlight + flags
4. Combine with memory context (section 1) into a single context block

### Agent-Specific Cross-References

- **Finance**: Runs first. No same-day peers. Produces market flags (e.g., "major drop in BTC", "notable divergence ETH/SOL").
- **R&D**: Sees Finance flags. Can reference market context in research brief if relevant.
- **Marketing**: Sees R&D brief + Finance snapshot. Drafts content that references actual research findings and market data.
- **Operations**: Sees all three. Can flag deployment/infra items that connect to other dept activity.
- **CEO**: Sees all four departments. Makes decisions that reference specific dept outputs and flags.

### Prompt Changes

Each agent's prompt is updated to:

1. Receive a `## Today's Company Activity` section (earlier depts' summaries, highlights, flags)
2. Instruction: "Reference your colleagues' work where relevant — don't repeat it, build on it."
3. Produce `## Flags` section with 0-3 actionable items for other departments

---

## 3. Visual Life (State-Driven + Ambient)

### Two Animation Modes

#### A. Real-State Overlay

When `/api/agents` reports a department as `running`:

1. Sprite walks to its department workstation waypoint
2. Plays "working" animation (typing bob, faster idle cycle)
3. On `done`: celebration bubble (checkmark + summary snippet), then walks home
4. On `error`: red-tinted sprite + error bubble, then walks home

State priority: Real state always overrides ambient. If an ambient routine is active and a `running` event arrives, cancel the ambient immediately.

#### B. Ambient Idle Behaviours

When no real-state event is active, agents perform randomized ambient actions from a pool:

- **Coffee break**: Walk to coffee waypoint, pause 3-4s, walk back
- **Whiteboard visit**: Walk to whiteboard, pause 2-3s with thought bubble, walk back
- **Peer chat**: Two agents walk to meeting point, exchange 2-3 bubbles, walk back
- **Desk fidget**: Small idle variations at home position (stretch bubble, look-around animation)
- **Server check** (Ops only): Walk to server rack, working animation, walk back
- **Cross-dept visit**: Walk to another agent's desk area, brief exchange, walk back

Refactor `buildScripts()` from `behaviours.ts` into an `AmbientPool`:

- Each routine is a self-contained sequence: select agent(s), move, say, return
- Pool scheduler picks random routines every 4-8s
- Routines that involve an agent currently in a real-state animation are skipped
- 1-2 agents active in ambient at any time (not all 5 moving at once)

### New Waypoints

Add per-department workstation waypoints in `waypoints.ts`:

- CEO: executive desk area
- Marketing: content desk
- R&D: whiteboard / lab bench
- Operations: server rack
- Finance: analysis desk

### State Detection

`OfficeApp` already polls `/api/agents` every 8s. Pass agent states down to `OfficeCanvas` as a prop. A new `StateOverlay` controller:

1. Compares previous vs current agent states on each poll
2. On `idle → running`: triggers walk-to-workstation animation
3. On `running → done`: triggers celebration + walk-home
4. On `running → error`: triggers error animation + walk-home
5. Locks the agent out of ambient pool while real-state animation is active

---

## 4. Data Flow

```
Cron fires (fin 11:00)
  -> runner.buildContext('fin')
    -> fetch own 7-day history from agent:fin:history
    -> fetch 5-day company digest (exclude fin entries)
    -> check same-day peers: none (fin is first)
  -> finance.run(context)
    -> Claude call with enriched prompt
    -> returns markdown with ## Highlight and ## Flags sections
  -> runner parses highlight + flags from markdown
  -> runner saves:
    -> agent:fin:output (full output for API)
    -> agent:fin:history LPUSH + LTRIM 7
    -> company:digest LPUSH + LTRIM 25
    -> agent:fin:status { state: 'done', flags: [...] }
    -> feed event
  -> telegram notify

Cron fires (rnd 12:00)
  -> runner.buildContext('rnd')
    -> fetch own 7-day history
    -> fetch 5-day company digest
    -> check same-day peers: fin ran today -> fetch fin output + flags
    -> build "Today's Company Activity" section
  -> rnd.run(context)
  -> ... same save pattern ...

[mkt 13:00, ops 14:00, ceo 15:00 follow same pattern with more peers]
```

**Visual flow (concurrent with above)**:

```
OfficeApp polls /api/agents every 8s
  -> detects fin status changed to 'running'
  -> passes agentStates to OfficeCanvas
  -> StateOverlay cancels any ambient for fin
  -> fin sprite walks to analysis desk, types
  -> next poll: fin status = 'done'
  -> StateOverlay triggers celebration, walk home
  -> fin released back to ambient pool
```

---

## 5. Files Changed

| File | Change |
|------|--------|
| `src/lib/agents/types.ts` | Add `flags` to `AgentRunResult`, new `HistoryEntry`, `DigestEntry` types |
| `src/lib/redis.ts` | Add `pushHistory`, `getHistory`, `pushDigest`, `getDigest` methods |
| `src/lib/agents/runner.ts` | Add `buildContext()`, inject memory + cross-refs, save history + digest, parse highlight/flags |
| `src/lib/agents/personas.ts` | Update all persona prompts with Highlight/Flags output instructions |
| `src/lib/agents/finance.ts` | Accept context param, pass to prompt |
| `src/lib/agents/rnd.ts` | Accept context param, incorporate earlier dept outputs |
| `src/lib/agents/marketing.ts` | Accept context param, reference R&D + Finance |
| `src/lib/agents/operations.ts` | Accept context param, reference all earlier depts |
| `src/lib/agents/ceo.ts` | Accept context param (replaces current manual digest fetch) |
| `src/lib/agents/behaviours.ts` | Refactor: extract ambient pool, add state overlay integration |
| `src/lib/agents/ambient.ts` | New — randomized idle behaviour routines and pool scheduler |
| `src/lib/agents/stateOverlay.ts` | New — maps real agent states to sprite animation commands |
| `src/components/OfficeCanvas.tsx` | Accept `agentStates` prop, wire StateOverlay controller |
| `src/components/OfficeApp.tsx` | Pass agent states map to OfficeCanvas |
| `src/lib/data/waypoints.ts` | Add per-dept workstation waypoints |
| Tests | Update runner tests, add memory/context/parse tests |

---

## 6. Out of Scope

- No visitor interaction / chat UI
- No weekly recap / blog generation
- No Telegram bot behavior changes (still receive-only notifications)
- No new cron jobs — same 5 staggered daily runs
- No UI changes beyond canvas animations (sidebar, terminal feed, artifact panel unchanged)
- No changes to the isometric engine itself (camera, tile rendering, furniture)
