import type { Artifact } from '@/lib/agents/artifacts';
import { Empty, figureStyle, capStyle } from './chrome';

type LineA = Extract<Artifact, { kind: 'line' | 'sparkline' }>;

/** Polyline over time points. `sparkline` drops axes/labels for inline use. */
export function Line({ a, compact }: { a: LineA; compact?: boolean }) {
  const pts = a.points ?? [];
  if (pts.length === 0) return <Empty title={a.title} />;

  const spark = a.kind === 'sparkline';
  const w = 240;
  const h = spark ? 36 : 104;
  const padL = spark ? 2 : 8, padR = spark ? 2 : 8;
  const padT = spark ? 4 : 16, padB = spark ? 4 : 18;
  const vals = pts.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => padL + (i / Math.max(1, pts.length - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / span) * (h - padT - padB);
  const poly = pts.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const last = pts[pts.length - 1];

  return (
    <figure style={figureStyle}>
      {!compact && !spark && <figcaption style={capStyle}>{a.title}</figcaption>}
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={a.title}>
        {!spark && <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#2a2a4a" strokeWidth={1} />}
        <polyline points={poly} fill="none" stroke="#5ad1ff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <circle cx={x(pts.length - 1)} cy={y(last.value)} r={3} fill="#5ad1ff" />
        {!spark && (
          <>
            <text x={padL} y={h - 4} fontSize={8} fill="#7a7ca6">{pts[0].t}</text>
            <text x={w - padR} y={h - 4} textAnchor="end" fontSize={8} fill="#7a7ca6">{last.t}</text>
          </>
        )}
      </svg>
    </figure>
  );
}
