import { describe, it, expect } from 'vitest';
import { validateCreate } from './validate';

describe('plan create validation', () => {
  it('rejects empty title', () => {
    expect(validateCreate({ title: '  ', brief: 'x', audience: '' }).ok).toBe(false);
  });
  it('accepts and trims', () => {
    const r = validateCreate({ title: ' Growth ', brief: 'b', audience: 'board' });
    expect(r).toEqual({ ok: true, value: { title: 'Growth', brief: 'b', audience: 'board' } });
  });
  it('coerces missing brief/audience to empty string', () => {
    const r = validateCreate({ title: 'X' } as Record<string, unknown>);
    expect(r).toEqual({ ok: true, value: { title: 'X', brief: '', audience: '' } });
  });
});
