import { describe, it, expect } from 'vitest';
import { MESSAGES, translate } from './messages';

describe('i18n messages', () => {
  it('en and th have identical key sets', () => {
    const en = Object.keys(MESSAGES.en).sort();
    const th = Object.keys(MESSAGES.th).sort();
    expect(th).toEqual(en);
  });

  it('no message value is empty', () => {
    for (const lang of ['en', 'th'] as const) {
      for (const [k, v] of Object.entries(MESSAGES[lang])) {
        expect(v, `${lang}.${k}`).toBeTruthy();
      }
    }
  });

  it('translate() returns the language-specific value', () => {
    expect(translate('en', 'nav.dashboard')).toBe('Dashboard');
    expect(translate('th', 'nav.dashboard')).toBe('แดชบอร์ด');
  });
});
