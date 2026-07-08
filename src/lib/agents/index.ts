import type { DeptId } from '@/lib/data/departments';
import type { CompleteOpts, CompleteResult } from '@/lib/claude';
import type { AgentRunResult, AgentContext } from './types';
import * as finance from './finance';
import * as marketing from './marketing';
import * as rnd from './rnd';
import * as operations from './operations';
import * as ceo from './ceo';
import * as cyberx from './cyberx';

export const AGENTS: Record<DeptId, (ctx: AgentContext) => Promise<AgentRunResult>> = {
  ceo: ceo.run,
  cyb: cyberx.run,
  fin: finance.run,
  mkt: marketing.run,
  rnd: rnd.run,
  ops: operations.run,
};

/** v1.12 — the pre-LLM half of each dept's run: source fetches, prompt build,
 *  operator overrides. Returns the request opts + whatever local state the
 *  post-LLM half needs. Feeds the async batch substrate. */
export const PREPARES: Record<DeptId, (ctx: AgentContext) => Promise<{ opts: CompleteOpts; meta: unknown }>> = {
  ceo: ceo.prepare, cyb: cyberx.prepare, fin: finance.prepare, mkt: marketing.prepare, rnd: rnd.prepare, ops: operations.prepare,
};

/** v1.12 — the post-LLM half of each dept's run: parse findings, build
 *  artifacts, assemble the AgentRunResult. Synchronous, I/O-free. */
export const FINALIZES: Record<DeptId, (ctx: AgentContext, meta: never, out: CompleteResult) => AgentRunResult> = {
  ceo: ceo.finalize, cyb: cyberx.finalize, fin: finance.finalize, mkt: marketing.finalize, rnd: rnd.finalize, ops: operations.finalize,
};

export const isDeptId = (s: string): s is DeptId =>
  s === 'ceo' || s === 'cyb' || s === 'mkt' || s === 'rnd' || s === 'ops' || s === 'fin';
