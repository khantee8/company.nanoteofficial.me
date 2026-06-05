import { completeRaw } from '@/lib/claude';
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
  ];
}

export function financeTags(f: FinanceFindings): string[] {
  return normalizeTags([f.theme, ...f.funds.map((x) => x.amc)]);
}

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const { theme, label } = themeForToday();
  const context = formatContext(ctx);
  const { text: markdown, stopReason } = await completeRaw({
    system: PERSONAS.fin,
    prompt: `${context ? context + '\n\n---\n\n' : ''}ธีมประจำรอบวันนี้: **${label}** (theme: ${theme}).\nค้นหาและเปรียบเทียบกองทุนรวมไทยจริง 3-5 กองในธีมนี้ พร้อมค่าธรรมเนียม กองแม่ AUM และผลตอบแทน อ้างอิงแหล่ง+วันที่ทุกตัวเลข แล้วเขียนรายงานตามโครงสร้างในบทบาท แล้วแนบบล็อก \`\`\`json findings ตามสคีมา`,
    webSearch: true,
    maxSearches: 6,
    maxTokens: 8000,
  });
  const findings = parseFinanceFindings(markdown) ?? { theme, funds: [] };
  const artifacts = financeArtifacts(findings);
  const sources = findings.funds.map((x) => x.citation);
  return {
    markdown,
    summary: `${findings.funds.length} กองในธีม ${label}`,
    feedMsg: `finance: ${label} — ${findings.funds.length} funds`,
    artifacts, tags: financeTags(findings),
    theme, provenance: findings.funds.length > 0 ? 'web' : 'api', sources,
    incomplete: stopReason === 'max_tokens',
    meta: { theme, fundCount: findings.funds.length, stopReason },
  };
}
