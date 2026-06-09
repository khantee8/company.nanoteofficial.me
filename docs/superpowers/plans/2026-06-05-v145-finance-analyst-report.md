# v1.4.5 — Finance Analyst-Grade Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Finance agent produce a complete, sectioned, cited Thai mutual-fund **analyst report** (with a short English summary) that is never silently truncated and is stored as a reusable, data-driven KB record.

**Architecture:** Three phases. (1) **Engine** — stream the Claude call, surface `stop_reason`, raise the Finance budget, and flag truncated runs instead of storing them as clean. (2) **Report** — edit the Finance brief into the sectioned template from the `earnings-analysis` skill (Thai-primary + short EN), and extend the deterministic chart builders. (3) **Deliverable** — upgrade the per-agent PDF export to a sectioned layout. Other 5 agents are untouched (rollout is a later version).

**Tech Stack:** Next.js 16, React 19, TypeScript, `@anthropic-ai/sdk` (Sonnet 4.6, streaming), Upstash Redis, Vitest. Decisions locked for this version: **Thai-primary + ~150–250-word EN summary**, **~2,000–2,800-word Thai report**, **`claude-sonnet-4-6`**, **PDF in Phase 3**.

**Reference:** `docs/superpowers/specs/2026-06-05-v15-finance-analyst-report-design.md` and the installed `earnings-analysis` skill (`equity-research@claude-for-financial-services`).

**Deviation from spec, on purpose:** the spec proposed reordering the shared output contract (findings-first) so reuse-data survives truncation. That contract is shared by all 6 agents; reordering it now would destabilize the other 5. Instead, Phase 1 makes truncation *not happen* (adequate budget + streaming) and *visible* (`stop_reason` guard). The findings-first reorder stays a future, all-agent change. Likewise the report template is authored **into `.agents/Finance Agent.md`** (the brief IS the spec, loaded verbatim by `roles.ts`) rather than a new `references/` loader — fewer moving parts.

---

## File Structure

- `src/lib/claude.ts` — add `completeRaw()` returning `{ text, stopReason, usage }` (streamed); keep `complete()` as a string wrapper.
- `src/lib/agents/types.ts` — add `incomplete?: boolean` to `AgentRunResult`, `AgentOutput`, and the KB entry type.
- `src/lib/agents/finance.ts` — call `completeRaw`, set `incomplete`, raise `maxTokens`, extend `financeArtifacts()`.
- `src/lib/agents/runner.ts` — read `result.incomplete`; warn + persist the flag; never present a cut-off run as clean.
- `src/lib/agents/personas.ts` — Finance-specific persona: Thai-primary + short-EN bilingual rule.
- `.agents/Finance Agent.md` — the sectioned report template + writing rules (the "SKILL.md").
- `src/lib/agents/finance.test.ts` — chart-builder + truncation-flag tests.
- `src/components/AgentDetail.tsx` — sectioned PDF export (Phase 3).
- `package.json` / `CLAUDE.md` — version bump.

---

## PHASE 1 — Engine (truncation root cause)

### Task 1: `completeRaw()` — stream + surface stop_reason

**Files:**
- Modify: `src/lib/claude.ts`

- [ ] **Step 1: Add a streamed, detailed completion fn.** Insert after `textOf` and change `complete` to wrap it:

```ts
export interface CompleteResult {
  text: string;
  stopReason: string | null;
  usage: { input: number; output: number };
}

/** Streamed completion that surfaces stop_reason + usage. Streaming avoids
 *  HTTP timeouts on the large max_tokens an analyst report needs. */
export async function completeRaw(opts: CompleteOpts): Promise<CompleteResult> {
  const { system, prompt, model = MODEL, maxTokens = 1500, webSearch = false, maxSearches = 5 } = opts;
  const tools: Anthropic.Messages.Tool[] | undefined = webSearch
    ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches } as unknown as Anthropic.Messages.Tool]
    : undefined;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const stream = client().messages.stream({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
        ...(tools ? { tools } : {}),
      });
      const msg = await stream.finalMessage();
      return {
        text: textOf(msg),
        stopReason: msg.stop_reason,
        usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens },
      };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (status && status < 500 && status !== 429) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}
```

