'use client';

import { useLang } from '@/lib/i18n/LangProvider';
import { DocMarkdown } from './DocMarkdown';

/** Both languages are embedded at build; the client toggle picks one instantly. */
export function DocView({ en, th }: { en: string; th: string }) {
  const { lang } = useLang();
  return <DocMarkdown text={lang === 'en' ? en : th || en} />;
}
