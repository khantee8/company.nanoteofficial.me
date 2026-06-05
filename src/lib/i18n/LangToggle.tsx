'use client';

import { useLang } from './LangProvider';
import type { Lang } from './messages';

/** EN | ไทย pill switch, wired to the LangProvider cookie. */
export function LangToggle() {
  const { lang, setLang, t } = useLang();
  const opts: Lang[] = ['en', 'th'];
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      {opts.map((l) => (
        <button
          key={l}
          type="button"
          className={`lang-opt${lang === l ? ' is-active' : ''}`}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
        >
          {t(l === 'en' ? 'lang.en' : 'lang.th')}
        </button>
      ))}
    </div>
  );
}
