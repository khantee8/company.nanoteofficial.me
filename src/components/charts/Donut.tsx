import type { Artifact } from '@/lib/agents/artifacts';
import { Empty, figureStyle, capStyle, PALETTE } from './chrome';

type DonutA = Extract<Artifact, { kind: 'bars' | 'divergingBars' | 'donut' }>;

/** Stacked-arc donut from a positive series, with the total in the center. */
export function Donut({ a, compact }: { a: DonutA; compact?: boolean }) {
  const series = (a.series ?? []).filter((s) => s.value > 0);
  if (series.length === 0) return <Empty title={a.title} />;

  const total = series.reduce((n, s) => n + s.value, 0);
  const cx = 46, cy = 46, r = 32;
  const c = 2 * Math.PI * r;
  const size = compact ? 84 : 104;
  // Prefix-sum offsets — no in-render mutation (keeps the React-compiler lint happy).
  const dashes = series.map((s) => (s.value / total) * c);
  const offsets = dashes.map((_, i) => dashes.slice(0, i).reduce((a, b) => a + b, 0));

  return (
    <figure style={figureStyle}>
      {!compact && <figcaption style={capStyle}>{a.title}</figcaption>}
      <svg width={size} height={size} viewBox="0 0 92 92" role="img" aria-label={a.title}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1c1c3a" strokeWidth={13} />
        {series.map((s, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color ?? PALETTE[i % PALETTE.length]} strokeWidth={13}
            strokeDasharray={`${dashes[i]} ${c - dashes[i]}`} strokeDashoffset={-offsets[i]}
            transform={`rotate(-90 ${cx} ${cy})`} />
        ))}
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize={15} fontWeight={700} fill="#fff">{total}</text>
      </svg>
    </figure>
  );
}
