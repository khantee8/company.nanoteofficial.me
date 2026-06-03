// Shared chrome for the SVG chart primitives: caption, empty-state, number
// formatting, and the accent palette. Pure presentational helpers — no deps.
import type { CSSProperties } from 'react';

export const figureStyle: CSSProperties = { margin: 0, minWidth: 0 };
export const capStyle: CSSProperties = { fontSize: 11, fontWeight: 600, color: '#dfe0f2', margin: '0 0 6px' };

export const PALETTE = ['#3ddc97', '#ff6b86', '#ffaa00', '#5ad1ff', '#c77dff', '#f5c451'];
export const UP = '#3ddc97';
export const DOWN = '#ff6b86';
export const NEUTRAL = '#7f8cff';

export function Empty({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 11, color: '#6a6c93', padding: '8px 0' }}>
      {title}: <span style={{ color: '#4a4c6e' }}>no data</span>
    </div>
  );
}

/** Compact number formatting with optional unit (percent gets a sign). */
export function fmt(v: number, unit?: string): string {
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  if (unit === '%') return `${v > 0 ? '+' : ''}${s}%`;
  return unit ? `${s}${unit}` : s;
}
