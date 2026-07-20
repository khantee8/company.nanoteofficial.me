'use client';
import { useState } from 'react';
import { THEMES, type ThemeId } from '@/lib/slides/deck';
import { estimateCost } from '@/lib/slides/estimate';
import { useLang } from '@/lib/i18n/LangProvider';

export function GenerateWizard({ audience, onGenerate, busy }: { audience: string; onGenerate: (o: { theme: ThemeId; slideCount: number; extra: string }) => void; busy: boolean }) {
  const [theme, setTheme] = useState<ThemeId>('midnight');
  const [slideCount, setSlideCount] = useState(8);
  const [extra, setExtra] = useState('');
  const { t } = useLang();
  return (
    <div style={{ display: 'grid', gap: 10, border: '1px solid #2a3038', borderRadius: 10, padding: 16 }}>
      <label>{t('wizard.theme')}
        <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeId)}>
          {THEMES.map((th) => <option key={th} value={th}>{th}</option>)}
        </select>
      </label>
      <label>{t('wizard.slides')}: {slideCount}
        <input type="range" min={3} max={20} value={slideCount} onChange={(e) => setSlideCount(Number(e.target.value))} />
      </label>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{t('wizard.audience')}: {audience || 'executives'}</div>
      <textarea placeholder={t('wizard.extraPlaceholder')} rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} />
      <div style={{ fontSize: 12, opacity: 0.7 }}>{t('wizard.estCost')}: ${estimateCost(slideCount).toFixed(3)}</div>
      <button disabled={busy} onClick={() => onGenerate({ theme, slideCount, extra })} style={{ padding: '10px 16px', borderRadius: 8, background: '#3b5bff', color: '#fff', border: 0 }}>
        {busy ? t('wizard.generating') : t('wizard.generate')}
      </button>
    </div>
  );
}
