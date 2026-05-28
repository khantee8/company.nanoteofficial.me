'use client';

import React from 'react';

export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split('\n');
  let list: string[] = [];
  const flushList = (key: string) => {
    if (list.length) {
      blocks.push(<ul key={key} style={{ margin: '4px 0 8px', paddingLeft: 16 }}>{list.map((li, i) => <li key={i} style={{ fontSize: 11, lineHeight: 1.5, color: '#bbb' }}>{li}</li>)}</ul>);
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^###\s+/.test(line)) { flushList(`l${i}`); blocks.push(<h4 key={i} style={{ fontSize: 11, color: '#fff', margin: '8px 0 2px' }}>{line.replace(/^###\s+/, '')}</h4>); }
    else if (/^##\s+/.test(line)) { flushList(`l${i}`); blocks.push(<h3 key={i} style={{ fontSize: 12, color: '#fff', margin: '10px 0 3px' }}>{line.replace(/^##\s+/, '')}</h3>); }
    else if (/^#\s+/.test(line)) { flushList(`l${i}`); blocks.push(<h2 key={i} style={{ fontSize: 13, color: '#fff', margin: '10px 0 4px' }}>{line.replace(/^#\s+/, '')}</h2>); }
    else if (/^[-*]\s+/.test(line)) { list.push(line.replace(/^[-*]\s+/, '')); }
    else if (line === '') { flushList(`l${i}`); }
    else { flushList(`l${i}`); blocks.push(<p key={i} style={{ fontSize: 11, lineHeight: 1.6, color: '#bbb', margin: '0 0 6px' }}>{line}</p>); }
  });
  flushList('end');
  return <div>{blocks}</div>;
}
