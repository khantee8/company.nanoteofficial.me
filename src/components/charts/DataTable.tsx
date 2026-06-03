import type { Artifact } from '@/lib/agents/artifacts';
import type { CSSProperties } from 'react';
import { Empty, figureStyle, capStyle } from './chrome';

type TableA = Extract<Artifact, { kind: 'table' }>;

const thBase: CSSProperties = { fontSize: 9, color: '#7a7ca6', fontWeight: 500, padding: '3px 0', borderBottom: '1px solid #1c1c3a' };
const tdBase: CSSProperties = { fontSize: 10, color: '#c5c6e2', padding: '3px 0' };
const numCss: CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

/** Simple data table; numeric cells are right-aligned. */
export function DataTable({ a, compact }: { a: TableA; compact?: boolean }) {
  const rows = a.rows ?? [];
  if (rows.length === 0) return <Empty title={a.title} />;

  return (
    <figure style={figureStyle}>
      {!compact && <figcaption style={capStyle}>{a.title}</figcaption>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {a.columns.map((col, i) => (
              <th key={i} style={i === 0 ? thBase : { ...thBase, ...numCss }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={ci > 0 && typeof cell === 'number' ? { ...tdBase, ...numCss } : tdBase}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
