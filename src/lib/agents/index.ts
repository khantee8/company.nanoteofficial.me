import type { DeptId } from '@/lib/data/departments';
import type { AgentRunResult, AgentContext } from './types';
import * as finance from './finance';
import * as marketing from './marketing';
import * as rnd from './rnd';
import * as operations from './operations';
import * as ceo from './ceo';

export const AGENTS: Record<DeptId, (ctx: AgentContext) => Promise<AgentRunResult>> = {
  fin: finance.run,
  mkt: marketing.run,
  rnd: rnd.run,
  ops: operations.run,
  ceo: ceo.run,
};

export const isDeptId = (s: string): s is DeptId =>
  s === 'ceo' || s === 'mkt' || s === 'rnd' || s === 'ops' || s === 'fin';
