import type { Artifact } from '@/lib/agents/artifacts';
import { Empty, figureStyle, capStyle } from './chrome';

type ChecklistA = Extract<Artifact, { kind: 'checklist' }>;

/** ☑ / ☐ list of items. */
export function Checklist({ a, compact }: { a: ChecklistA; compact?: boolean }) {
  const items = a.items ?? [];
  if (items.length === 0) return <Empty title={a.title} />;

  return (
    <figure style={figureStyle}>
      {!compact && <figcaption style={capStyle}>{a.title}</figcaption>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontSize: 10, color: item.done ? '#7a7ca6' : '#c5c6e2', padding: '2px 0', display: 'flex', gap: 6 }}>
            <span style={{ color: item.done ? '#3ddc97' : '#5a5c7e' }}>{item.done ? '☑' : '☐'}</span>
            <span style={item.done ? { textDecoration: 'line-through' } : undefined}>{item.text}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
