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
  flags?: string[];
  meta?: Record<string, unknown>;
}

export interface HistoryEntry {
  dept: DeptId;
  date: string;
  summary: string;
  highlight: string;
  markdown: string;
}

export interface DigestEntry {
  dept: DeptId;
  date: string;
  summary: string;
  highlight: string;
  flags: string[];
}

/** Archived agent result for the knowledge base (future kb.nanoteofficial.me). */
export interface KbEntry {
  dept: DeptId;
  date: string;
  ts: string;
  summary: string;
  highlight: string;
  flags: string[];
  markdown: string;
}

export interface AgentContext {
  ownHistory: HistoryEntry[];
  companyDigest: DigestEntry[];
  todayPeers: Array<{ dept: DeptId; summary: string; highlight: string; flags: string[] }>;
}
