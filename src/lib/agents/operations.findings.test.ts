import { describe, it, expect } from 'vitest';
import { parseOperationsFindings, opsNoteArtifacts } from './operations';

const cite = { url: 'https://status.example', title: 'Status', date: '2026-06-03' };
const note = { text: 'vercel incident resolved', citation: cite };

describe('parseOperationsFindings', () => {
  it('keeps fixToday + notes with citation', () => {
    const md = '```json findings\n' + JSON.stringify({ fixToday: 'rotate token', notes: [note] }) + '\n```';
    const f = parseOperationsFindings(md);
    expect(f?.fixToday).toBe('rotate token');
    expect(f?.notes).toHaveLength(1);
  });
  it('drops notes missing citation', () => {
    const md = '```json findings\n' + JSON.stringify({ fixToday: 'x', notes: [{ ...note, citation: undefined }] }) + '\n```';
    expect(parseOperationsFindings(md)?.notes).toHaveLength(0);
  });
  it('coerces non-string fixToday to empty and non-array notes to []', () => {
    const md = '```json findings\n' + JSON.stringify({ fixToday: 123, notes: 'oops' }) + '\n```';
    expect(parseOperationsFindings(md)).toEqual({ fixToday: '', notes: [] });
  });
  it('returns null when no block', () => {
    expect(parseOperationsFindings('nope')).toBeNull();
  });
});

describe('opsNoteArtifacts', () => {
  it('builds a web·cited notes table from 2 notes', () => {
    const a = opsNoteArtifacts({ fixToday: '', notes: [note, { ...note, text: 'b' }] });
    expect(a).toHaveLength(1);
    expect(a[0].provenance).toBe('web');
    expect(a[0].kind).toBe('table');
    expect(a[0].sources).toHaveLength(2);
    expect(a[0].sources?.[0].url).toBe(cite.url);
  });
  it('returns [] when no notes', () => {
    expect(opsNoteArtifacts({ fixToday: 'x', notes: [] })).toEqual([]);
  });
});
