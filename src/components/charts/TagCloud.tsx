import type { Artifact } from '@/lib/agents/artifacts';
import { Empty, figureStyle, capStyle } from './chrome';

type TagsA = Extract<Artifact, { kind: 'tags' }>;

/** Pill list of tags. */
export function TagCloud({ a, compact }: { a: TagsA; compact?: boolean }) {
  const tags = a.tags ?? [];
  if (tags.length === 0) return <Empty title={a.title} />;

  return (
    <figure style={figureStyle}>
      {!compact && <figcaption style={capStyle}>{a.title}</figcaption>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {tags.map((t, i) => (
          <span key={i} style={{ fontSize: 9, color: '#9ad', background: '#11203f', border: '1px solid #1f3a6a', borderRadius: 10, padding: '1px 8px' }}>{t}</span>
        ))}
      </div>
    </figure>
  );
}