- [ ] **Step 2: Make `complete()` reuse it (backward compatible).** Replace the body of `complete()`:

```ts
export async function complete(opts: CompleteOpts): Promise<string> {
  return (await completeRaw(opts)).text;
}
```

- [ ] **Step 3: Type-check.** Run: `npx tsc --noEmit` — Expected: exit 0. (The other 5 dept modules keep calling `complete()` unchanged; they now stream internally too.)
- [ ] **Step 4: Commit.**

```bash
git add src/lib/claude.ts
git commit -m "feat(finance): streamed completeRaw() surfacing stop_reason + usage"
```

### Task 2: Carry an `incomplete` flag end-to-end

**Files:**
- Modify: `src/lib/agents/types.ts`

- [ ] **Step 1: Add the flag to the three shapes.** In `AgentRunResult` add `incomplete?: boolean;`. In `AgentOutput` add `incomplete?: boolean;`. In the KB entry type (the one written by `pushKb`) add `incomplete?: boolean;`.

```ts
// AgentRunResult
  /** v1.4.5 — true when the model hit max_tokens and the report was cut off. */
  incomplete?: boolean;
```
(repeat the field on `AgentOutput` and the KB entry interface)

- [ ] **Step 2: Type-check.** Run: `npx tsc --noEmit` — Expected: exit 0 (optional field, no break).
- [ ] **Step 3: Commit.** `git commit -am "feat(agents): incomplete flag on run result / output / kb"`

### Task 3: Finance uses `completeRaw`, raises budget, flags truncation

**Files:**
- Modify: `src/lib/agents/finance.ts`
- Test: `src/lib/agents/finance.test.ts`

- [ ] **Step 1: Write the failing test** (truncation flag propagates). Add to `finance.test.ts`:

```ts
import { run } from './finance';
// ... existing imports/mocks ...

it('flags an incomplete run when the model hits max_tokens', async () => {
  vi.spyOn(claudeMod, 'completeRaw').mockResolvedValue({
    text: '...report...\n```json findings\n{"theme":"x","funds":[]}\n```',
    stopReason: 'max_tokens',
    usage: { input: 10, output: 8000 },
  });
  const result = await run({ /* minimal AgentContext fixture */ } as any);
  expect(result.incomplete).toBe(true);
});
```
(Use the existing test's mock pattern for `AgentContext`; import the claude module as `claudeMod`.)

- [ ] **Step 2: Run it to verify it fails.** Run: `npx vitest run src/lib/agents/finance.test.ts -t "incomplete"` — Expected: FAIL (`run` still calls `complete`, no `incomplete` field).

- [ ] **Step 3: Switch `run()` to `completeRaw` + raise budget + set flag.** In `finance.ts`, change the import and the call:

```ts
import { completeRaw } from '@/lib/claude';
// ...
const { text: rawMarkdown, stopReason } = await completeRaw({
  system: PERSONAS.fin,
  prompt: `${context ? context + '\n\n---\n\n' : ''}ธีมประจำรอบวันนี้: **${label}** (theme: ${theme}).\nค้นหาและเปรียบเทียบกองทุนรวมไทยจริง 3-5 กองในธีมนี้ พร้อมค่าธรรมเนียม กองแม่ AUM และผลตอบแทน อ้างอิงแหล่ง+วันที่ทุกตัวเลข แล้วเขียนรายงานตามโครงสร้างในบทบาท แล้วแนบบล็อก \`\`\`json findings ตามสคีมา`,
  webSearch: true,
  maxSearches: 6,
  maxTokens: 8000,
});
const markdown = rawMarkdown;
const findings = parseFinanceFindings(markdown) ?? { theme, funds: [] };
// ... unchanged ...
return {
  markdown,
  // ... unchanged fields ...
  incomplete: stopReason === 'max_tokens',
  meta: { theme, fundCount: findings.funds.length, stopReason },
};
```

- [ ] **Step 4: Run the test to verify it passes.** Run: `npx vitest run src/lib/agents/finance.test.ts` — Expected: PASS (all, including existing).

- [ ] **Step 5: Commit.** `git commit -am "feat(finance): analyst-report budget (8k), stream, truncation flag"`

### Task 4: Runner surfaces truncated runs (never silently clean)

**Files:**
- Modify: `src/lib/agents/runner.ts`

- [ ] **Step 1: Persist + warn on incomplete.** In `runAgent()`, after `const related = ...` add:

```ts
const incomplete = result.incomplete ?? false;
```
Add `incomplete` to the `setOutput` and `pushKb` payloads:
```ts
repo.setOutput({ dept, markdown, markdownEn, summary: result.summary, ts, category, tags, artifacts, meta: result.meta, incomplete }),
// ...
repo.pushKb({ id, slug, dept, date, ts, category, theme,
  tags, status: 'draft', summary: result.summary, highlight, flags, artifacts,
  sources, provenance, related, markdown, markdownEn, incomplete }),
