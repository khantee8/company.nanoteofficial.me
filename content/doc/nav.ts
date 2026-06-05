import type { MsgKey } from '@/lib/i18n/messages';

// The single source of truth for the /doc sidebar order AND the static routes
// (generateStaticParams reads getDocSlugs()). Titles are i18n message keys so the
// sidebar localizes with the same v1.4.1 toggle. Each `slug` must have a matching
// content/doc/en/<slug>.md and content/doc/th/<slug>.md.

export interface DocPage {
  slug: string;
  titleKey: MsgKey;
}
export interface DocSection {
  titleKey: MsgKey;
  pages: DocPage[];
}

export const DOC_NAV: DocSection[] = [
  {
    titleKey: 'doc.sec.start',
    pages: [
      { slug: 'overview', titleKey: 'doc.overview' },
      { slug: 'agents', titleKey: 'doc.agents' },
    ],
  },
  {
    titleKey: 'doc.sec.runs',
    pages: [{ slug: 'cadence', titleKey: 'doc.cadence' }],
  },
  {
    titleKey: 'doc.sec.using',
    pages: [
      { slug: 'dashboard', titleKey: 'doc.dashboard' },
      { slug: 'knowledge-base', titleKey: 'doc.kb' },
      { slug: 'telegram', titleKey: 'doc.telegram' },
    ],
  },
  {
    titleKey: 'doc.sec.operating',
    pages: [{ slug: 'admin', titleKey: 'doc.admin' }],
  },
];

/** Default landing page for /doc. */
export const DOC_HOME = 'overview';
