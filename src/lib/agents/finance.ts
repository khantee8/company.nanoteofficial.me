import { completeRaw, applyOverrides } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import { extractFindingsBlock, hasCitation } from './findings';
import { normalizeTags, withProvenance, type Artifact, type Citation } from './artifacts';
import type { AgentRunResult, AgentContext } from './types';

export interface FundFinding {
  name: string; amc: string; ter: number; aum: number; masterFund: string;
  return1y: number; hedged: boolean; taxType: 'none' | 'ssf' | 'rmf' | 'thaiesg';
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

/** Validate the model's findings block; drop any fund without a real citation. */
export function parseFinanceFindings(markdown: string): FinanceFindings | null {
  const raw = extractFindingsBlock<Partial<FinanceFindings>>(markdown);
  if (!raw) return null;
  if (!Array.isArray(raw.funds)) return { theme: String(raw.theme ?? ''), funds: [] };
  const funds = raw.funds.filter(
    (f): f is FundFinding =>
      !!f &&
      typeof f.name === 'string' &&
      [f.ter, f.aum, f.return1y].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
      hasCitation(f as { citation?: Partial<Citation> }),
  );
  return { theme: String(raw.theme ?? ''), funds };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Charts built from validated findings, tagged web·cited. */
export function financeArtifacts(f: FinanceFindings): Artifact[] {
  if (f.funds.length === 0) return [];
  const sources = f.funds.map((x) => x.citation);
  return [
    withProvenance({
      kind: 'bars', title: 'Total expense ratio (TER %)', unit: '%',
      series: f.funds.map((x) => ({ label: x.name, value: round2(x.ter) })),
    }, 'web', sources),
    withProvenance({
      kind: 'divergingBars', title: '1-year return (%)', unit: '%',
      series: f.funds.map((x) => ({ label: x.name, value: round2(x.return1y) })),
    }, 'web', sources),
    withProvenance({
      kind: 'table', title: 'Fund comparison',
      columns: ['กอง', 'บลจ.', 'TER%', 'AUM(ลบ.)', 'กองแม่', 'ป้องกันค่าเงิน', '1Y%'],
      rows: f.funds.map((x) => [x.name, x.amc, round2(x.ter), round2(x.aum), x.masterFund, x.hedged ? 'hedged' : 'unhedged', round2(x.return1y)]),
    }, 'web', sources),
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
  ];
}

export function financeTags(f: FinanceFindings): string[] {
  return normalizeTags([f.theme, ...f.funds.map((x) => x.amc)]);
}

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const { theme, label } = themeForToday();
  const context = formatContext(ctx);
  const mcpUrl = process.env.THAI_FUNDS_MCP_URL;
  const mcpToken = process.env.THAI_FUNDS_MCP_TOKEN;
  const mcpServers = mcpUrl
    ? [{ url: mcpUrl, name: 'thai-funds', ...(mcpToken ? { token: mcpToken } : {}) }]
    : undefined;
  const { text: markdown, stopReason, usage, model } = await completeRaw(applyOverrides({
    system: PERSONAS.fin,
    prompt: `${context ? context + '\n\n---\n\n' : ''}ธีมประจำรอบวันนี้: **${label}** (theme: ${theme}).\nหากองทุนรวมไทยจริง 3-5 กองในธีมนี้ โดยใช้สองแหล่งร่วมกัน:\n1) web_search — หาชื่อกองเต็ม บลจ. กองแม่/underlying ผลตอบแทนย้อนหลัง 1 ปี การป้องกันค่าเงิน และประเภทภาษี (SSF/RMF/ThaiESG)\n2) เครื่องมือ thai-funds-mcp (ข้อมูล ก.ล.ต. ที่อ้างอิงได้) — ใช้ตรวจสอบ/ยืนยันตัวเลขทางการ: thai_fund_fees (TER), thai_fund_nav (NAV+AUM), thai_fund_risk (ระดับความเสี่ยง+ความผันผวน), list_thai_funds (ค้นด้วยรหัสคลาส), และ market_index/fx_rate เป็นบริบท\nให้ความสำคัญกับตัวเลขจาก ก.ล.ต. (MCP) เมื่อมีให้ใช้ และอ้างอิง sourceUrl + วันที่ (asOf) ของทุกตัวเลขเสมอ — ห้ามแต่งตัวเลข\nเปิดรายงานด้วยบล็อก \`\`\`json findings ตามสคีมา แล้วเขียนรายงานตามโครงสร้างในบทบาท`,
    model: FINANCE_MODEL,
    webSearch: true,
    // ponytail: 4 not 6 — Finance (Sonnet + web×N + MCP) is the heaviest run and
    // timed out past 300s when web_search hit Anthropic rate limits; 4 queries
    // is what actually got through before throttling. Raise if reports thin out.
    maxSearches: 4,
    mcpServers,
    maxTokens: 8000,
  }, ctx));
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