```
And make the Telegram notice explicit when cut off:
```ts
const warn = incomplete ? '\n⚠️ รายงานถูกตัด (max_tokens) — ตรวจก่อนเผยแพร่' : '';
await notify(`*${dept.toUpperCase()}* ✓ ${result.summary}${warn}\n\n${markdown.slice(0, 800)}`);
```

- [ ] **Step 2: Type-check + tests.** Run: `npx tsc --noEmit && npm test` — Expected: exit 0, all green (KB entries already default to `draft`, so an incomplete run stays gated).

- [ ] **Step 3: Commit.** `git commit -am "feat(runner): persist + warn on truncated (incomplete) agent runs"`

---

## PHASE 2 — Report quality (the analyst output)

### Task 5: Finance-specific persona — Thai-primary + short EN summary

**Files:**
- Modify: `src/lib/agents/personas.ts`
- Modify: `src/lib/agents/personas.test.ts` (parity guard)

- [ ] **Step 1: Add a Finance bilingual rule + assembly.** In `personas.ts`, add a Finance-only rule and use it for `fin` (leave the shared `BILINGUAL_RULE` for the other five):

```ts
// Finance writes ONE full Thai report, then a SHORT English executive summary
// (not a full dual report) — halves output size and matches the single-language
// analyst format. The shared findings + Highlight/Flags tail still appears once.
const FINANCE_BILINGUAL_RULE = `

รายงานสองภาษาแบบ Thai-primary (สำคัญมาก):
1) เขียน "รายงานฉบับเต็ม" เป็นภาษาไทยตามโครงสร้างในบทบาท
2) คั่นด้วยบรรทัดที่มีเพียงข้อความนี้เป๊ะๆ บรรทัดเดียว: <!-- ===EN=== -->
3) แล้วเขียน "บทสรุปผู้บริหารฉบับย่อ" เป็นภาษาอังกฤษ ความยาว 150-250 คำเท่านั้น (verdict + ตัวเลขสำคัญ + ข้อควรระวัง) — ไม่ใช่การแปลทั้งฉบับ
ลำดับผลลัพธ์: [รายงานไทยฉบับเต็ม] → <!-- ===EN=== --> → [EN summary สั้น] → บล็อก \`\`\`json findings → ## Highlight → ## Flags
findings และสองหัวข้อปิดท้ายให้มี "ชุดเดียว" หลัง EN summary เท่านั้น`;

const financePersona = (role: string): string =>
  `${AUTONOMOUS_PREAMBLE}${role}${FINDINGS_CONTRACT}${FINANCE_BILINGUAL_RULE}${OUTPUT_FOOTER}`;
```
Then change the registry line:
```ts
  fin: financePersona(ROLES.fin),
