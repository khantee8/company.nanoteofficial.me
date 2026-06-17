// Dependency-free client export helpers (migrated from AdminClient.tsx).
import type { HistoryEntry } from '@/lib/agents/types';

export function downloadBlob(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function exportMarkdown(name: string, markdown: string) {
  downloadBlob(`${name}.md`, markdown, 'text/markdown');
}

/** Guard against CSV/Excel formula injection in exported cells. */
export function csvCell(value: string): string {
  let v = String(value ?? '');
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

export function exportHistoryCsv(name: string, history: HistoryEntry[]) {
  const rows = [['date', 'summary', 'highlight'], ...history.map((h) => [h.date, h.summary, h.highlight])];
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  downloadBlob(`${name}-history.csv`, csv, 'text/csv');
}

/** Print-to-PDF via a clean popup window; body built with textContent only. */
export function exportPdf(title: string, markdown: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const d = w.document;
  const style = d.createElement('style');
  style.textContent =
    `body{font-family:Georgia,'Times New Roman',serif;max-width:720px;margin:36px auto;padding:0 24px;line-height:1.6;color:#111}` +
    `h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px}` +
    `pre{white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:13px;margin:0}` +
    `footer{margin-top:24px;color:#888;font-size:11px}`;
  d.head.appendChild(style);
  d.title = `${title} — NaNote Corp`;
  const h1 = d.createElement('h1'); h1.textContent = title;
  const pre = d.createElement('pre'); pre.textContent = markdown;
  const footer = d.createElement('footer');
  footer.textContent = `NaNote Corp · company.nanoteofficial.me · exported ${new Date().toLocaleString()}`;
  d.body.append(h1, pre, footer);
  setTimeout(() => w.print(), 300);
}
