import type { Artifact } from '@/lib/agents/artifacts';
import { Empty, fmt, figureStyle, capStyle, UP, DOWN, NEUTRAL } from './chrome';

type BarsA = Extract<Artifact, { kind: 'bars' | 'divergingBars' | 'donut' }>;

/** Horizontal bar chart; `divergingBars` centers a zero axis (green ≥0 / red <0). */
export function Bars({ a, compact }: { a: BarsA; compact?: boolean }) {
  const series = a.series ?? [];
  if (series.length === 0) return <Empty title={a.title} />;

  const diverging = a.kind === 'divergingBars';
  const max = Math.max(1, ...series.map((s) => Math.abs(s.value)));
  const rowH = compact ? 16 : 22;
  const h = series.length * rowH + 6;
  const labelW = 56;
  const barW = 190;
  const total = labelW + barW + 44;
  const zeroX = diverging ? labelW + barW / 2 : labelW;
  const fs = compact ? 8 : 9;

  return (
    <figure style={figureStyle}>
      {!compact && <figcaption style={capStyle}>{a.title}</figcaption>}
      <svg width="100%" height={h} viewBox={`0 0 ${total} ${h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={a.title}>
        {diverging && <line x1={zeroX} y1={2} x2={zeroX} y2={h - 4} stroke="#2a2a4a" strokeWidth={1} />}
        {series.map((s, i) => {
          const y = i * rowH + 3;
          const len = Math.max(1, (Math.abs(s.value) / max) * (diverging ? barW / 2 : barW));
          const neg = s.value < 0;
          const x = diverging && neg ? zeroX - len : zeroX;
          const color = s.color ?? (diverging ? (neg ? DOWN : UP) : NEUTRAL);
          return (
            <g key={i}>
              <text x={labelW - 6} y={y + rowH * 0.55} textAnchor="end" fontSize={fs} fill="#7a7ca6">{s.label}</text>
              <rect x={x} y={y} width={len} height={rowH - 8} rx={2} fill={color} />
              <text x={diverging && neg ? x - 4 : x + len + 4} y={y + rowH * 0.55}
                textAnchor={diverging && neg ? 'end' : 'start'} fontSize={fs} fill="#dfe0f2">{fmt(s.value, a.unit)}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
