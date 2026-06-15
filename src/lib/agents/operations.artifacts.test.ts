import { describe, it, expect } from 'vitest';
import { opsArtifacts, opsTags, agentHealthArtifacts, operationsCostArtifacts } from './operations';
import type { DeployState } from '@/lib/sources/vercelApi';
import type { RepoActivity } from '@/lib/sources/githubApi';
import type { AgentHealth } from './health';
import type { UsageAggregate } from './usage';

const deploys: DeployState[] = [
  { project: 'company.nanoteofficial.me', state: 'READY', ok: true, createdAt: 1 },
  { project: 'finance.nanoteofficial.me', state: 'BUILDING', ok: false, createdAt: 2 },
  { project: 'nanoteofficial.me', state: 'ERROR', ok: false, createdAt: 3 },
];

const activity: RepoActivity[] = [
  { repo: 'khantee8/company.nanoteofficial.me', lastCommit: 'ship v1.3', lastCi: 'success' },
  { repo: 'khantee8/finance.nanoteofficial.me', lastCommit: null, lastCi: null },
];

describe('opsArtifacts', () => {
  it('maps deploy states to ok/warn/down scorecard tiles', () => {
    const card = opsArtifacts(deploys, activity).find((a) => a.kind === 'scorecard');
    if (card && card.kind === 'scorecard') {
      expect(card.tiles).toEqual([
        { label: 'company', state: 'ok' },
        { label: 'finance', state: 'warn' },
        { label: 'portfolio', state: 'down' },
      ]);
    } else {
      throw new Error('no scorecard');
    }
  });

  it('builds a repo-activity table with fallbacks', () => {
    const table = opsArtifacts(deploys, activity).find((a) => a.kind === 'table');
    if (table && table.kind === 'table') {
      expect(table.columns).toEqual(['repo', 'last commit', 'ci']);
      expect(table.rows).toEqual([
        ['company.nanoteofficial.me', 'ship v1.3', 'success'],
        ['finance.nanoteofficial.me', '—', 'n/a'],
      ]);
    } else {
      throw new Error('no table');
    }
  });

  it('survives empty inputs', () => {
    expect(opsArtifacts([], [])).toEqual([]);
  });

  it('tags ops charts as api provenance', () => {
    const a = opsArtifacts(deploys, activity);
    expect(a.every((x) => x.provenance === 'api')).toBe(true);
  });
});

describe('opsTags', () => {
  it('includes stable ops tags plus distinct CI conclusions', () => {
    expect(opsTags(deploys, activity)).toEqual(['ci-cd', 'vercel', 'deploy', 'success']);
  });
});

const healths: AgentHealth[] = [
  { dept: 'cyb', severity: 'ok', state: 'done', lastRun: 'x', stale: false, issues: [] },
  { dept: 'fin', severity: 'critical', state: 'error', lastRun: 'x', stale: false,
    issues: [{ kind: 'error', severity: 'critical', detail: 'run failed: boom' }] },
  { dept: 'rnd', severity: 'info', state: 'done', lastRun: 'x', stale: false,
    issues: [{ kind: 'flags', severity: 'info', detail: '2 open flags' }] },
];

describe('agentHealthArtifacts', () => {
  it('maps severity to scorecard tiles (info counts as ok)', () => {
    const card = agentHealthArtifacts(healths).find((a) => a.kind === 'scorecard');
    if (card && card.kind === 'scorecard') {
      expect(card.tiles).toEqual([
        { label: 'CYB', state: 'ok' },
        { label: 'FIN', state: 'down' },
        { label: 'RND', state: 'ok' },
      ]);
    } else {
      throw new Error('no scorecard');
    }
  });

  it('lists only warning/critical rows in the issues table', () => {
    const table = agentHealthArtifacts(healths).find((a) => a.kind === 'table');
    if (table && table.kind === 'table') {
      expect(table.columns).toEqual(['agent', 'severity', 'issue']);
      expect(table.rows).toEqual([['FIN', '🔴 critical', 'run failed: boom']]);
    } else {
      throw new Error('no issues table');
    }
  });

  it('omits the issues table when nothing is unhealthy', () => {
    const ok: AgentHealth[] = [
      { dept: 'cyb', severity: 'ok', state: 'done', lastRun: 'x', stale: false, issues: [] },
    ];
    expect(agentHealthArtifacts(ok).some((a) => a.kind === 'table')).toBe(false);
  });

  it('survives empty input', () => {
    expect(agentHealthArtifacts([])).toEqual([]);
  });

  it('tags health artifacts as api provenance', () => {
    expect(agentHealthArtifacts(healths).every((a) => a.provenance === 'api')).toBe(true);
  });
});

const aggBase: UsageAggregate = {
  perDept: [{ dept: 'fin', tokens: 1_000_000, costUsd: 4.1 }, { dept: 'cyb', tokens: 800_000, costUsd: 1.9 }],
  mtdUsd: 6, mtdTokens: 1_800_000, last7dBurnUsdPerDay: 0.55,
  projectedMonthEndUsd: 14.25, daysLeftInMonth: 15, budgetUsd: 30, pctUsed: 20,
};

describe('operationsCostArtifacts', () => {
  it('builds a per-agent cost bars chart + a budget table (api provenance)', () => {
    const arts = operationsCostArtifacts(aggBase);
    const bars = arts.find((a) => a.kind === 'bars');
    const table = arts.find((a) => a.kind === 'table');
    expect(bars?.title).toBe('agent cost (MTD)');
    expect(table?.title).toBe('cost & budget');
    expect(arts.every((a) => a.provenance === 'api')).toBe(true);
    expect(JSON.stringify(table)).toContain('budget');
    expect(JSON.stringify(table)).toContain('20%');
  });

  it('shows "tracking only" when no budget is set', () => {
    const arts = operationsCostArtifacts({ ...aggBase, budgetUsd: null, pctUsed: null });
    const table = arts.find((a) => a.kind === 'table');
    expect(JSON.stringify(table)).toContain('tracking only');
  });

  it('renders a $0 table for an empty aggregate (no per-dept bars)', () => {
    const empty: UsageAggregate = { perDept: [], mtdUsd: 0, mtdTokens: 0, last7dBurnUsdPerDay: 0,
      projectedMonthEndUsd: 0, daysLeftInMonth: 15, budgetUsd: null, pctUsed: null };
    const arts = operationsCostArtifacts(empty);
    expect(arts.some((a) => a.kind === 'bars')).toBe(false);
    expect(arts.some((a) => a.kind === 'table')).toBe(true);
    expect(JSON.stringify(arts)).toContain('$0.00');
  });
});
