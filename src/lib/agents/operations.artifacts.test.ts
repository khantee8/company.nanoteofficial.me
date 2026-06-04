import { describe, it, expect } from 'vitest';
import { opsArtifacts, opsTags } from './operations';
import type { DeployState } from '@/lib/sources/vercelApi';
import type { RepoActivity } from '@/lib/sources/githubApi';

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
