# v1.5.1 — Bilingual highlight + flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent `highlight` and `flags` bilingual (TH/EN, switching with the LangToggle) by teaching `parseHighlight`/`parseFlags` a `lang` param, storing both languages, and wiring `lang` through the two dashboard components. `summary` stays Thai.

**Architecture:** Approach A — the model emits a bilingual `## Highlight` / `## Flags` head (Thai `<!-- ===EN=== -->` English), and the **parsers** split the captured section on the delimiter per language. `splitBilingual` and `normalizeReportOrder` are NOT touched (the shared tail stays identical in both `{th, en}` docs; the bilingual head lives in that shared tail and only the parsers localize it). Storage gains two optional additive fields, backfilled on read.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-13-v151-bilingual-highlight-flags-design.md` (approved).

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/agents/runner.ts` | `parseHighlight`/`parseFlags` gain `lang?`; import `EN_DELIMITER`; store `highlightEn`/`flagsEn` in `pushDigest`+`pushKb` | section-language split + bilingual persistence |
| `src/lib/agents/runner.test.ts` | add lang-split tests | guards parser language selection + fallback |
| `src/lib/agents/types.ts` | add `highlightEn?`/`flagsEn?` to `DigestEntry` + `KbEntry` | bilingual storage shape |
| `src/lib/redis.ts` | `normalizeKbEntry` backfills the two new fields | legacy KB entries render under either toggle |
| `src/lib/redis.kb.test.ts` | backfill test | guards backfill |
| `src/lib/agents/personas.ts` | `OUTPUT_HEAD_CONTRACT` instructs a bilingual Highlight/Flags | emission |
| `src/lib/agents/personas.test.ts` | assert bilingual head instruction | guards contract |
| `src/components/ExecDashboard.tsx` | pass `lang` to parsers; lang-pick `highlightEn` in the Pulse list | bilingual display (exec) |
| `src/components/AgentDetail.tsx` | pass `lang` to parsers | bilingual display (detail) |
| `CLAUDE.md`, `package.json` | v1.5.1 feature line + version | docs |

---

### Task 1: Lang-aware `parseHighlight` / `parseFlags`

**Files:**
- Modify: `src/lib/agents/runner.ts` (import line 4; the two parsers at lines 24-39)
- Test: `src/lib/agents/runner.test.ts` (extend the existing `parseHighlight`/`parseFlags` describes)

- [ ] **Step 1: Write the failing tests** — append these `it` blocks inside the existing `describe('parseHighlight', ...)` and `describe('parseFlags', ...)` blocks in `src/lib/agents/runner.test.ts`:

```ts
// inside describe('parseHighlight', ...)
  it('returns the English half of a bilingual highlight when lang=en', () => {
    const md = '## Highlight\nสรุปภาษาไทย\n<!-- ===EN=== -->\nEnglish verdict.\n\n## Flags\nNone.';
    expect(parseHighlight(md, 'en')).toBe('English verdict.');
    expect(parseHighlight(md, 'th')).toBe('สรุปภาษาไทย');
    expect(parseHighlight(md)).toBe('สรุปภาษาไทย'); // no-arg = Thai (legacy)
  });

  it('falls back to the Thai half for lang=en when there is no delimiter', () => {
    const md = '## Highlight\nThai only verdict\n\n## Flags\nNone.';
    expect(parseHighlight(md, 'en')).toBe('Thai only verdict');
  });

// inside describe('parseFlags', ...)
  it('returns the English bullets of bilingual flags when lang=en', () => {
    const md = '## Flags\n- ก ข ค\n- ง จ\n<!-- ===EN=== -->\n- Alpha\n- Beta';
    expect(parseFlags(md, 'en')).toEqual(['Alpha', 'Beta']);
    expect(parseFlags(md, 'th')).toEqual(['ก ข ค', 'ง จ']);
    expect(parseFlags(md)).toEqual(['ก ข ค', 'ง จ']); // no-arg = Thai (legacy)
  });

  it('falls back to the Thai bullets for lang=en when there is no delimiter', () => {
    const md = '## Flags\n- only one list';
    expect(parseFlags(md, 'en')).toEqual(['only one list']);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/agents/runner.test.ts -t "bilingual"`
