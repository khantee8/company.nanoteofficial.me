import { describe, it, expect } from 'vitest';
import { parseCeoFindings, ceoArtifacts } from './ceo';

describe('parseCeoFindings', () => {
  it('parses decisions/risks/priorities arrays', () => {
    const md = '```json findings\n' + JSON.stringify({ decisions: ['ship v1.4'], risks: ['cron limit'], priorities: ['publish kb'] }) + '\n```';
    const f = parseCeoFindings(md);
    expect(f?.decisions).toEqual(['ship v1.4']);
    expect(f?.risks).toEqual(['cron limit']);
    expect(f?.priorities).toEqual(['publish kb']);
  });
  it('defaults missing keys to empty arrays', () => {
    const md = '```json findings\n' + JSON.stringify({ decisions: ['x'] }) + '\n```';
    const f = parseCeoFindings(md);
    expect(f?.risks).toEqual([]);
    expect(f?.priorities).toEqual([]);
  });
  it('coerces non-array fields to empty arrays', () => {
    const md = '```json findings\n' + JSON.stringify({ decisions: 'oops', risks: 5, priorities: null }) + '\n```';
    expect(parseCeoFindings(md)).toEqual({ decisions: [], risks: [], priorities: [] });
  });
  it('returns null when no block', () => {
    expect(parseCeoFindings('nope')).toBeNull();
  });
});

describe('ceoArtifacts', () => {
  const snapshot = { statuses: [], digest: [] };
  it('tags all cockpit artifacts api provenance', () => {
    const a = ceoArtifacts(snapshot, '## Decisions\n- do x', { decisions: ['from findings'], risks: [], priorities: ['p1'] });
    expect(a.every((x) => x.provenance === 'api')).toBe(true);
  });
  it('builds the decisions checklist from findings (decisions + priorities)', () => {
    const a = ceoArtifacts(snapshot, '', { decisions: ['d1'], risks: [], priorities: ['p1'] });
    const checklist = a.find((x) => x.kind === 'checklist');
    expect(checklist).toBeDefined();
    // @ts-expect-error narrow at runtime
    expect(checklist.items.map((i) => i.text)).toEqual(['d1', 'p1']);
  });
  it('falls back to ## Decisions markdown when findings are empty', () => {
    const a = ceoArtifacts(snapshot, '## Decisions\n- md decision', { decisions: [], risks: [], priorities: [] });
    const checklist = a.find((x) => x.kind === 'checklist');
    // @ts-expect-error narrow at runtime
    expect(checklist.items.map((i) => i.text)).toEqual(['md decision']);
  });
});
