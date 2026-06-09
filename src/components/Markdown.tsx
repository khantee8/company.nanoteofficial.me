'use client';

import React from 'react';

// Render inline `**bold**` spans as <strong>; everything else is plain text.
// Safe by construction — only text nodes and <strong> elements, no HTML.
function renderInline(text: string): React.ReactNode {
  if (!text.includes('**')) return text;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p)
      ? <strong key={i} style={{ color: '#fff', fontWeight: 700 }}>{p.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{p}</React.Fragment>,
  );
}

const isTableRow = (s: string) => s.startsWith('|') && s.includes('|', 1);
// a |---|:--:|---| divider row (dashes/colons/pipes/spaces only, at least one dash)
const isTableDivider = (s: string) => /^\|?[\s:|-]+\|?$/.test(s) && s.includes('-');

const splitCells = (row: string) =>
  row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split('\n');
  let list: string[] = [];
  const flushList = (key: string) => {
    if (list.length) {
      blocks.push(<ul key={key} style={{ margin: '6px 0 12px', paddingLeft: 20 }}>{list.map((li, i) => <li key={i} style={{ fontSize: 14, lineHeight: 1.7, color: '#d7d8ea', marginBottom: 3 }}>{renderInline(li)}</li>)}</ul>);
      list = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    // Table: a run of consecutive pipe rows. First row = header; a |---| row
    // right after it is the divider (skipped); remaining rows are the body.
    if (isTableRow(line.trim())) {
      flushList(`l${i}`);
      const rows: string[] = [];
      let j = i;
      while (j < lines.length && isTableRow(lines[j].trim())) { rows.push(lines[j].trim()); j++; }
      const hasDivider = rows.length > 1 && isTableDivider(rows[1]);
      const headerCells = splitCells(rows[0]);
      const bodyRows = rows.slice(hasDivider ? 2 : 1).map(splitCells);
      blocks.push(
        <div key={`tbl${i}`} style={{ overflowX: 'auto', margin: '10px 0 14px' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>{headerCells.map((c, k) => <th key={k} style={{ border: '1px solid #2a2a4a', padding: '6px 9px', textAlign: 'left', color: '#fff', background: '#16163080', fontWeight: 700 }}>{renderInline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {bodyRows.map((cells, r) => (
                <tr key={r}>{cells.map((c, k) => <td key={k} style={{ border: '1px solid #2a2a4a', padding: '6px 9px', color: '#d7d8ea', lineHeight: 1.6 }}>{renderInline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      i = j - 1;
      continue;
    }

    if (/^###\s+/.test(line)) { flushList(`l${i}`); blocks.push(<h4 key={i} style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '14px 0 4px' }}>{renderInline(line.replace(/^###\s+/, ''))}</h4>); }
    else if (/^##\s+/.test(line)) { flushList(`l${i}`); blocks.push(<h3 key={i} style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '18px 0 6px' }}>{renderInline(line.replace(/^##\s+/, ''))}</h3>); }
    else if (/^#\s+/.test(line)) { flushList(`l${i}`); blocks.push(<h2 key={i} style={{ fontSize: 19, fontWeight: 700, color: '#fff', margin: '20px 0 8px' }}>{renderInline(line.replace(/^#\s+/, ''))}</h2>); }
    else if (/^[-*]\s+/.test(line)) { list.push(line.replace(/^[-*]\s+/, '')); }
    else if (line === '') { flushList(`l${i}`); }
    else { flushList(`l${i}`); blocks.push(<p key={i} style={{ fontSize: 15, lineHeight: 1.7, color: '#d7d8ea', margin: '0 0 10px' }}>{renderInline(line)}</p>); }
  }
  flushList('end');
  return <div>{blocks}</div>;
}
