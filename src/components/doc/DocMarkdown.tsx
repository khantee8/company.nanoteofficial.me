import React from 'react';

// A small, SAFE markdown renderer for the docs (no dangerouslySetInnerHTML).
// Supports: # / ## / ### headings, unordered lists, fenced code blocks, and
// inline **bold**, `code`, and [label](url) links with URL validation. Anything
// it doesn't recognise renders as plain text — never as raw HTML.

/** Only http(s), site-relative, or in-page anchors are allowed as link targets. */
function safeHref(url: string): string | null {
  return /^(https?:\/\/|\/|#)/.test(url.trim()) ? url.trim() : null;
}

const INLINE_RE = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[2] !== undefined) {
      out.push(<strong key={key}>{m[2]}</strong>);
    } else if (m[4] !== undefined) {
      out.push(<code key={key} className="doc-code">{m[4]}</code>);
    } else if (m[6] !== undefined) {
      const href = safeHref(m[7]);
      const external = href ? /^https?:\/\//.test(href) : false;
      out.push(
        href ? (
          <a key={key} href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
            {m[6]}
          </a>
        ) : (
          m[6] // unsafe URL → render the label as plain text
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function DocMarkdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = (text ?? '').split('\n');
  let list: string[] = [];
  let code: string[] | null = null;

  const flushList = (key: string) => {
    if (list.length) {
      const items = list;
      blocks.push(
        <ul key={key} className="doc-ul">
          {items.map((li, i) => <li key={i}>{renderInline(li, `${key}-${i}`)}</li>)}
        </ul>,
      );
      list = [];
    }
  };

  // A plain loop (not forEach) so TS tracks the `code` fence state across lines.
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (line.trim().startsWith('```')) {
      if (code === null) { flushList(`l${i}`); code = []; }
      else { blocks.push(<pre key={`c${i}`} className="doc-pre"><code>{code.join('\n')}</code></pre>); code = null; }
      continue;
    }
    if (code !== null) { code.push(raw); continue; }

    if (/^###\s+/.test(line)) { flushList(`l${i}`); blocks.push(<h3 key={i}>{renderInline(line.replace(/^###\s+/, ''), `h${i}`)}</h3>); }
    else if (/^##\s+/.test(line)) { flushList(`l${i}`); blocks.push(<h2 key={i}>{renderInline(line.replace(/^##\s+/, ''), `h${i}`)}</h2>); }
    else if (/^#\s+/.test(line)) { flushList(`l${i}`); blocks.push(<h1 key={i}>{renderInline(line.replace(/^#\s+/, ''), `h${i}`)}</h1>); }
    else if (/^[-*]\s+/.test(line)) { list.push(line.replace(/^[-*]\s+/, '')); }
    else if (line === '') { flushList(`l${i}`); }
    else { flushList(`l${i}`); blocks.push(<p key={i}>{renderInline(line, `p${i}`)}</p>); }
  }

  flushList('end');
  if (code !== null) blocks.push(<pre key="cend" className="doc-pre"><code>{code.join('\n')}</code></pre>);

  return <div className="doc-md">{blocks}</div>;
}
