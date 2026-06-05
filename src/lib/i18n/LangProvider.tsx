'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { MESSAGES, type Lang, type MsgKey } from './messages';

const COOKIE = 'lang';
const DEFAULT: Lang = 'en'; // English-first (international portfolio reach)

function readCookie(): Lang {
  if (typeof document === 'undefined') return DEFAULT;
  const m = document.cookie.match(/(?:^|;\s*)lang=(en|th)/);
  return (m?.[1] as Lang) ?? DEFAULT;
}

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: MsgKey) => string;
}

const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  // SSR / first paint renders the default; the stored choice is applied on mount
  // (cookie can't be read during static prerender). One-frame flash is accepted.
  const [lang, setLangState] = useState<Lang>(DEFAULT);

  useEffect(() => {
    // Sync to the stored choice once mounted (the cookie is unreadable during
    // static prerender). Setting the same value bails out in React, so this is a
    // no-op when the default already matches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLangState(readCookie());
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (typeof document !== 'undefined') {
      document.cookie = `${COOKIE}=${l};path=/;max-age=31536000;samesite=lax`;
      document.documentElement.lang = l;
    }
  }, []);

  const t = useCallback((key: MsgKey) => MESSAGES[lang][key], [lang]);

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const v = useContext(Ctx);
  // Fallback keeps non-wrapped trees (e.g. isolated unit renders) working in EN.
  if (!v) return { lang: DEFAULT, setLang: () => {}, t: (k) => MESSAGES[DEFAULT][k] };
  return v;
}