```

- [ ] **Step 2: Keep parity tests green.** If `personas.test.ts` asserts every persona contains the shared footer/findings markers, those still hold (Finance keeps `FINDINGS_CONTRACT` + `OUTPUT_FOOTER`). Run: `npx vitest run src/lib/agents/personas.test.ts` — Expected: PASS. If a test asserts the *shared* `BILINGUAL_RULE` text appears in `fin`, relax it to check the `<!-- ===EN=== -->` delimiter instead.

- [ ] **Step 3: Commit.** `git commit -am "feat(finance): Thai-primary + short-EN persona"`

### Task 6: Author the sectioned report template into the brief

**Files:**
- Modify: `.agents/Finance Agent.md`
- Modify: `src/lib/agents/roles.test.ts` is **not** edited — it asserts `ROLES.fin` equals the file verbatim, so it stays valid automatically.

- [ ] **Step 1: Replace the "รูปแบบการตอบ" + "ภารกิจประจำรอบ" sections with the analyst template.** Append/replace so the brief instructs this exact structure (conclusion-first, quantified, cited), adapted from the `earnings-analysis` template:

```markdown
## โครงสร้างรายงานฉบับวิเคราะห์ (บังคับใช้ทุกรอบอัตโนมัติ)

เขียนรายงานระดับนักวิเคราะห์ ยาวประมาณ 2,000–2,800 คำ ตามลำดับนี้ **ห้ามข้ามหัวข้อ**:

1. **สรุปผู้บริหาร (กล่อง Verdict)** — ธีมวันนี้ · "กองคุ้มที่สุด" · กอง TER ต่ำสุด · กองผลตอบแทน 1 ปีสูงสุด · กองที่แนะนำ + เหตุผล trade-off (1–2 ประโยค) นำด้วยข้อสรุปเสมอ
2. **ภาพรวมธีม + การแมปสินทรัพย์** — ธีมนี้ตรงกับ index/underlying อะไร อธิบาย feeder fund สั้นๆ
3. **ตารางเปรียบเทียบกอง 3–5 กอง** — ชื่อ · บลจ. · TER% · กองแม่ · ป้องกันค่าเงิน · AUM · ผลตอบแทน 1 ปี · ประเภทภาษี (มีบรรทัด "ที่มา: …" ใต้ตาราง)
4. **บทวิเคราะห์รายเกณฑ์** — หัวข้อย่อยสั้นๆ ของแต่ละเกณฑ์: ค่าธรรมเนียม · กองแม่/underlying · ขนาดกอง (AUM) · tracking error · ป้องกันค่าเงิน · ผลตอบแทนย้อนหลัง · สภาพคล่อง ทุกข้อสรุปเป็นตัวเลข ("TER 0.55% ต่ำกว่าค่ามัธยฐานกลุ่ม 0.75%" ไม่ใช่ "ค่าธรรมเนียมต่ำ")
5. **คำแนะนำแบบ trade-off** — ใครเหมาะกับกองต้นทุนต่ำสุด / ผลตอบแทนเด่น / ลดหย่อนภาษี — ห้ามฟันธง "ต้องซื้อกองนี้"
6. **ความเสี่ยง + ข้อจำกัด** — ผลตอบแทนอดีตไม่การันตีอนาคต · ค่าธรรมเนียม/ผลตอบแทน ณ วันที่ค้น · ไม่ใช่คำแนะนำเฉพาะบุคคล
7. **แหล่งอ้างอิง** — รายการ "ชื่อเอกสาร — วันที่ — URL" ของทุกกอง

กฎการเขียน: นำด้วยตัวเลขเสมอ · ทุกตัวเลขต้องมีแหล่ง+วันที่ · ถ้าหาไม่เจอให้บอกตรงๆ ห้ามแต่ง · ใช้ตารางเมื่อเปรียบเทียบ

