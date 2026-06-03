import type { Artifact } from '@/lib/agents/artifacts';
import { Empty, figureStyle, capStyle } from './chrome';

type HeatA = Extract<Artifact, { kind: 'heatmap' }>;

/** Row of cells shaded by `level` (0 = empty, higher = more activity). */
export function Heatmap({ a, compact }: { a: HeatA; compact?: boolean }) {
  const cells = a.cells ?? [];
  if (cells.length === 0) return <Empty title={a.title} />;

  const max = Math.max(1, ...cells.map((c) => c.level));
  const shade = (level: number) => {
    if (level <= 0) return '#14142a';
    const alpha = 0.25 + 0.75 * (level / max);
    return `rgba(61, 220, 151, ${alpha.toFixed(2)})`;
  };

  return (
    <figure style={figureStyle}>
      {!compact && <figcaption style={capStyle}>{a.title}</figcaption>}
      <div style={{ display: 'flex', gap: 4 }}>
        {cells.map((cell, i) => (
          <div key={i} title={`${cell.label}: ${cell.level}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 16, height: 16, borderRadius: 4, background: shade(cell.level) }} />
            <span style={{ fontSize: 8, color: '#7a7ca6' }}>{cell.label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
