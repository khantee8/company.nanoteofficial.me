'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLang } from '@/lib/i18n/LangProvider';
// Import the manifest directly (not via lib/doc.ts, which pulls in `fs`) so this
// stays a clean client bundle.
import { DOC_NAV, DOC_HOME } from '../../../content/doc/nav';

export function DocSidebar() {
  const pathname = usePathname();
  const { t } = useLang();

  const isActive = (slug: string) => {
    const href = `/doc/${slug}`;
    return pathname === href || (slug === DOC_HOME && pathname === '/doc');
  };

  return (
    <aside className="doc-sidebar" aria-label="Docs navigation">
      <div className="doc-sidebar-title">{t('doc.title')}</div>
      {DOC_NAV.map((section) => (
        <div key={section.titleKey} className="doc-sec">
          <div className="doc-sec-title">{t(section.titleKey)}</div>
          <ul>
            {section.pages.map((p) => (
              <li key={p.slug}>
                <Link href={`/doc/${p.slug}`} className={`doc-link${isActive(p.slug) ? ' is-active' : ''}`}>
                  {t(p.titleKey)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
