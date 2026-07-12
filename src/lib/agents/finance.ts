import { completeRaw, applyOverrides, type CompleteOpts, type CompleteResult } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import { extractFindingsBlock, hasCitation } from './findings';
import { normalizeTags, withProvenance, type Artifact, type Citation } from './artifacts';
import type { AgentRunResult, AgentContext } from './types';

export interface FundFinding {
  name: string; amc: string; masterFund: string;
  hedged: boolean; taxType: 'none' | 'ssf' | 'rmf' | 'thaiesg';
  /** null = the source (SEC/MCP or web) had no figure; charts skip null values. */
  ter: number | null; aum: number | null; return1y: number | null;
  citation: Citation;
}
export interface FinanceFindings { theme: string; funds: FundFinding[] }

const FINANCE_MODEL = 'claude-sonnet-4-6';

const THEME_BY_DOW: Record<number, { theme: string; label: string }> = {
  1: { theme: 'us-index-sp500', label: 'กองดัชนีสหรัฐ / S&P500' },
  3: { theme: 'global-tech-semiconductor', label: 'เทคโนโลยีโลก / เซมิคอนดักเตอร์' },
  5: { theme: 'thai-tax-funds', label: 'กองลดหย่อนภาษี SSF/RMF/Thai ESG' },
};
export function themeForToday(d = new Date()): { theme: string; label: string } {
  return THEME_BY_DOW[d.getUTCDay()] ?? THEME_BY_DOW[1];
}

const finiteOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Validate the model's findings block; drop any fund without a real citation.
 *  Numbers are individually optional (v1.12.1) — when the SEC/MCP source is
 *  down, web research rarely yields all of TER+AUM+1Y, and the old all-three
 *  rule zeroed entire runs (2026-07-10). A cited fund with at least one finite
 *  number is a usable finding; zero numbers is not. */
