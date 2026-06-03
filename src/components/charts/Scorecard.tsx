import type { Artifact } from '@/lib/agents/artifacts';
import { Empty, figureStyle, capStyle } from './chrome';

type ScoreA = Extract<Artifact, { kind: 'scorecard' }>;

const STATE_COLOR = { ok: '#3ddc97', warn: '#ffaa00', down: '#ff5470' } as const;

/** Tile grid; each tile colored by its ok/warn/down state. */
export function Scorecard({ a, compact }: { a: ScoreA; compact?: boolean }) {
  const tiles = a.tiles ?? [];
  if (tiles.length === 0) return <Empty title={a.title} />;

  return (
    <figure style={figureStyle}>
      {!compact && <figcaption style={capStyle}>{a.title}</figcaption>}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(tiles.length, 6)}, 1fr)`, gap: 5 }}>
        {tiles.map((t, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 4px', borderRadius: 8, background: '#0e0e24', border: '1px solid #1c1c3a' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: STATE_COLOR[t.state], boxShadow: `0 0 7px ${STATE_COLOR[t.state]}66` }} />
            <span style={{ fontSize: 8, color: '#9a9bc4', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{t.label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
