'use client';
import { useState } from 'react';
import { THEMES, type ThemeId } from '@/lib/slides/deck';
import { estimateCost } from '@/lib/slides/pipeline';

export function GenerateWizard({ audience, onGenerate, busy }: { audience: string; onGenerate: (o: { theme: ThemeId; slideCount: number; extra: string }) => void; busy: boolean }) {
  const [theme, setTheme] = useState<ThemeId>('midnight');
  const [slideCount, setSlideCount] = useState(8);
  const [extra, setExtra] = useState('');
  return (
    <div style={{ display: 'grid', gap: 10, border: '1px solid #2a3038', borderRadius: 10, padding: 16 }}>
      <label>Theme
        <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeId)}>
          {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label>Slides: {slideCount}
        <input type="range" min={3} max={20} value={slideCount} onChange={(e) => setSlideCount(Number(e.target.value))} />
      </label>
      <div style={{ fontSize: 12, opacity: 0.7 }}>Audience: {audience || 'executives'}</div>
      <textarea placeholder="Optional extra context" rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} />
      <div style={{ fontSize: 12, opacity: 0.7 }}>Est. cost: ${estimateCost(slideCount).toFixed(3)}</div>
      <button disabled={busy} onClick={() => onGenerate({ theme, slideCount, extra })} style={{ padding: '10px 16px', borderRadius: 8, background: '#3b5bff', color: '#fff', border: 0 }}>
        {busy ? 'Generating…' : '✦ AI Slide'}
      </button>
    </div>
  );
}
