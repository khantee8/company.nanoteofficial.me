'use client';
import { useLang } from '@/lib/i18n/LangProvider';
export function ExportButtons({ planId, versionNo }: { planId: string; versionNo: number }) {
  const { t } = useLang();
  return (
    <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <a href={`/api/plan/${planId}/export?fmt=pptx&v=${versionNo}`} style={{ padding: '6px 12px', border: '1px solid #2a3038', borderRadius: 6 }}>{t('export.pptx')}</a>
      <button onClick={() => window.print()} style={{ padding: '6px 12px', border: '1px solid #2a3038', borderRadius: 6, background: 'transparent', color: 'inherit' }}>{t('export.pdf')}</button>
    </div>
  );
}
