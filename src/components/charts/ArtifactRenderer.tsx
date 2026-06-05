'use client';

import type { Artifact } from '@/lib/agents/artifacts';
import { useLang } from '@/lib/i18n/LangProvider';
import { chartTitle } from '@/lib/i18n/chartTitles';
import { Bars } from './Bars';
import { Donut } from './Donut';
import { Line } from './Line';
import { DataTable } from './DataTable';
import { Scorecard } from './Scorecard';
import { Heatmap } from './Heatmap';
import { TagCloud } from './TagCloud';
import { Checklist } from './Checklist';

function renderChart(artifact: Artifact, compact?: boolean) {
  switch (artifact.kind) {
    case 'bars':
    case 'divergingBars': return <Bars a={artifact} compact={compact} />;
    case 'donut':         return <Donut a={artifact} compact={compact} />;
    case 'line':
    case 'sparkline':     return <Line a={artifact} compact={compact} />;
    case 'table':         return <DataTable a={artifact} compact={compact} />;
    case 'scorecard':     return <Scorecard a={artifact} compact={compact} />;
    case 'heatmap':       return <Heatmap a={artifact} compact={compact} />;
    case 'tags':          return <TagCloud a={artifact} compact={compact} />;
    case 'checklist':     return <Checklist a={artifact} compact={compact} />;
  }
}

/** Routes an Artifact to its SVG/HTML primitive, with the title localized. */
export function ArtifactRenderer({ artifact: raw, compact }: { artifact: Artifact; compact?: boolean }) {
  const { lang } = useLang();
  const artifact = { ...raw, title: chartTitle(lang, raw.title) } as Artifact;
  const badge = artifact.provenance ? (
    <span
      className={
        'text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ' +
        (artifact.provenance === 'api'
          ? 'bg-white/10 text-white/60'
          : 'bg-emerald-400/15 text-emerald-300')
      }
      title={
        artifact.provenance === 'api'
          ? 'Built from a real API (deterministic)'
          : 'Researched on the web, with citations'
      }
    >
      {artifact.provenance === 'api' ? 'api' : 'web · cited'}
    </span>
  ) : null;

  if (!badge) return renderChart(artifact, compact);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 }}>
        {badge}
      </div>
      {renderChart(artifact, compact)}
    </div>
  );
}
