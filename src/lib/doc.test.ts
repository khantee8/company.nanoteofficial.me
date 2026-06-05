import { describe, it, expect } from 'vitest';
import { getDocSlugs, resolveDoc, readDoc } from './doc';

describe('doc loader', () => {
  it('lists every page slug from the manifest', () => {
    const slugs = getDocSlugs();
    expect(slugs).toContain('overview');
    expect(slugs).toContain('telegram');
    expect(slugs.length).toBeGreaterThanOrEqual(7);
    expect(new Set(slugs).size).toBe(slugs.length); // no duplicates
  });

  it('resolves a known slug to its page meta', () => {
    const page = resolveDoc('overview');
    expect(page).not.toBeNull();
    expect(page?.titleKey).toBe('doc.overview');
  });

  it('returns null for an unknown slug', () => {
    expect(resolveDoc('does-not-exist')).toBeNull();
  });

  it('reads real markdown for both languages', () => {
    expect(readDoc('overview', 'en')).toContain('# Overview');
    expect(readDoc('overview', 'th')).toContain('# ภาพรวม');
  });

  it('returns empty string for an unknown slug', () => {
    expect(readDoc('nope', 'en')).toBe('');
  });
});
