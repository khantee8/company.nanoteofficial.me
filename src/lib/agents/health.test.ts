import { describe, it, expect } from 'vitest';
import {
  assessCompanyHealth, overallSeverity, criticalAlerts, formatHealth,
  EXPECTED_CADENCE_HOURS, type AgentHealth,
} from './health';
import type { AgentStatus, DigestEntry } from './types';
import type { AgentOutputHealth } from './types';

const NOW = Date.parse('2026-06-14T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

function status(dept: AgentStatus['dept'], over: Partial<AgentStatus> = {}): AgentStatus {
  return { dept, state: 'done', lastRun: hoursAgo(1), ...over };
}
function output(dept: AgentOutputHealth['dept'], over: Partial<AgentOutputHealth> = {}): AgentOutputHealth {
  return { dept, incomplete: false, artifactCount: 2, hasSummary: true, ts: hoursAgo(1), ...over };
}
function find(hs: AgentHealth[], dept: string) {
  const h = hs.find((x) => x.dept === dept);
  if (!h) throw new Error(`no health for ${dept}`);
  return h;
}

describe('assessCompanyHealth', () => {
  it('flags an errored agent as critical', () => {
    const hs = assessCompanyHealth({
      statuses: [status('cyb', { state: 'error', error: 'boom' })],
      outputs: [output('cyb')], digest: [], now: NOW,
    });
    const h = find(hs, 'cyb');
    expect(h.severity).toBe('critical');
    expect(h.issues.some((i) => i.kind === 'error' && /boom/.test(i.detail))).toBe(true);
  });

  it('flags a stale agent as warning past cadence + grace', () => {
    // fin cadence is 72h; 72+12+5 = 89h old → warning
    const hs = assessCompanyHealth({
      statuses: [status('fin', { lastRun: hoursAgo(EXPECTED_CADENCE_HOURS.fin + 17) })],
      outputs: [output('fin')], digest: [], now: NOW,
    });
    expect(find(hs, 'fin').severity).toBe('warning');
    expect(find(hs, 'fin').stale).toBe(true);
  });

  it('escalates a severely stale agent (2x overdue) to critical', () => {
    const hs = assessCompanyHealth({
      statuses: [status('fin', { lastRun: hoursAgo((EXPECTED_CADENCE_HOURS.fin + 12) * 2 + 5) })],
      outputs: [output('fin')], digest: [], now: NOW,
    });
    expect(find(hs, 'fin').severity).toBe('critical');
  });

  it('treats a never-run agent as warning stale, not critical', () => {
    const hs = assessCompanyHealth({
      statuses: [status('rnd', { lastRun: null })],
      outputs: [output('rnd')], digest: [], now: NOW,
    });
    expect(find(hs, 'rnd').severity).toBe('warning');
  });

  it('flags a truncated report as warning', () => {
    const hs = assessCompanyHealth({
      statuses: [status('fin')],
      outputs: [output('fin', { incomplete: true })], digest: [], now: NOW,
    });
    expect(find(hs, 'fin').issues.some((i) => i.kind === 'truncated')).toBe(true);
    expect(find(hs, 'fin').severity).toBe('warning');
  });

  it('flags empty output (done, 0 artifacts) as warning', () => {
    const hs = assessCompanyHealth({
      statuses: [status('mkt', { state: 'done' })],
      outputs: [output('mkt', { artifactCount: 0 })], digest: [], now: NOW,
    });
    expect(find(hs, 'mkt').issues.some((i) => i.kind === 'empty')).toBe(true);
  });

  it('reports open flags as info only', () => {
    const digest: DigestEntry[] = [
      { dept: 'rnd', date: '2026-06-14', summary: 's', highlight: 'h', flags: ['a', 'b'] },
    ];
    const hs = assessCompanyHealth({
      statuses: [status('rnd')], outputs: [output('rnd')], digest, now: NOW,
    });
    const h = find(hs, 'rnd');
    expect(h.severity).toBe('info');
    expect(h.issues.some((i) => i.kind === 'flags' && /2 open flags/.test(i.detail))).toBe(true);
  });

  it('returns ok for a healthy agent', () => {
    const hs = assessCompanyHealth({
      statuses: [status('cyb')], outputs: [output('cyb')], digest: [], now: NOW,
    });
    expect(find(hs, 'cyb').severity).toBe('ok');
    expect(find(hs, 'cyb').issues).toEqual([]);
  });

  it('never assesses ops itself', () => {
    const hs = assessCompanyHealth({
      statuses: [status('ops', { state: 'running' }), status('cyb')],
      outputs: [], digest: [], now: NOW,
    });
    expect(hs.some((h) => h.dept === 'ops')).toBe(false);
  });
});

describe('overallSeverity + criticalAlerts', () => {
  it('overallSeverity returns the worst', () => {
    const hs = assessCompanyHealth({
      statuses: [status('cyb'), status('fin', { state: 'error', error: 'x' })],
      outputs: [output('cyb'), output('fin')], digest: [], now: NOW,
    });
    expect(overallSeverity(hs)).toBe('critical');
  });

  it('criticalAlerts filters to critical only', () => {
    const hs = assessCompanyHealth({
      statuses: [status('cyb'), status('fin', { state: 'error', error: 'x' })],
      outputs: [output('cyb'), output('fin')], digest: [], now: NOW,
    });
    expect(criticalAlerts(hs).map((h) => h.dept)).toEqual(['fin']);
  });

  it('formatHealth renders one line per agent', () => {
    const hs = assessCompanyHealth({
      statuses: [status('fin', { state: 'error', error: 'boom' })],
      outputs: [output('fin')], digest: [], now: NOW,
    });
    expect(formatHealth(hs)).toContain('FIN');
    expect(formatHealth(hs)).toContain('run failed: boom');
  });
});
