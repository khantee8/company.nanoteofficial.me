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
  /** English narrative (v1.4.1 dual-generation). Falls back to `markdown`. */
  markdownEn?: string;
  summary: string;
  ts: string;
  category: KbCategory;
  tags: string[];
  artifacts: Artifact[];
  meta?: Record<string, unknown>;
  /** v1.4.5 — true when the model hit max_tokens and the report was cut off. */
  incomplete?: boolean;
}

/** Slim per-dept health projection the Operations monitor reads (v1.7).
 *  Deliberately omits markdown/artifacts payloads to keep the context lean. */
export interface AgentOutputHealth {
  dept: DeptId;
  incomplete: boolean;
  stopReason?: string;
  artifactCount: number;
  hasSummary: boolean;
  ts: string | null;
}

export interface FeedEvent {
  dept: DeptId;
  msg: string;
  ts: string;
}

/** v1.8 — one LLM run's token usage, appended to the cost ledger. */
export interface UsageEntry {
  dept: DeptId;
  model: string;
  input: number;
  output: number;
  ts: number; // epoch ms
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
  /** v1.4.5 — true when the model hit max_tokens and the report was cut off. */
  incomplete?: boolean;
  /** v1.8 — token usage + the model used, recorded to the cost ledger by the
   *  runner. Set by LLM dept modules; absent for non-LLM runs (then not recorded). */
  usage?: { input: number; output: number };
  model?: string;
  /** v1.7 — a critical operations alert the runner sends as a distinct Telegram
   *  message, in addition to the routine run notify. */
  alert?: { severity: 'critical'; text: string };
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
  highlightEn?: string;
  flags: string[];
  flagsEn?: string[];
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
  highlightEn?: string;
  flags: string[];
  flagsEn?: string[];
  artifacts: Artifact[];
  sources: Citation[];
  provenance: 'api' | 'web';
  related: string[];
  markdown: string;
  /** English narrative (v1.4.1 dual-generation). Backfilled from `markdown`. */
  markdownEn?: string;
  /** v1.4.5 — true when the model hit max_tokens and the report was cut off. */
  incomplete?: boolean;
}

export interface AgentContext {
  ownHistory: HistoryEntry[];
  companyDigest: DigestEntry[];
  todayPeers: Array<{ dept: DeptId; summary: string; highlight: string; flags: string[] }>;
  /** Whole-company state — populated for the CEO (Executive Cockpit) and the
   *  Operations monitor (run-health). `outputs` is filled for ops only. */
  companySnapshot?: {
    statuses: AgentStatus[];
    digest: DigestEntry[];
    relatedEntryIds?: string[];
    outputs?: AgentOutputHealth[];
    /** v1.8 — recent cost-ledger entries; filled for the ops monitor only. */
    usage?: UsageEntry[];
  };
}
