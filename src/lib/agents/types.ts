import type { DeptId } from '@/lib/data/departments';

export type AgentState = 'idle' | 'running' | 'done' | 'error';

export interface AgentStatus {
  dept: DeptId;
  state: AgentState;
  lastRun: string | null;
  error?: string;
  summary?: string;
}

export interface AgentOutput {
  dept: DeptId;
  markdown: string;
  summary: string;
  ts: string;
  meta?: Record<string, unknown>;
}

export interface FeedEvent {
  dept: DeptId;
  msg: string;
  ts: string;
}

export interface AgentRunResult {
  markdown: string;
  summary: string;
  feedMsg: string;
  meta?: Record<string, unknown>;
}
