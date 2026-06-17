import { describe, it, expect } from 'vitest';
import { buildPaletteIndex, filterPalette } from './adminPalette';

const depts = [{ id: 'fin' as const, name: 'Finance' }, { id: 'cyb' as const, name: 'CyberX' }];
const kb = [{ id: 'fin:1', slug: 'fin-funds', summary: 'Thai funds brief' }];

describe('palette index', () => {
  it('builds agent + kb entries', () => {
    const idx = buildPaletteIndex(depts, kb);
    expect(idx.find((i) => i.kind === 'agent' && i.label.includes('Finance'))).toBeTruthy();
    expect(idx.find((i) => i.kind === 'kb' && i.label.includes('Thai funds'))).toBeTruthy();
  });
  it('filters case-insensitively by label', () => {
    const idx = buildPaletteIndex(depts, kb);
    expect(filterPalette(idx, 'cyber').length).toBe(1);
    expect(filterPalette(idx, '').length).toBe(idx.length);
  });
});
