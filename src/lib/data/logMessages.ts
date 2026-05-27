// src/lib/data/logMessages.ts
import type { DeptId } from './departments';

/** Discriminated-union token — rendered as React spans (no innerHTML). */
export type LogToken =
  | { type: 'text'; value: string }
  | { type: 'ok';   value: string }
  | { type: 'warn'; value: string };

export interface LogMessage {
  dept: DeptId;
  tokens: LogToken[];
}

const t   = (value: string): LogToken => ({ type: 'text', value });
const ok  = (value: string): LogToken => ({ type: 'ok',   value });
const wn  = (value: string): LogToken => ({ type: 'warn', value });

export const LOG_MESSAGES: LogMessage[] = [
  { dept: 'ceo', tokens: [t('Session started — '),                         ok('5 agents online ✓')] },
  { dept: 'ceo', tokens: [t('Dispatching weekly brief → '),                ok('all departments')] },
  { dept: 'mkt', tokens: [t('generate_content.py '),                       ok('started')] },
  { dept: 'fin', tokens: [t('Market pull — '),                             wn('BTCUSDT +3.2% ▲')] },
  { dept: 'ops', tokens: [t('Deploy pipeline: '),                          ok('████████░░ 82%')] },
  { dept: 'rnd', tokens: [t('Waiting CEO approval on proposal #7...')] },
  { dept: 'mkt', tokens: [t('Content ready → '),                           ok('/output/post_today.md ✓')] },
  { dept: 'fin', tokens: [t('Portfolio → '),                               ok('report.pdf generated ✓')] },
  { dept: 'ops', tokens: [t('Deploy: '),                                   ok('finance.nanoteofficial.me v1.3.2 ✓')] },
  { dept: 'ceo', tokens: [t('R&D proposal #7 '),                           ok('approved ✓')] },
  { dept: 'rnd', tokens: [t('Starting '),                                  ok('market_analysis_v2.py')] },
  { dept: 'mkt', tokens: [t('Published → '),                               ok('Twitter, LinkedIn, Instagram ✓')] },
  { dept: 'fin', tokens: [t('Q2 archived → '),                             ok('ROI +12.3% ✓')] },
  { dept: 'ops', tokens: [t('Watchtower: 3 containers updated → '),        ok('healthy ✓')] },
  { dept: 'rnd', tokens: [t('Model accuracy: '),                           ok('94.7%'), t(' — submitted')] },
  { dept: 'ceo', tokens: [t('All nominal. '),                              ok('Next review: 4h.')] },
];

/** Flat plain-text representation — used for sidebar task text + accessibility. */
export function tokensToPlain(tokens: LogToken[]): string {
  return tokens.map(t => t.value).join('');
}
