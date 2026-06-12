# v1.5.0 — Analyst-Report Rollout + Findings-First Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All six agents emit a truncation-safe findings-first head (`findings → ## Highlight → ## Flags → ---`) before their report, and the five non-finance agents (CyberX, Marketing, R&D, Operations, CEO) gain sectioned analyst-report templates with full dual TH/EN reports at 8000-token budgets.

**Architecture:** Normalize-on-ingest — the model emits head-first, but `runner.ts` reassembles the output into the existing narrative-first storage layout via one new `normalizeReportOrder()` in `bilingual.ts`, so every downstream consumer (splitBilingual, narrativeOf, dashboards, exports, `/api/kb`, old entries) is untouched. Templates are appended to the `.agents/*.md` briefs (the brief IS the spec, loaded verbatim by `roles.ts`). Telegram chat gets scaffolding-free `CHAT_PERSONAS`.

**Tech Stack:** Next.js 16 / TypeScript, Vitest, Anthropic SDK (already wrapped in `src/lib/claude.ts` — not touched here).

**Spec:** `docs/superpowers/specs/2026-06-12-v150-analyst-rollout-design.md` (approved).

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/agents/bilingual.ts` | add `normalizeReportOrder()` | owns report layout; converts emitted head-first order → legacy storage order |
| `src/lib/agents/bilingual.test.ts` | add tests | guards the normalization edge cases |
| `src/lib/agents/runner.ts` | 1-line ingest change | calls `normalizeReportOrder` before `splitBilingual` |
| `src/lib/agents/runner.test.ts` | add test | proves head-first output stores in legacy layout |
| `src/lib/agents/personas.ts` | rewrite contracts | `OUTPUT_HEAD_CONTRACT` (replaces `FINDINGS_CONTRACT`+`OUTPUT_FOOTER`), updated bilingual rules, new `CHAT_PERSONAS` |
| `src/lib/agents/personas.test.ts` | rewrite tests | guards head order + chat-persona purity |
| `src/app/api/telegram/route.ts` | 2 call sites | `/ask` + follow-ups use `CHAT_PERSONAS` |
| `src/lib/agents/{cyberx,marketing,rnd,operations,ceo}.ts` | budget + prompt phrase | `maxTokens: 8000`; prompt says "เปิดด้วยบล็อก findings" not "แนบ" |
| `src/lib/agents/{cyberx,marketing,rnd,operations,ceo}.test.ts` | assertion update | budget 4000 → 8000 |
| `src/lib/agents/finance.ts` | prompt phrase only | budget already 8000 |
| `.agents/{CyberX,Marketing & Social Media,AI R&D,Operation,CEO} Agent.md` | append template section | per-dept "โครงสร้างรายงานฉบับวิเคราะห์" before the findings schema |
| `CLAUDE.md`, `package.json` | docs + 1.5.0 | feature line + constraint bullet rewrite |

---

### Task 1: `normalizeReportOrder()` in bilingual.ts

**Files:**
- Modify: `src/lib/agents/bilingual.ts` (append after `splitBilingual`)
- Test: `src/lib/agents/bilingual.test.ts` (append; also add `normalizeReportOrder` to the import on line 2)

- [ ] **Step 1: Write the failing tests** — append to `src/lib/agents/bilingual.test.ts`, and change line 2 to `import { splitBilingual, narrativeOf, normalizeReportOrder, EN_DELIMITER } from './bilingual';`

```ts
describe('normalizeReportOrder', () => {
  const HEAD = '```json findings\n{"items":[]}\n```\n\n## Highlight\nสรุปสำคัญ\n\n## Flags\nNone.\n\n---';

  it('moves a compliant head to the tail (storage layout) and round-trips splitBilingual', () => {
    const raw = `${HEAD}\n\nรายงานไทย\n\n${EN_DELIMITER}\n\nEnglish report`;
    const out = normalizeReportOrder(raw);
    expect(out.startsWith('รายงานไทย')).toBe(true);
    expect(out.indexOf('```json findings')).toBeGreaterThan(out.indexOf('English report'));
    expect(out.indexOf('## Highlight')).toBeGreaterThan(out.indexOf('English report'));
    const { th, en } = splitBilingual(out);
    expect(th).toContain('รายงานไทย');
    expect(th).toContain('## Highlight');
    expect(en).toContain('English report');
    expect(en).toContain('```json findings');
  });

  it('passes legacy narrative-first output through unchanged', () => {
    const legacy = `รายงานไทย\n\n${EN_DELIMITER}\n\nEnglish\n\n\`\`\`json findings\n{}\n\`\`\`\n\n## Highlight\nx\n\n## Flags\nNone.`;
    expect(normalizeReportOrder(legacy)).toBe(legacy);
  });

  it('keeps the head when the body was truncated mid-report', () => {
    const raw = `${HEAD}\n\nรายงานไทยที่ถูกตัดกลางปร`;
    const out = normalizeReportOrder(raw);
    expect(out.startsWith('รายงานไทยที่ถูกตัดกลางปร')).toBe(true);
    expect(out).toContain('## Highlight');
    expect(out).toContain('```json findings');
  });

  it('passes through when the --- separator is missing (never throws)', () => {
    const raw = '```json findings\n{}\n```\n\n## Highlight\nx\n\n## Flags\nNone.';
    expect(normalizeReportOrder(raw)).toBe(raw);
  });

  it('passes through when there is no body after the separator', () => {
    const out = normalizeReportOrder(HEAD);
    expect(out).toContain('## Highlight');
  });

  it('never throws on empty input', () => {
    expect(normalizeReportOrder('')).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/agents/bilingual.test.ts`
Expected: FAIL — `normalizeReportOrder` is not exported.

- [ ] **Step 3: Implement** — append to `src/lib/agents/bilingual.ts`:

```ts
// v1.5.0 — agents EMIT the machine-readable head first (findings → Highlight →
// Flags → ---) so truncation can't destroy it, but storage keeps the legacy
// narrative-first layout. Normalized once on ingest (runner.ts), so every
// downstream consumer — splitBilingual, narrativeOf, dashboards, exports, and
// all pre-v1.5 KB entries — keeps seeing one canonical shape.
const HEAD_SEP_RE = /\n---[ \t]*(\n|$)/;

export function normalizeReportOrder(raw: string): string {
  const text = (raw ?? '').trim();
  if (!text.startsWith('```json findings')) return text;
  const flagsIdx = text.search(/\n##\s+Flags/i);
  if (flagsIdx === -1) return text;
  const sep = text.slice(flagsIdx).match(HEAD_SEP_RE);
  if (!sep || sep.index === undefined) return text;
  const head = text.slice(0, flagsIdx + sep.index).trim();
  const body = text.slice(flagsIdx + sep.index + sep[0].length).trim();
  if (!body) return text;
  return `${body}\n\n${head}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/agents/bilingual.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/bilingual.ts src/lib/agents/bilingual.test.ts
git commit -m "feat(bilingual): normalizeReportOrder — head-first emission, legacy storage"
```

---

### Task 2: Runner ingest integration

**Files:**
- Modify: `src/lib/agents/runner.ts` (import on line 4; the `splitBilingual` call ~line 133)
- Test: `src/lib/agents/runner.test.ts` (append inside `describe('runAgent', ...)`)

- [ ] **Step 1: Write the failing test** — add inside the `describe('runAgent', ...)` block:

```ts
  it('normalizes head-first (v1.5) output into the legacy storage layout', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    const head = '```json findings\n{}\n```\n\n## Highlight\nHead verdict.\n\n## Flags\n- Follow up\n\n---';
    const run = vi.fn(async (): Promise<AgentRunResult> => ({
      markdown: `${head}\n\nรายงานไทย\n\n<!-- ===EN=== -->\n\nEnglish body`,
      summary: 's', feedMsg: 'm',
    }));

    await runAgent({ dept: 'fin', run }, { repo, notify });

    const stored = (repo.setOutput as ReturnType<typeof vi.fn>).mock.calls[0][0] as { markdown: string };
    expect(stored.markdown.startsWith('รายงานไทย')).toBe(true);
    expect(stored.markdown.indexOf('## Highlight')).toBeGreaterThan(stored.markdown.indexOf('รายงานไทย'));
    expect(repo.pushHistory).toHaveBeenCalledWith(expect.objectContaining({ highlight: 'Head verdict.' }));
    expect(repo.pushDigest).toHaveBeenCalledWith(expect.objectContaining({ flags: ['Follow up'] }));
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/agents/runner.test.ts`
Expected: FAIL — `stored.markdown.startsWith('รายงานไทย')` is false (the head is still at the top).

- [ ] **Step 3: Implement** — in `src/lib/agents/runner.ts` change the import (line 4) and the split call (~line 133):

```ts
import { normalizeReportOrder, splitBilingual } from './bilingual';
```

```ts
    // v1.5: agents emit the findings/Highlight/Flags head FIRST (truncation-
    // safe); normalize back to the narrative-first storage layout before split.
    const { th: markdown, en: markdownEn } = splitBilingual(normalizeReportOrder(result.markdown));
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/agents/runner.test.ts src/lib/agents/runner.kb.test.ts`
Expected: PASS (all — legacy-order fixtures pass through `normalizeReportOrder` unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/runner.ts src/lib/agents/runner.test.ts
git commit -m "feat(runner): normalize head-first agent output on ingest"
```

---

### Task 3: personas — head contract + chat personas

**Files:**
- Modify: `src/lib/agents/personas.ts` (replace `FINDINGS_CONTRACT`, `BILINGUAL_RULE`, `OUTPUT_FOOTER`, `FINANCE_BILINGUAL_RULE`, both persona builders; add `CHAT_PERSONAS`)
- Test: `src/lib/agents/personas.test.ts` (replace the three tests)

- [ ] **Step 1: Rewrite the tests** — replace the full body of `src/lib/agents/personas.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { PERSONAS, CHAT_PERSONAS } from './personas';
import { DEPARTMENTS } from '@/lib/data/departments';

describe('personas', () => {
  it('every persona carries the mandatory head contract: findings → Highlight → Flags', () => {
    for (const d of DEPARTMENTS) {
      const p = PERSONAS[d.id];
      expect(p, `${d.id} persona`).toBeTruthy();
      expect(p).toContain('MANDATORY OUTPUT CONTRACT');
      const fence = p.indexOf('```json findings');
      const hi = p.indexOf('## Highlight');
      const fl = p.indexOf('## Flags');
      expect(fence).toBeGreaterThan(-1);
      expect(hi).toBeGreaterThan(fence);
      expect(fl).toBeGreaterThan(hi);
    }
  });

  it('every persona instructs the bilingual narrative with the delimiter', () => {
    for (const p of Object.values(PERSONAS)) {
      expect(p).toContain('<!-- ===EN=== -->');
    }
  });

  it('chat personas carry no report scaffolding', () => {
    for (const d of DEPARTMENTS) {
      const c = CHAT_PERSONAS[d.id];
      expect(c, `${d.id} chat persona`).toBeTruthy();
      expect(c).not.toContain('MANDATORY OUTPUT CONTRACT');
      expect(c).not.toContain('```json findings');
      expect(c).not.toContain('<!-- ===EN=== -->');
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/agents/personas.test.ts`
Expected: FAIL — `CHAT_PERSONAS` is not exported.

- [ ] **Step 3: Implement** — in `src/lib/agents/personas.ts`, delete `FINDINGS_CONTRACT` and `OUTPUT_FOOTER`, and replace `BILINGUAL_RULE`, `FINANCE_BILINGUAL_RULE`, `persona`, `financePersona` with the following (keep `AUTONOMOUS_PREAMBLE`, `PERSONAS`, `PROJECTS_BLURB` as-is; add `CHAT_PERSONAS` export):

```ts
// v1.5.0 — findings-first head contract. The machine-readable head (findings →
// Highlight → Flags → ---) is the FIRST thing every agent writes, so a run cut
// at max_tokens can never destroy the chart/KB data or the verdict. The runner
// normalizes the emitted order back to the legacy storage layout
// (bilingual.ts normalizeReportOrder), so downstream consumers are unchanged.
const OUTPUT_HEAD_CONTRACT = `

---
MANDATORY OUTPUT CONTRACT — this overrides any format described above. You MUST
OPEN your output with this exact head, in this order, BEFORE any narrative:

1) บล็อกข้อมูลสำหรับสร้างกราฟ: รั้วโค้ดขึ้นต้นว่า \`\`\`json findings (คำว่า findings ตัวพิมพ์เล็ก)
   - ใส่เฉพาะตัวเลข/รายการที่ "ค้นเจอจริง" ในรอบนี้เท่านั้น
   - ทุกตัวเลขที่มาจากการค้นเว็บ ต้องมีฟิลด์ citation: { "url": "...", "title": "...", "date": "YYYY-MM-DD" } กำกับ ถ้าไม่มีแหล่งอ้างอิงห้ามใส่
   - ถ้ารอบนี้ไม่มีข้อมูลที่ชาร์ตได้จริง ให้ใส่บล็อกว่าง: {}
   - โครงสร้างภายในบล็อกให้เป็นไปตามที่บทบาทของคุณกำหนด
2) ## Highlight — หนึ่งถึงสองประโยค: ใจความสำคัญที่สุดของงานวันนี้ (เนื้อหาเป็นภาษาไทยได้)
3) ## Flags — รายการ bullet สั้นๆ 0-3 ข้อ ของสิ่งที่แผนกอื่นต้องดำเนินการต่อ ถ้าไม่มีให้เขียนว่า "None."
4) บรรทัดคั่นที่มีเพียง: ---

Keep the two headers in English, verbatim ("## Highlight" then "## Flags"): do
not rename, translate, number, merge, or omit them, and never emit them more
than once. After the "---" line, write the full report per your role's
structure.`;

// v1.5.0 — full dual reports for the five non-finance agents, written AFTER the
// mandatory head.
const BILINGUAL_RULE = `

รายงานสองภาษา (สำคัญมาก): หลังบรรทัดคั่น --- ของส่วนหัว ให้เขียน "รายงานฉบับเต็ม" สองรอบติดกัน
1) รอบแรกเป็นภาษาไทยตามโครงสร้างรายงานในบทบาทของคุณ
2) คั่นด้วยบรรทัดที่มีเพียงข้อความนี้เป๊ะๆ บรรทัดเดียว: <!-- ===EN=== -->
3) แล้วเขียนเนื้อหาเดียวกันซ้ำเป็นภาษาอังกฤษ (สาระเท่ากัน เป็นภาษาอังกฤษธรรมชาติ ไม่ใช่แปลคำต่อคำ)
ลำดับผลลัพธ์ทั้งหมดต้องเป็น: บล็อก \`\`\`json findings → ## Highlight → ## Flags → --- → [รายงานไทยฉบับเต็ม] → <!-- ===EN=== --> → [รายงานอังกฤษฉบับเต็ม]
บล็อก findings และ Highlight/Flags มี "ชุดเดียว" ที่หัวรายงานเท่านั้น ห้ามทำซ้ำท้ายรายงาน`;

// v1.4.5 mode, reordered for the v1.5 head: Finance writes ONE full Thai analyst
// report then a SHORT English executive summary (not a full dual report).
const FINANCE_BILINGUAL_RULE = `

รายงานสองภาษาแบบ Thai-primary (สำคัญมาก): หลังบรรทัดคั่น --- ของส่วนหัว
1) เขียน "รายงานฉบับเต็ม" เป็นภาษาไทยตามโครงสร้างในบทบาท
2) คั่นด้วยบรรทัดที่มีเพียงข้อความนี้เป๊ะๆ บรรทัดเดียว: <!-- ===EN=== -->
3) แล้วเขียน "บทสรุปผู้บริหารฉบับย่อ" เป็นภาษาอังกฤษ ความยาว 150-250 คำเท่านั้น (verdict + ตัวเลขสำคัญ + ข้อควรระวัง) — ไม่ใช่การแปลทั้งฉบับ
ลำดับผลลัพธ์ทั้งหมดต้องเป็น: บล็อก \`\`\`json findings → ## Highlight → ## Flags → --- → [รายงานไทยฉบับเต็ม] → <!-- ===EN=== --> → [EN summary สั้น]
บล็อก findings และ Highlight/Flags มี "ชุดเดียว" ที่หัวรายงานเท่านั้น ห้ามทำซ้ำท้ายรายงาน`;

const persona = (role: string): string => `${AUTONOMOUS_PREAMBLE}${role}${BILINGUAL_RULE}${OUTPUT_HEAD_CONTRACT}`;
const financePersona = (role: string): string =>
  `${AUTONOMOUS_PREAMBLE}${role}${FINANCE_BILINGUAL_RULE}${OUTPUT_HEAD_CONTRACT}`;

// v1.5.0 — Telegram /ask + focus-session follow-ups. A chat answer needs none of
// the report scaffolding (with the head contract it would LEAD with a JSON block
// in chat). Preamble + brief + a short chat instruction only.
const CHAT_RULE = `

โหมดแชต: ตอบคำถามตรงๆ กระชับ เป็นภาษาเดียวกับคำถาม อ้างอิงแหล่ง+วันที่เมื่อค้นเว็บ ไม่ต้องใช้โครงสร้างรายงาน ไม่ต้องมีบล็อก findings หรือหัวข้อ Highlight/Flags`;

const chatPersona = (role: string): string => `${AUTONOMOUS_PREAMBLE}${role}${CHAT_RULE}`;

export const CHAT_PERSONAS: Record<DeptId, string> = {
  ceo: chatPersona(ROLES.ceo),
  cyb: chatPersona(ROLES.cyb),
  mkt: chatPersona(ROLES.mkt),
  rnd: chatPersona(ROLES.rnd),
  ops: chatPersona(ROLES.ops),
  fin: chatPersona(ROLES.fin),
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/agents/personas.test.ts src/lib/agents/roles.test.ts`
Expected: PASS. (`roles.test.ts` asserts the brief is embedded in the persona — the preamble+brief prefix is unchanged, so it stays green.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/personas.ts src/lib/agents/personas.test.ts
git commit -m "feat(personas): findings-first head contract + scaffolding-free chat personas"
```

---

### Task 4: Telegram chat path uses CHAT_PERSONAS

**Files:**
- Modify: `src/app/api/telegram/route.ts` (import line 9; call sites lines ~55 and ~122)

- [ ] **Step 1: Implement** — three edits:

Line 9: `import { PERSONAS } from '@/lib/agents/personas';` → `import { CHAT_PERSONAS } from '@/lib/agents/personas';`

Focus follow-up (~line 55): `system: PERSONAS[session.dept as keyof typeof PERSONAS]` → `system: CHAT_PERSONAS[session.dept as keyof typeof CHAT_PERSONAS]`

`/ask` (~line 122): `system: PERSONAS[id]` → `system: CHAT_PERSONAS[id]`

- [ ] **Step 2: Verify** — the route has no unit tests; gate with the compiler:

Run: `npx tsc --noEmit && grep -c "CHAT_PERSONAS" src/app/api/telegram/route.ts`
Expected: tsc clean; grep prints `3`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/telegram/route.ts
git commit -m "feat(telegram): /ask + follow-ups use scaffolding-free chat personas"
```

---

### Task 5: Budgets 8000 + "open with findings" prompt phrasing

**Files:**
- Modify: `src/lib/agents/cyberx.ts`, `marketing.ts`, `rnd.ts`, `operations.ts`, `ceo.ts` (maxTokens + prompt tail), `finance.ts` (prompt tail only)
- Test: `src/lib/agents/cyberx.test.ts`, `marketing.test.ts`, `rnd.test.ts`, `operations.test.ts`, `ceo.test.ts`

- [ ] **Step 1: Update the budget assertions (failing first)** — in each of the five test files change `maxTokens: 4000` to `maxTokens: 8000` inside the `expect.objectContaining(...)`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/agents/cyberx.test.ts src/lib/agents/marketing.test.ts src/lib/agents/rnd.test.ts src/lib/agents/operations.test.ts src/lib/agents/ceo.test.ts`
Expected: 5 FAILs (one budget assertion per file).

- [ ] **Step 3: Implement** — in each of the five dept modules change `maxTokens: 4000,` → `maxTokens: 8000,`. Then update the prompt's findings phrase ("attach at the end" → "open with"):

`cyberx.ts`: `แล้วแนบบล็อก \`\`\`json findings ตามสคีมาในบทบาทของคุณ` → `เปิดรายงานด้วยบล็อก \`\`\`json findings ตามสคีมาในบทบาทของคุณ`
`marketing.ts`: `และแนบบล็อก \`\`\`json findings ตามสคีมาในบทบาทของคุณ` → `และเปิดรายงานด้วยบล็อก \`\`\`json findings ตามสคีมาในบทบาทของคุณ`
`rnd.ts`: `แล้วแนบบล็อก \`\`\`json findings ตามสคีมาในบทบาทของคุณ` → `เปิดรายงานด้วยบล็อก \`\`\`json findings ตามสคีมาในบทบาทของคุณ`
`operations.ts`: `แล้วแนบบล็อก \`\`\`json findings ตามสคีมาในบทบาทของคุณ` → `เปิดรายงานด้วยบล็อก \`\`\`json findings ตามสคีมาในบทบาทของคุณ`
`ceo.ts`: `แล้วแนบบล็อก \`\`\`json findings (decisions/risks/priorities) ตามสคีมาในบทบาทของคุณ` → `เปิดรายงานด้วยบล็อก \`\`\`json findings (decisions/risks/priorities) ตามสคีมาในบทบาทของคุณ`
`finance.ts`: `แล้วเขียนรายงานตามโครงสร้างในบทบาท แล้วแนบบล็อก \`\`\`json findings ตามสคีมา` → `เปิดรายงานด้วยบล็อก \`\`\`json findings ตามสคีมา แล้วเขียนรายงานตามโครงสร้างในบทบาท`

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/agents/cyberx.test.ts src/lib/agents/marketing.test.ts src/lib/agents/rnd.test.ts src/lib/agents/operations.test.ts src/lib/agents/ceo.test.ts src/lib/agents/finance.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/*.ts
git commit -m "feat(agents): 8000-token analyst budgets + open-with-findings prompts"
```

---

### Task 6: The five brief template sections

**Files:**
- Modify: `.agents/CyberX Agent.md`, `.agents/Marketing & Social Media Agent.md`, `.agents/AI R&D Agent.md`, `.agents/Operation Agent.md`, `.agents/CEO Agent.md`

Insert each block below **immediately before** the brief's `## โครงสร้าง findings (สำหรับบล็อก json findings)` heading (CEO's is at line 78; the others near their file ends), followed by a blank line. Do not modify any existing line — `roles.test.ts` loads the file verbatim, so appending is automatically covered.

- [ ] **Step 1: CyberX** — insert into `.agents/CyberX Agent.md`:

```markdown
## โครงสร้างรายงานฉบับวิเคราะห์ (บังคับใช้ทุกรอบอัตโนมัติ)

เขียนรายงานภัยคุกคามระดับนักวิเคราะห์ตามลำดับนี้ **ห้ามข้ามหัวข้อ**:

1. **สรุปผู้บริหาร (กล่อง Verdict)** — ระดับความเสี่ยงรวมวันนี้ (🔴/🟡/🟢) · CVE/ภัยคุกคามที่วิกฤตที่สุด + เหตุผล 1 ประโยค · การกระทำเร่งด่วนที่สุดของวันนี้ นำด้วยข้อสรุปเสมอ
2. **ภาพรวมภัยคุกคาม** — สถานการณ์ 24-48 ชม. และความเกี่ยวข้องกับสแตกของบริษัท (Next.js · Vercel · Upstash Redis · GitHub · Telegram)
3. **ตารางเปรียบเทียบภัยคุกคาม 3–5 รายการ** — CVE · CVSS · ผลิตภัณฑ์ที่กระทบ · ความเกี่ยวข้องกับสแตกเรา (สูง/กลาง/ต่ำ) · การกระทำ (มีบรรทัด "ที่มา: …" ใต้ตาราง)
4. **บทวิเคราะห์รายภัยคุกคาม** — หัวข้อย่อยต่อรายการ: เวกเตอร์การโจมตี · เงื่อนไขที่ทำให้ถูกโจมตี · สถานะ KEV/exploit จริง · mitigation เป็นขั้นตอน
5. **คำแนะนำแบบ traffic-light** — 🔴 ทำวันนี้ · 🟡 ภายในสัปดาห์ · 🟢 เฝ้าระวัง
6. **ความเสี่ยง + ข้อจำกัด** — ข้อมูล ณ วันที่ค้น · ความครอบคลุมของฟีด · สิ่งที่ยังไม่ได้รับการยืนยัน
7. **แหล่งอ้างอิง** — รายการ "ชื่อเอกสาร — วันที่ — URL" ของทุกรายการ

กฎการเขียน: นำด้วยข้อสรุปเสมอ · ทุกตัวเลข/CVE ต้องมีแหล่ง+วันที่ · ถ้าไม่พบข้อมูลให้บอกตรงๆ ห้ามแต่ง · ใช้ตารางเมื่อเปรียบเทียบ
```

- [ ] **Step 2: Marketing** — insert into `.agents/Marketing & Social Media Agent.md`:

```markdown
## โครงสร้างรายงานฉบับวิเคราะห์ (บังคับใช้ทุกรอบอัตโนมัติ)

เขียนรายงานดีมานด์+แผนคอนเทนต์ระดับนักวิเคราะห์ตามลำดับนี้ **ห้ามข้ามหัวข้อ**:

1. **สรุปผู้บริหาร (กล่อง Verdict)** — เทรนด์ดีมานด์อันดับหนึ่งของวันนี้ + การเล่นที่แนะนำ (recommended play) 1-2 ประโยค นำด้วยข้อสรุปเสมอ
2. **ภาพรวมดีมานด์** — สัญญาณจาก engagement จริง (Hacker News · Dev.to · เว็บ) เชื่อมโยงกับโปรเจกต์ของบริษัท
3. **ตารางสัญญาณ 3–6 รายการ** — หัวข้อ · แหล่ง · engagement (ตัวเลขจริง) · ความเกี่ยวข้องกับเรา (มีบรรทัด "ที่มา: …" ใต้ตาราง)
4. **แผนคอนเทนต์รายช่องทาง** — หัวข้อย่อย "## X post" · "## LinkedIn post" · "## Blog idea" พร้อมดราฟต์/โครงร่างที่ผูกกับสัญญาณในตาราง
5. **การวัดผล** — ตัวชี้วัดที่จะตามดูรอบหน้า (พร้อมตัวเลขฐานปัจจุบันถ้ามี)
6. **ความเสี่ยง + ข้อจำกัด** — เทรนด์เปลี่ยนเร็ว · engagement ณ เวลาที่ค้น · ช่องว่างของข้อมูล
7. **แหล่งอ้างอิง** — รายการ "ชื่อเอกสาร — วันที่ — URL" ของทุกสัญญาณ

กฎการเขียน: นำด้วยข้อสรุปเสมอ · ทุก engagement ต้องเป็นตัวเลขจริง+แหล่ง+วันที่ · ถ้าไม่พบให้บอกตรงๆ ห้ามแต่ง · ใช้ตารางเมื่อเปรียบเทียบ
```

- [ ] **Step 3: R&D** — insert into `.agents/AI R&D Agent.md`:

```markdown
## โครงสร้างรายงานฉบับวิเคราะห์ (บังคับใช้ทุกรอบอัตโนมัติ)

เขียนรายงาน Research Radar ระดับนักวิเคราะห์ตามลำดับนี้ **ห้ามข้ามหัวข้อ**:

1. **สรุปผู้บริหาร (กล่อง Verdict)** — ตัวเลือกของวัน + คำตัดสิน adopt/trial/assess/hold + เหตุผล 1 ประโยค นำด้วยข้อสรุปเสมอ
2. **ภาพรวมโฟกัสประจำรอบ** — โฟกัสวันนี้คืออะไร ทำไมสำคัญกับบริษัทตอนนี้
3. **ตารางผู้เข้าชิง 3–5 รายการ** — ชื่อ · ชนิด (repo/paper/release) · ดาว/กิจกรรม · คะแนนเกณฑ์ 4 ข้อ (มีบรรทัด "ที่มา: …" ใต้ตาราง)
4. **บทวิเคราะห์รายตัวเทียบ rubric** — หัวข้อย่อยต่อรายการ ให้คะแนนตามเกณฑ์ 4 ข้อเดิมของบทบาท (≥14 adopt · 10-13 trial · <10 assess/hold) แสดงคะแนนเป็นตัวเลข
5. **คำแนะนำการรับมาใช้** — ตัวที่แนะนำ + ภาพร่างการ integrate กับโปรเจกต์ของบริษัท (ขั้นตอนสั้นๆ)
6. **ความเสี่ยง + ข้อจำกัด** — ความใหม่ของโปรเจกต์ · maintenance risk · สิ่งที่ยังไม่ได้ทดสอบจริง
7. **แหล่งอ้างอิง** — รายการ "ชื่อเอกสาร — วันที่ — URL" ของทุกรายการ

กฎการเขียน: นำด้วยข้อสรุปเสมอ · ทุกคะแนน/ตัวเลขต้องมีแหล่ง+วันที่ · ถ้าไม่พบให้บอกตรงๆ ห้ามแต่ง · ใช้ตารางเมื่อเปรียบเทียบ
```

- [ ] **Step 4: Operations** — insert into `.agents/Operation Agent.md`:

```markdown
## โครงสร้างรายงานฉบับวิเคราะห์ (บังคับใช้ทุกรอบอัตโนมัติ)

เขียนรายงานสุขภาพระบบระดับนักวิเคราะห์ตามลำดับนี้ **ห้ามข้ามหัวข้อ**:

1. **สรุปผู้บริหาร (กล่อง Verdict)** — สถานะรวม (🟢/🟡/🔴) + "สิ่งเดียวที่ควรแก้วันนี้" + เหตุผล 1 ประโยค นำด้วยข้อสรุปเสมอ
2. **ตาราง scorecard ระบบ** — ระบบ/โดเมน · สถานะ · deploy ล่าสุด · CI (มีบรรทัด "ที่มา: …" ใต้ตาราง)
3. **บทวิเคราะห์รายระบบ** — หัวข้อย่อยต่อระบบ: อาการ · สาเหตุที่เป็นไปได้ · หลักฐาน (ตัวเลข/สถานะจริง)
4. **แผนการกระทำ** — เรียงตามลำดับความสำคัญ ระบุว่าแผนกไหนควรทำต่อ
5. **ความเสี่ยง + ข้อจำกัด** — ช่องว่างของ visibility · ข้อมูล ณ เวลาที่ตรวจ · สิ่งที่ตรวจไม่ได้
6. **แหล่งอ้างอิง** — รายการ "ชื่อเอกสาร — วันที่ — URL" (status page / changelog ที่ใช้จริง)

กฎการเขียน: นำด้วยข้อสรุปเสมอ · ทุกสถานะ/ตัวเลขต้องมาจากข้อมูลจริงในรอบนี้ · ถ้าตรวจไม่ได้ให้บอกตรงๆ ห้ามแต่ง · ใช้ตารางเมื่อเปรียบเทียบ
```

- [ ] **Step 5: CEO** — insert into `.agents/CEO Agent.md` (note: keeps the `## Summary` and `## Decisions` headings — `ceo.ts` `parseDecisions(markdown)` falls back to the `## Decisions` section when findings are empty):

```markdown
## โครงสร้างรายงานฉบับวิเคราะห์ (บังคับใช้ทุกรอบอัตโนมัติ)

เขียนบทสังเคราะห์ผู้บริหารตามลำดับนี้ **ห้ามข้ามหัวข้อ** (คงหัวข้อ "## Summary" และ "## Decisions" เป็นภาษาอังกฤษ):

1. **## Summary (กล่อง Verdict)** — ท่าทีของบริษัทสัปดาห์นี้ 3-4 ประโยค เชื่อมโยงกิจกรรมล่าสุดของทุกแผนก นำด้วยข้อสรุปเสมอ
2. **ตาราง digest รายแผนก** — แผนก · highlight ล่าสุด · flags ที่ค้าง (จากข้อมูลภายในรอบนี้)
3. **การเชื่อมโยงข้ามแผนก** — งานของแผนกไหนส่งผล/ต่อยอดถึงแผนกไหน อย่างน้อย 2 ข้อ
4. **## Decisions** — การตัดสินใจ 2-3 ข้อ ลงมือได้จริง อ้างถึงผลงานของแผนกที่เจาะจง
5. **ความเสี่ยง + ลำดับความสำคัญ** — ความเสี่ยงที่ต้องจับตา + ลำดับงานถัดไป
6. **แหล่งอ้างอิง** — ผลงานภายในของแผนกที่ใช้สังเคราะห์ (ระบุแผนก + วันที่ ไม่ต้องมี URL)

กฎการเขียน: นำด้วยข้อสรุปเสมอ · อ้างแผนก+วันที่ของข้อมูลภายในทุกครั้ง · ถ้าข้อมูลแผนกใดขาดให้บอกตรงๆ ห้ามแต่ง
```

- [ ] **Step 6: Verify**

Run: `npx vitest run src/lib/agents/roles.test.ts src/lib/agents/personas.test.ts`
Expected: PASS — `roles.test.ts` re-reads the edited files verbatim; `personas.test.ts` head-order assertions still hold (the new brief sections contain no ` ```json findings ` fence and no `## Highlight`).

- [ ] **Step 7: Commit**

```bash
git add .agents/
git commit -m "feat(briefs): analyst report templates for CyberX, Marketing, R&D, Operations, CEO"
```

---

### Task 7: Docs, version, full gates, push

**Files:**
- Modify: `CLAUDE.md`, `package.json`

- [ ] **Step 1:** `npm version 1.5.0 --no-git-tag-version`

- [ ] **Step 2: CLAUDE.md** — change the overview line `**Current version: 1.4.11**` → `**Current version: 1.5.0**` (and "newest 1.4.11 back to 1.4" → "newest 1.5.0 back to 1.4"); move the `(current)` marker off the v1.4.8–v1.4.11 paragraph; insert a new paragraph above it:

```markdown
**v1.5.0 (current) — Analyst-report rollout + findings-first contract.** Completes Phase 4 of the v1.5 spec. **(1) Findings-first head:** all six agents now OPEN their output with the machine-readable head — ` ```json findings ` → `## Highlight` → `## Flags` → a `---` separator — before the narrative, so a run cut at `max_tokens` can never destroy the chart/KB data or the verdict again. `personas.ts` merged `FINDINGS_CONTRACT`+`OUTPUT_FOOTER` into one `OUTPUT_HEAD_CONTRACT`; storage layout is UNCHANGED — `bilingual.ts` `normalizeReportOrder()` (called once in `runner.ts`) reassembles emitted output into the legacy narrative-first shape, so dashboards, exports, `/api/kb`, and pre-v1.5 entries are untouched (legacy/non-compliant output passes through). **(2) Analyst templates:** the five non-finance briefs each gained an appended "โครงสร้างรายงานฉบับวิเคราะห์" section (verdict box → comparison table → per-item analysis → recommendations → risks → sources; existing role content untouched), with **full dual TH/EN reports** at `maxTokens: 8000` (Finance keeps its v1.4.5 Thai-primary + short-EN mode). Findings schemas, validators, and chart builders are unchanged. **(3) Chat personas:** Telegram `/ask` + focus follow-ups use new scaffolding-free `CHAT_PERSONAS` so chat answers don't lead with a JSON block. See `docs/superpowers/specs/2026-06-12-v150-analyst-rollout-design.md`.
```

Also rewrite the Key Constraints footer bullet (begins `- Every agent report MUST end with`) to:

```markdown
- Every agent report MUST OPEN with the machine-readable head: a ` ```json findings ` block, then `## Highlight`, then `## Flags` (English headers, Thai body), then a `---` separator, then the narrative (v1.5 — previously this footer was at the END). `personas.ts` `OUTPUT_HEAD_CONTRACT` enforces it as a hard, format-overriding contract; `personas.test.ts` guards it; `runner.ts` normalizes the emitted order back to the narrative-first storage layout via `bilingual.ts` `normalizeReportOrder()` before parsing/storing, and each `parse<Dept>Findings()` parses the block.
```

- [ ] **Step 3: Full gates**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green (≈260 tests).

- [ ] **Step 4: Commit + push**

```bash
git add -A
git commit -m "release: v1.5.0 — analyst-report rollout + findings-first contract"
git push origin main
```

- [ ] **Step 5: Live verification (after Vercel deploy)** — poll `https://company.nanoteofficial.me/` for `1.5.0`; the first new-format cron runs are CyberX (daily 10:00 UTC) and Finance (Mon/Wed/Fri 11:00 UTC). Check `/api/dashboard`: the new run's `output.markdown` must START with the Thai narrative (not the findings fence), `highlight` non-empty, artifacts present. Both arrive as KB `draft`s for admin review.

---

## Self-Review

- **Spec coverage:** §3 contract (Tasks 3, 5-prompts) · §3 normalize-on-ingest (Tasks 1, 2) · §4 Telegram (Task 4) · §5 templates (Task 6) · §6 budgets (Task 5) · §7 tests (Tasks 1–3, 5, 6) · §10 verification (Task 7). ✓
- **Placeholder scan:** all code/content blocks complete; no TBDs. ✓
- **Type consistency:** `normalizeReportOrder` defined Task 1, consumed Task 2; `CHAT_PERSONAS` defined Task 3, consumed Task 4; budget value 8000 consistent across Task 5 tests/impl. ✓
- **Invariant check:** `roles.test.ts` untouched (briefs edited, loaded verbatim); findings schemas/validators/chart builders untouched; storage layout unchanged. ✓
