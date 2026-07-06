import type { Artifact } from '@/lib/agents/artifacts';
import { Empty, figureStyle, capStyle } from './chrome';

type MatrixA = Extract<Artifact, { kind: 'matrix' }>;

const COLS: Record<MatrixA['layout'], number> = { swot: 2, canvas: 3, forces: 1 };

/** Labeled cell-grid for strategy boards (SWOT 2-col, Canvas 3-col, Five Forces single column). */
export function MatrixBoard({ a, compact }: { a: MatrixA; compact?: boolean }) {
  const cells = a.cells ?? [];
  if (cells.length === 0) return <Empty title={a.title} />;

  return (
    <figure style={figureStyle}>
      {!compact && <figcaption style={capStyle}>{a.title}</figcaption>}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS[a.layout]}, minmax(0, 1fr))`, gap: 5 }}>
        {cells.map((c, i) => (
          <div key={i} style={{ padding: compact ? 6 : 8, borderRadius: 8, background: '#0e0e24', border: '1px solid #1c1c3a' }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: '#9a9bc4', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>{c.label}</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {c.items.map((it, j) => (
                <li key={j} style={{ fontSize: 10, color: '#c5c6e2', padding: '1px 0' }}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </figure>
  );
}
