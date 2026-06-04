import type { DeptId } from '@/lib/data/departments';
import type { Artifact, KbCategory, Citation } from './artifacts';

export type { Artifact, KbCategory, Citation };

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
  category: KbCategory;
  tags: string[];
  artifacts: Artifact[];
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
  /** Structured, chartable data built deterministically from source data. */
  artifacts?: Artifact[];
  /** Deterministic entity tags for the knowledge base. */
  tags?: string[];
  meta?: Record<string, unknown>;
  /** Series key for KB graph (e.g. "us-index-sp500"). */
  theme?: string;
  /** Citations behind the report's web-sourced figures. */
  sources?: Citation[];
  /** Dominant data source for this run. */
  provenance?: 'api' | 'web';
  /** Explicit cross-links (CEO synthesis → source entry ids). These may reference
   *  draft entries; the public /api/kb only resolves links to PUBLISHED entries. */
  related?: string[];
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
  id: string;
  slug: string;
  dept: DeptId;
  date: string;
  ts: string;
  category: KbCategory;
  theme?: string;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  pinned?: boolean;
  summary: string;
  highlight: string;
  flags: string[];
  artifacts: Artifact[];
  sources: Citation[];
  provenance: 'api' | 'web';
  related: string[];
  markdown: string;
}

export interface AgentContext {
  ownHistory: HistoryEntry[];
  companyDigest: DigestEntry[];
  todayPeers: Array<{ dept: DeptId; summary: string; highlight: string; flags: string[] }>;
  /** Whole-company state — populated only for the CEO (Executive Cockpit). */
  companySnapshot?: { statuses: AgentStatus[]; digest: DigestEntry[]; relatedEntryIds?: string[] };
}