## ภารกิจประจำรอบ (โหมดอัตโนมัติ)
เลือก "ธีมประจำวัน": จันทร์ → us-index-sp500 · พุธ → global-tech-semiconductor · ศุกร์ → thai-tax-funds
ค้นข้อมูลจริงจาก Finnomena / WealthMagik / Morningstar / เว็บ บลจ. อ้างอิงแหล่ง+วันที่ทุกครั้ง ห้ามใช้ข้อมูลคริปโต
```
(Keep the existing `## โครงสร้าง findings (สำหรับบล็อก json findings)` block unchanged — the schema still drives the charts.)

- [ ] **Step 2: Verify the brief loads verbatim.** Run: `npx vitest run src/lib/agents/roles.test.ts` — Expected: PASS (asserts `ROLES.fin` === file contents).

- [ ] **Step 3: Commit.** `git commit -am "feat(finance): sectioned analyst report template in brief"`

### Task 7: Extend the deterministic charts (AUM + tax/hedge mix)

**Files:**
- Modify: `src/lib/agents/finance.ts`
- Test: `src/lib/agents/finance.test.ts`

- [ ] **Step 1: Write failing tests** for two new artifacts. Add to `finance.test.ts`:

```ts
import { financeArtifacts } from './finance';
const FX = { theme: 'thai-tax-funds', funds: [
  { name: 'A', amc: 'X', ter: 0.5, aum: 1000, masterFund: 'M', return1y: 8, hedged: true,  taxType: 'ssf'  as const, citation: { url: 'https://a', title: 'A', date: '2026-06-01' } },
  { name: 'B', amc: 'Y', ter: 0.9, aum: 500,  masterFund: 'N', return1y: 5, hedged: false, taxType: 'rmf'  as const, citation: { url: 'https://b', title: 'B', date: '2026-06-01' } },
]};
it('builds an AUM bars chart', () => {
  const a = financeArtifacts(FX);
  expect(a.some((x) => x.kind === 'bars' && /AUM/i.test(x.title))).toBe(true);
});
it('builds a tax-type donut for tax-fund themes', () => {
  const a = financeArtifacts(FX);
  expect(a.some((x) => x.kind === 'donut')).toBe(true);
});
```

- [ ] **Step 2: Run to verify fail.** Run: `npx vitest run src/lib/agents/finance.test.ts -t "AUM"` — Expected: FAIL.

- [ ] **Step 3: Add the artifacts.** In `financeArtifacts()`, before the closing `]`, add:

```ts
withProvenance({
  kind: 'bars', title: 'Fund size — AUM (ล้านบาท)', unit: 'ลบ.',
  series: f.funds.map((x) => ({ label: x.name, value: round2(x.aum) })),
}, 'web', sources),
withProvenance({
  kind: 'donut', title: 'Tax type mix',
  series: Object.entries(
    f.funds.reduce<Record<string, number>>((m, x) => ((m[x.taxType] = (m[x.taxType] ?? 0) + 1), m), {}),
  ).map(([label, value]) => ({ label, value })),
}, 'web', sources),
```
(Confirm `donut` series shape matches the `Donut` primitive's expected `{label,value}[]`; adjust to the existing `Artifact` union if the donut field is named differently.)

- [ ] **Step 4: Run to verify pass.** Run: `npx vitest run src/lib/agents/finance.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -am "feat(finance): AUM bars + tax-type donut artifacts"`

---

## PHASE 3 — Deliverable (sectioned PDF)

### Task 8: Upgrade the per-agent PDF export to a sectioned layout

**Files:**
- Modify: `src/components/AgentDetail.tsx` (`exportPdf`)

- [ ] **Step 1: Render the report as structured HTML, not a `<pre>` dump.** Replace `exportPdf` so it walks the markdown into headings/paragraphs/tables with `textContent` only (no `dangerouslySetInnerHTML`), keeps the print stylesheet, and adds a cover + footer. Reuse the existing `Markdown` parsing rules (headings `#`/`##`/`###`, `-` lists, `|` tables) to build DOM nodes:

```ts
function exportPdf(title: string, markdown: string) {
  const w = window.open('', '_blank'); if (!w) return;
  const d = w.document;
  const style = d.createElement('style');
  style.textContent =
    `body{font-family:Georgia,'Times New Roman',serif;max-width:760px;margin:36px auto;padding:0 28px;line-height:1.6;color:#111}` +
    `h1{font-size:22px;border-bottom:3px solid #1f3a6a;padding-bottom:8px;margin:0 0 4px}` +
    `h2{font-size:16px;margin:20px 0 6px;color:#1f3a6a}h3{font-size:13px;margin:14px 0 4px}` +
    `table{border-collapse:collapse;width:100%;margin:10px 0;font-size:12px}` +
    `th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}th{background:#eef2fa}` +
    `p,li{font-size:13px}footer{margin-top:28px;color:#888;font-size:11px;border-top:1px solid #ddd;padding-top:8px}`;
  d.head.appendChild(style);
  d.title = `${title} — NaNote Corp`;
  const h1 = d.createElement('h1'); h1.textContent = title; d.body.appendChild(h1);
  // walk markdown → DOM (headings/tables/lists/paragraphs) using textContent only
  renderMarkdownToDoc(d, markdown); // small local helper mirroring Markdown.tsx rules
  const footer = d.createElement('footer');
  footer.textContent = `NaNote Corp · company.nanoteofficial.me · ${new Date().toLocaleString()}`;
  d.body.appendChild(footer);
  setTimeout(() => w.print(), 350);
}
```
Implement `renderMarkdownToDoc(doc, md)` inline: split lines; `## ` → `h2`, `### ` → `h3`, `# ` → `h2`, lines starting/containing ` | ` grouped into a `<table>` (first row `<th>`), `-`/`*` → `<li>` inside `<ul>`, blank → flush, else `<p>`. All text via `el.textContent = ...`.

- [ ] **Step 2: Verify manually** — on `/dashboard/finance`, click **⤓ PDF**; the print preview shows a titled, sectioned report with a styled comparison table and a sources section (not a raw text block). (No unit test — DOM/print; verify in the dev server.)

- [ ] **Step 3: Commit.** `git commit -am "feat(finance): sectioned analyst PDF export"`

> **Charts in the PDF** (embedding the on-site SVG artifacts into the print doc) are a stretch goal deferred to a follow-up — the interactive graphs already live on `/dashboard/finance`; the PDF carries the full text + tables + sources.

---

## PHASE 4 — Version + verify

### Task 9: Bump + full verification

- [ ] **Step 1:** `package.json` `1.4.3 → 1.4.5`.
- [ ] **Step 2:** `npm run lint && npx tsc --noEmit && npm test` — all green.
- [ ] **Step 3:** Update `CLAUDE.md` "Current version" to 1.4.5 + a v1.4.5 feature line.
- [ ] **Step 4: Commit.** `git commit -am "chore(v1.4.5): Finance analyst-grade report"`

### Task 10 (follow-up, not this version): roll out to CEO → CyberX → Marketing → R&D → Operations, and the findings-first contract reorder, once Finance is proven in production.

---

## Self-Review

- **Spec coverage:** truncation fix (Tasks 1,3,4) · sectioned report (Tasks 5,6) · Thai-primary+short-EN (Task 5) · reusable KB (Tasks 2,4 — `incomplete` + existing findings/sources/artifacts) · charts (Task 7) · PDF (Task 8). ✓
- **Scope guard:** other 5 agents untouched (Finance-specific persona; shared contract unchanged). ✓
- **Invariants kept:** charts still built by `financeArtifacts()` (never freehand), `withProvenance(..,'web',sources)` enforces citations; brief-IS-spec (`roles.test.ts`) holds; no `dangerouslySetInnerHTML` in the PDF path. ✓
- **Type consistency:** `completeRaw`/`CompleteResult` used in Task 1 and consumed in Task 3; `incomplete` defined in Task 2 and written in Tasks 3–4. ✓
- **Open risk to verify during Task 7:** confirm the `donut` artifact field name against the actual `Artifact` union (`series` vs `segments`) before writing the builder.