Expected: FAIL — `parseHighlight`/`parseFlags` ignore the second arg, so `lang='en'` returns the whole Thai+delimiter+English blob instead of the English half.

- [ ] **Step 3: Implement** — in `src/lib/agents/runner.ts`, add `EN_DELIMITER` to the import on line 4, and replace the two parsers (lines 24-39) with:

```ts
import { EN_DELIMITER, normalizeReportOrder, splitBilingual } from './bilingual';
```

```ts
type Lang = 'th' | 'en';

// The captured Highlight/Flags body may be bilingual: Thai, then a line with
// EN_DELIMITER, then English (v1.5.1). Pick the requested half; fall back to the
// Thai half when there is no delimiter (legacy single-language entries).
function pickLangSegment(body: string, lang: Lang): string {
  const parts = body.split(EN_DELIMITER);
  return (lang === 'en' ? parts[1] ?? parts[0] : parts[0]).trim();
}

export function parseHighlight(markdown: string, lang: Lang = 'th'): string {
  const match = markdown.match(/## Highlight\s*\n([\s\S]*?)(?=\n## |\n---|\s*$)/i);
  if (!match) return '';
  return pickLangSegment(match[1], lang).slice(0, 300);
}

export function parseFlags(markdown: string, lang: Lang = 'th'): string[] {
  const match = markdown.match(/## Flags\s*\n([\s\S]*?)(?=\n## |\n---|\s*$)/i);
  if (!match) return [];
  return pickLangSegment(match[1], lang)
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/agents/runner.test.ts`
Expected: PASS (the four new tests + all existing parser tests, incl. the `['None.']` case, which is unchanged — `pickLangSegment` on a delimiter-free body returns the whole body).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/runner.ts src/lib/agents/runner.test.ts
git commit -m "feat(runner): lang-aware parseHighlight/parseFlags (bilingual head split)"
```

---

### Task 2: Bilingual storage fields + persistence

**Files:**
- Modify: `src/lib/agents/types.ts` (`DigestEntry` ~lines 70-76, `KbEntry` ~lines 80-100)
- Modify: `src/lib/agents/runner.ts` (the `pushDigest` + `pushKb` calls ~lines 154-160)
- Test: `src/lib/agents/runner.test.ts` (extend the head-first ingest test from v1.5)

- [ ] **Step 1: Write the failing test** — add inside `describe('runAgent', ...)` in `src/lib/agents/runner.test.ts`:

```ts
  it('stores both languages of highlight and flags from a bilingual head', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    const head =
      '## Highlight\nสรุปไทย\n<!-- ===EN=== -->\nEnglish verdict.\n\n' +
      '## Flags\n- ใช่\n<!-- ===EN=== -->\n- Yes follow up';
    const run = vi.fn(async (): Promise<AgentRunResult> => ({
      markdown: `รายงานไทย\n\n<!-- ===EN=== -->\n\nEnglish body\n\n${head}`,
      summary: 's', feedMsg: 'm',
    }));

    await runAgent({ dept: 'fin', run }, { repo, notify });

    expect(repo.pushDigest).toHaveBeenCalledWith(expect.objectContaining({
      highlight: 'สรุปไทย', highlightEn: 'English verdict.',
      flags: ['ใช่'], flagsEn: ['Yes follow up'],
    }));
    expect(repo.pushKb).toHaveBeenCalledWith(expect.objectContaining({
      highlightEn: 'English verdict.', flagsEn: ['Yes follow up'],
    }));
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/agents/runner.test.ts -t "stores both languages"`
Expected: FAIL — `pushDigest`/`pushKb` are called without `highlightEn`/`flagsEn` (and TS would reject the fields until the types exist).

- [ ] **Step 3a: Add the type fields** — in `src/lib/agents/types.ts`, add to `DigestEntry`:

```ts
export interface DigestEntry {
  dept: DeptId;
  date: string;
  summary: string;
  highlight: string;
  highlightEn?: string;
  flags: string[];
  flagsEn?: string[];
}
```

and add the same two optional fields to `KbEntry` (immediately after its existing `highlight: string;` and `flags: string[];` lines):

```ts
  highlight: string;
  highlightEn?: string;
  flags: string[];
  flagsEn?: string[];
```

- [ ] **Step 3b: Persist both languages** — in `src/lib/agents/runner.ts`, just after `const highlight = parseHighlight(markdown);` / `const flags = parseFlags(markdown);` (~line 136-137), change those two lines and add the EN variants:

```ts
    const highlight = parseHighlight(markdown, 'th');
    const highlightEn = parseHighlight(markdown, 'en');
    const flags = parseFlags(markdown, 'th');
    const flagsEn = parseFlags(markdown, 'en');
```

Then add the new fields to the `pushDigest` and `pushKb` calls:

```ts
      repo.pushDigest({ dept, date, summary: result.summary, highlight, highlightEn, flags, flagsEn }),
```

```ts
      repo.pushKb({ id, slug, dept, date, ts, category, theme,
        tags, status: 'draft', summary: result.summary, highlight, highlightEn, flags, flagsEn, artifacts,
        sources, provenance, related, markdown, markdownEn, incomplete }),
```

(Leave `pushHistory` unchanged — `HistoryEntry` stays `highlight`-only per the spec.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/agents/runner.test.ts src/lib/agents/runner.kb.test.ts`
Expected: PASS (new test + existing runAgent/kb tests; the v1.5 head-first test still passes — `parseHighlight(markdown,'th')` equals the old no-arg result).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/types.ts src/lib/agents/runner.ts src/lib/agents/runner.test.ts
git commit -m "feat(agents): persist highlightEn/flagsEn on digest + KB entries"
```

---

### Task 3: Backfill on read (`normalizeKbEntry`)

**Files:**
- Modify: `src/lib/redis.ts` (`normalizeKbEntry`, ~lines 45-72)
- Test: `src/lib/redis.kb.test.ts` (this is the file that already imports `normalizeKbEntry`)

- [ ] **Step 1: Write the failing test** — append this `describe` to `src/lib/redis.kb.test.ts` (it already imports `normalizeKbEntry` from `./redis`; reuse that import, do not re-import):

```ts
describe('normalizeKbEntry — bilingual backfill', () => {
  it('backfills highlightEn/flagsEn from the single-language fields', () => {
    const e = normalizeKbEntry({
      dept: 'fin', ts: '2026-06-10T00:00:00Z',
      highlight: 'สรุปไทย', flags: ['ก', 'ข'],
    });
    expect(e.highlightEn).toBe('สรุปไทย');
    expect(e.flagsEn).toEqual(['ก', 'ข']);
  });

  it('keeps explicit English fields when present', () => {
    const e = normalizeKbEntry({
      dept: 'fin', ts: '2026-06-10T00:00:00Z',
      highlight: 'ไทย', highlightEn: 'EN', flags: ['ก'], flagsEn: ['en'],
    });
    expect(e.highlightEn).toBe('EN');
    expect(e.flagsEn).toEqual(['en']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/redis.kb.test.ts -t "bilingual backfill"`
Expected: FAIL — `e.highlightEn` / `e.flagsEn` are `undefined` (not yet set by `normalizeKbEntry`).

- [ ] **Step 3: Implement** — in `src/lib/redis.ts` `normalizeKbEntry`, add the two backfills right after the existing `highlight` / `flags` lines:

```ts
    summary: raw.summary ?? '',
    highlight: raw.highlight ?? '',
    // Pre-v1.5.1 entries are single-language; serve the Thai text for EN too.
    highlightEn: raw.highlightEn ?? raw.highlight ?? '',
    flags: raw.flags ?? [],
    flagsEn: raw.flagsEn ?? raw.flags ?? [],
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/redis.kb.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/redis.ts src/lib/redis.kb.test.ts
git commit -m "feat(redis): backfill highlightEn/flagsEn for legacy KB entries"
```

---

### Task 4: Bilingual head contract (`personas.ts`)

**Files:**
- Modify: `src/lib/agents/personas.ts` (`OUTPUT_HEAD_CONTRACT`, items 2 and 3)
- Test: `src/lib/agents/personas.test.ts` (add one assertion)

- [ ] **Step 1: Write the failing test** — add this `it` to the `describe('personas', ...)` block in `src/lib/agents/personas.test.ts`:

```ts
  it('the head contract instructs a bilingual Highlight and Flags', () => {
    for (const p of Object.values(PERSONAS)) {
      // The bilingual instruction names the delimiter inside the head contract,
      // not only between narratives.
      expect(p).toMatch(/Highlight[\s\S]*<!-- ===EN=== -->/);
    }
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/agents/personas.test.ts -t "bilingual Highlight"`
Expected: FAIL — the current `OUTPUT_HEAD_CONTRACT` has the delimiter only in the bilingual-narrative rules, which sit *before* the head contract, so within the head-contract text there is no `<!-- ===EN=== -->` after `## Highlight`. (If it passes incidentally due to ordering, the assertion still becomes meaningful after Step 3; verify the message wording targets the head contract.)

- [ ] **Step 3: Implement** — in `src/lib/agents/personas.ts`, replace items 2 and 3 of `OUTPUT_HEAD_CONTRACT` (the `## Highlight` and `## Flags` bullet lines) with the bilingual versions:

```ts
2) ## Highlight — ใจความสำคัญที่สุดของงานวันนี้ "สองภาษา": บรรทัดภาษาไทย 1-2 ประโยค แล้วขึ้นบรรทัดใหม่ที่มีเพียง <!-- ===EN=== --> แล้วตามด้วยใจความเดียวกันเป็นภาษาอังกฤษ 1-2 ประโยค (ถ้าเขียน EN ไม่ได้ ให้ละบรรทัดคั่นนี้)
3) ## Flags — รายการ bullet 0-3 ข้อของสิ่งที่แผนกอื่นต้องทำต่อ "สองภาษา": bullet ภาษาไทยก่อน แล้วบรรทัด <!-- ===EN=== --> แล้วตามด้วย bullet ชุดเดียวกันเป็นภาษาอังกฤษ ถ้าไม่มีให้เขียน "None." ทั้งสองฝั่ง
```

(Leave item 1 (findings), item 4 (the `---` line), the trailing "Keep the two headers in English…" paragraph, and `BILINGUAL_RULE` / `FINANCE_BILINGUAL_RULE` unchanged — the narrative `<!-- ===EN=== -->` between the two full reports is still emitted as those rules describe.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/agents/personas.test.ts src/lib/agents/roles.test.ts`
Expected: PASS (new assertion + the existing head-order + delimiter + chat-purity tests; `roles.test.ts` untouched).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/personas.ts src/lib/agents/personas.test.ts
git commit -m "feat(personas): bilingual Highlight/Flags in the head contract"
```

---

### Task 5: Wire `lang` through the dashboard components

**Files:**
- Modify: `src/components/AgentDetail.tsx` (lines 151-152)
- Modify: `src/components/ExecDashboard.tsx` (Pulse list ~line 90-99 + `ExecCard` ~lines 121, 127-128)

No unit tests (display plumbing; repo convention: verify UI with the dev server). Gate with `tsc`.

- [ ] **Step 1: AgentDetail** — `lang` is already in scope (`const { t, lang } = useLang();`, line 141) and `md = pickMarkdown(output, lang)`. Pass `lang` to both parsers (lines 151-152):

```ts
  const highlight = md ? parseHighlight(md, lang) : agent?.status?.summary ?? '';
  const flags = md ? parseFlags(md, lang) : [];
```

- [ ] **Step 2: ExecDashboard — `ExecCard`** — add `lang` to the destructure (line 121) and pass it to the parsers (lines 127-128). The shared tail in `agent.output.markdown` carries both languages, so no `pickMarkdown` is needed:

```ts
  const { t, lang } = useLang();
```

```ts
  const highlight = md ? parseHighlight(md, lang) : agent.status?.summary ?? '';
  const flags = md ? parseFlags(md, lang) : [];
```

- [ ] **Step 3: ExecDashboard — Pulse list** — the top-level component destructures `const { t } = useLang();` (line 19). Add `lang`:

```ts
  const { t, lang } = useLang();
```

Then lang-pick the stored highlight in the digest row (line 98 `{e.highlight || e.summary}`):

```tsx
                      {(lang === 'en' ? (e.highlightEn || e.highlight) : e.highlight) || e.summary}
```

(Leave the history-sparkline tooltip on line ~165 (`h.highlight`) and `totalFlags` on line 44 unchanged — Thai tooltip is out of scope; the flag count is identical in both languages.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentDetail.tsx src/components/ExecDashboard.tsx
git commit -m "feat(dashboard): switch highlight + flags with the TH/EN toggle"
```

---

### Task 6: Docs + version

**Files:**
- Modify: `package.json`, `CLAUDE.md`

- [ ] **Step 1:** `npm version 1.5.1 --no-git-tag-version`

- [ ] **Step 2: CLAUDE.md** — change `**Current version: 1.5.0**` → `**Current version: 1.5.1**` and `(newest 1.5.0 back to 1.4)` → `(newest 1.5.1 back to 1.4)`; move the `(current)` marker off the v1.5.0 paragraph and insert a new paragraph above it:

```markdown
**v1.5.1 (current) — Bilingual highlight + flags.** Completes the v1.4.1 bilingual story (which left highlight/summary Thai-only). The model now emits a bilingual `## Highlight` and `## Flags` in the head (Thai `<!-- ===EN=== -->` English); `parseHighlight`/`parseFlags` (`runner.ts`) gained a `lang` param that splits the captured section on the delimiter (fallback to Thai), so `splitBilingual`/`normalizeReportOrder` are untouched. `DigestEntry`/`KbEntry` gained optional `highlightEn`/`flagsEn` (persisted by the runner, backfilled from the Thai fields in `normalizeKbEntry`), and `ExecDashboard`/`AgentDetail` pass the active `lang` to the parsers so the dashboard verdict + flags switch with the toggle. `summary` stays Thai (code-built status string), as do the history tooltip + CSV. See `docs/superpowers/specs/2026-06-13-v151-bilingual-highlight-flags-design.md`.
```

Also update the Key Constraints bullet that begins `- Every agent report MUST OPEN with the machine-readable head:` — change the highlight/flags clause to note they are bilingual:

```markdown
- Every agent report MUST OPEN with the machine-readable head: a ` ```json findings ` block, then a bilingual `## Highlight`, then a bilingual `## Flags` (English headers; Thai `<!-- ===EN=== -->` English bodies — v1.5.1), then a `---` separator, then the narrative. `personas.ts` `OUTPUT_HEAD_CONTRACT` enforces it; `personas.test.ts` guards it; `runner.ts` normalizes the emitted order back to the narrative-first storage layout via `bilingual.ts` `normalizeReportOrder()` before parsing/storing, `parseHighlight`/`parseFlags` take a `lang` param to split the bilingual head, and each `parse<Dept>Findings()` parses the block.
```

- [ ] **Step 3: Full gates**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 4: Commit + push**

```bash
git add -A
git commit -m "release: v1.5.1 — bilingual highlight + flags"
git push origin main
```

- [ ] **Step 5: Live verification (after Vercel deploy)** — poll `https://company.nanoteofficial.me/` for `1.5.1`. On the next cron run, open `/dashboard` toggled to EN: the agent card verdict + flag chips and the Company Pulse line should be English; toggle to TH and they switch back. Confirm a pre-v1.5.1 KB entry still renders (Thai under both toggles, via the backfill).

---

## Self-Review

- **Spec coverage:** §3 contract (Task 4) · §4 parsers (Task 1) · §5 storage+persistence (Task 2) · §5 backfill (Task 3) · §6 display (Task 5) · §7 tests (Tasks 1-4) · §10 verification (Task 6). ✓
- **Placeholder scan:** every code block is complete; the only conditional is Task 3's test-file location (explicit `ls` check with a stated fallback). ✓
- **Type consistency:** `Lang` type defined Task 1, reused in signatures; `highlightEn?`/`flagsEn?` defined Task 2 (types), persisted Task 2 (runner), backfilled Task 3, consumed Task 5; field names identical across all tasks. ✓
- **Invariant check:** `splitBilingual`/`normalizeReportOrder` not modified; `pushHistory`/`HistoryEntry` unchanged; existing `parseFlags('## Flags\nNone.')` → `['None.']` preserved (delimiter-free body → whole segment). ✓
