'use client';

import React from 'react';

export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split('\n');
  let list: string[] = [];
  const flushList = (key: string) => {
    if (list.length) {
      blocks.push(<ul key={key} style={{ margin: '6px 0 12px', paddingLeft: 20 }}>{list.map((li, i) => <li key={i} style={{ fontSize: 14, lineHeight: 1.7, color: '#d7d8ea', marginBottom: 3 }}>{li}</li>)}</ul>);
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^###\s+/.test(line)) { flushList(`l${i}`); blocks.push(<h4 key={i} style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '14px 0 4px' }}>{line.replace(/^###\s+/, '')}</h4>); }
    else if (/^##\s+/.test(line)) { flushList(`l${i}`); blocks.push(<h3 key={i} style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '18px 0 6px' }}>{line.replace(/^##\s+/, '')}</h3>); }
    else if (/^#\s+/.test(line)) { flushList(`l${i}`); blocks.push(<h2 key={i} style={{ fontSize: 19, fontWeight: 700, color: '#fff', margin: '20px 0 8px' }}>{line.replace(/^#\s+/, '')}</h2>); }
    else if (/^[-*]\s+/.test(line)) { list.push(line.replace(/^[-*]\s+/, '')); }
    else if (line === '') { flushList(`l${i}`); }
    else { flushList(`l${i}`); blocks.push(<p key={i} style={{ fontSize: 15, lineHeight: 1.7, color: '#d7d8ea', margin: '0 0 10px' }}>{line}</p>); }
  });
  flushList('end');
  return <div>{blocks}</div>;
}
