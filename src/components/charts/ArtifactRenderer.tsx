import type { Artifact } from '@/lib/agents/artifacts';
import { Bars } from './Bars';
import { Donut } from './Donut';
import { Line } from './Line';
import { DataTable } from './DataTable';
import { Scorecard } from './Scorecard';
import { Heatmap } from './Heatmap';
import { TagCloud } from './TagCloud';
import { Checklist } from './Checklist';

/** Routes an Artifact to its SVG/HTML primitive. Pure, dependency-free. */
export function ArtifactRenderer({ artifact, compact }: { artifact: Artifact; compact?: boolean }) {
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