export function parseFinanceFindings(markdown: string): FinanceFindings | null {
  const raw = extractFindingsBlock<Partial<FinanceFindings>>(markdown);
  if (!raw) return null;
  if (!Array.isArray(raw.funds)) return { theme: String(raw.theme ?? ''), funds: [] };
  const funds: FundFinding[] = [];
  for (const f of raw.funds as Partial<FundFinding>[]) {
    if (!f || typeof f.name !== 'string' || !hasCitation(f as { citation?: Partial<Citation> })) continue;
    const ter = finiteOrNull(f.ter);
    const aum = finiteOrNull(f.aum);
    const return1y = finiteOrNull(f.return1y);
    if (ter === null && aum === null && return1y === null) continue;
    funds.push({ ...(f as FundFinding), ter, aum, return1y });
  }
  return { theme: String(raw.theme ?? ''), funds };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Charts built from validated findings, tagged web·cited. Numeric charts only
 *  plot funds that carry that number and are omitted when none do; the table
 *  keeps every fund with '—' for missing figures. */
export function financeArtifacts(f: FinanceFindings): Artifact[] {
  if (f.funds.length === 0) return [];
  const sources = f.funds.map((x) => x.citation);
  const seriesOf = (pick: (x: FundFinding) => number | null) =>
    f.funds.flatMap((x) => {
      const v = pick(x);
      return v === null ? [] : [{ label: x.name, value: round2(v) }];
    });
  const cell = (v: number | null): string | number => (v === null ? '—' : round2(v));

  const ter = seriesOf((x) => x.ter);
  const ret = seriesOf((x) => x.return1y);
  const aum = seriesOf((x) => x.aum);
  const out: Artifact[] = [];
  if (ter.length > 0)
    out.push(withProvenance({
      kind: 'bars', title: 'Total expense ratio (TER %)', unit: '%', series: ter,
    }, 'web', sources));
  if (ret.length > 0)
    out.push(withProvenance({
      kind: 'divergingBars', title: '1-year return (%)', unit: '%', series: ret,
    }, 'web', sources));
  out.push(withProvenance({
    kind: 'table', title: 'Fund comparison',
    columns: ['กอง', 'บลจ.', 'TER%', 'AUM(ลบ.)', 'กองแม่', 'ป้องกันค่าเงิน', '1Y%'],
    rows: f.funds.map((x) => [x.name, x.amc, cell(x.ter), cell(x.aum), x.masterFund, x.hedged ? 'hedged' : 'unhedged', cell(x.return1y)]),
  }, 'web', sources));
  if (aum.length > 0)
    out.push(withProvenance({
      kind: 'bars', title: 'Fund size — AUM (ล้านบาท)', unit: 'ลบ.', series: aum,
    }, 'web', sources));
  out.push(withProvenance({
    kind: 'donut', title: 'Tax type mix',
    series: Object.entries(
      f.funds.reduce<Record<string, number>>((m, x) => ((m[x.taxType] = (m[x.taxType] ?? 0) + 1), m), {}),
    ).map(([label, value]) => ({ label, value })),
  }, 'web', sources));
  return out;
}

export function financeTags(f: FinanceFindings): string[] {
  return normalizeTags([f.theme, ...f.funds.map((x) => x.amc)]);
}

export interface FinMeta { theme: string; label: string }

/** Everything before the completeRaw call: theme pick, context format, MCP env
 *  wiring, prompt build, and operator overrides applied to the request opts. */
export async function prepare(ctx: AgentContext): Promise<{ opts: CompleteOpts; meta: FinMeta }> {
  const { theme, label } = themeForToday();
  const context = formatContext(ctx);
  const mcpUrl = process.env.THAI_FUNDS_MCP_URL;
  const mcpToken = process.env.THAI_FUNDS_MCP_TOKEN;
  const mcpServers = mcpUrl
    ? [{ url: mcpUrl, name: 'thai-funds', ...(mcpToken ? { token: mcpToken } : {}) }]
    : undefined;
  // ponytail: v1.10.1 forced MCP-only because web_search kept timing Finance
  // out past the sync request's 300s cap. v1.12 moves agent runs onto the
  // batch substrate (no HTTP-response deadline), so that pressure is gone —
  // restore the v1.6 hybrid: web_search for names/master-fund/1y-return color
  // alongside thai-funds-mcp for the authoritative SEC numbers.
  const sourceBrief = mcpServers
    ? `ใช้ web_search หาชื่อกองเต็ม บลจ. กองแม่/underlying ผลตอบแทนย้อนหลัง 1 ปี การป้องกันค่าเงิน และประเภทภาษี (SSF/RMF/ThaiESG) แล้วใช้เครื่องมือ thai-funds-mcp (ข้อมูล ก.ล.ต. ที่อ้างอิงได้) เพื่อยืนยันตัวเลขทางการ: list_thai_funds (ค้นด้วยรหัสคลาส), thai_fund_fees (TER), thai_fund_nav (NAV+AUM), thai_fund_risk (ระดับความเสี่ยง+ความผันผวน), thai_fund_asset_allocation และ market_index/fx_rate เป็นบริบท\nหากตัวเลขจาก web_search กับ MCP ขัดแย้งกัน ให้ยึดตาม MCP (แหล่ง ก.ล.ต.) เป็นหลัก`
    : `ใช้ web_search หาชื่อกองเต็ม บลจ. กองแม่/underlying ผลตอบแทนย้อนหลัง 1 ปี การป้องกันค่าเงิน และประเภทภาษี (SSF/RMF/ThaiESG)`;
  const opts = applyOverrides({
    system: PERSONAS.fin,
    prompt: `${context ? context + '\n\n---\n\n' : ''}ธีมประจำรอบวันนี้: **${label}** (theme: ${theme}).\nหากองทุนรวมไทยจริง 3-5 กองในธีมนี้\n${sourceBrief}\nอ้างอิง sourceUrl + วันที่ (asOf) ของทุกตัวเลขเสมอ — ห้ามแต่งตัวเลข\nเปิดรายงานด้วยบล็อก \`\`\`json findings ตามสคีมา แล้วเขียนรายงานตามโครงสร้างในบทบาท`,
    model: FINANCE_MODEL,
    webSearch: true,
    maxSearches: 4,
    mcpServers,
    // 8000 truncated the 2026-07-10 hybrid run mid-narrative (bilingual report +
    // web_search overhead); batches have no HTTP deadline, so headroom is cheap.
    maxTokens: 16000,
  }, ctx);
  return { opts, meta: { theme, label } };
}

/** Everything after the completeRaw call: parse findings, build artifacts,
 *  compute incomplete/summary, and assemble the run result. Pure/synchronous. */
export function finalize(_ctx: AgentContext, meta: FinMeta, out: CompleteResult): AgentRunResult {
  const { theme, label } = meta;
  const { text: markdown, stopReason, usage, model } = out;
  const findings = parseFinanceFindings(markdown) ?? { theme, funds: [] };
  const artifacts = financeArtifacts(findings);
  const sources = findings.funds.map((x) => x.citation);
  // A run is incomplete if the model was truncated (max_tokens) OR it finished
  // but produced no citation-backed fund — the latter usually means the Thai-funds
  // MCP server or the upstream SEC fund API did not respond, so the model wrote
  // uncited funds that parseFinanceFindings() then drops. Either way the
  // deliverable is unusable and must not be presented as clean.
  const noCitedFunds = findings.funds.length === 0;
  const incomplete = stopReason === 'max_tokens' || noCitedFunds;
  const summary = noCitedFunds
    ? `⚠️ ไม่พบกองที่อ้างอิงได้ในธีม ${label} (แหล่งข้อมูล SEC/MCP อาจไม่ตอบสนอง)`
    : `${findings.funds.length} กองในธีม ${label}`;
  return {
    markdown,
    summary,
    feedMsg: `finance: ${label} — ${findings.funds.length} funds`,
    artifacts, tags: financeTags(findings),
    theme, provenance: noCitedFunds ? 'api' : 'web', sources,
    incomplete,
    usage, model,
    meta: { theme, fundCount: findings.funds.length, stopReason },
  };
}

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const { opts, meta } = await prepare(ctx);
  const out = await completeRaw(opts);
  return finalize(ctx, meta, out);
}
