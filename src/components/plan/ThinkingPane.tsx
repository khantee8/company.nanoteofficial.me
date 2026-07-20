'use client';
import type { StepNote } from '@/lib/slides/pipeline';
import { useLang } from '@/lib/i18n/LangProvider';
import type { MsgKey } from '@/lib/i18n/messages';

const LABEL_KEY: Record<string, MsgKey> = { outline: 'thinking.outline', draft: 'thinking.draft', lint: 'thinking.lint', critic: 'thinking.critic' };

export function ThinkingPane({ steps, done }: { steps: StepNote[]; done: boolean }) {
  const { t } = useLang();
  return (
    <div style={{ display: 'grid', gap: 12, gridAutoRows: 'min-content' }}>
      <div className="slide-kicker">{t('thinking.title')}</div>
      {steps.map((s, i) => (
        <div key={i} style={{ borderLeft: '2px solid var(--accent,#3b5bff)', paddingLeft: 12 }}>
          <div style={{ fontWeight: 600 }}>{LABEL_KEY[s.step] ? t(LABEL_KEY[s.step]) : s.step}</div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>{s.note}</div>
          {s.step === 'lint' && Array.isArray(s.data) && (s.data as unknown[]).length > 0 && (
            <ul style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
              {(s.data as { slideIndex: number; rule: string }[]).map((it, j) => <li key={j}>slide {it.slideIndex}: {it.rule}</li>)}
            </ul>
          )}
        </div>
      ))}
      {!done && steps.length > 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>{t('thinking.working')}</div>}
    </div>
  );
}
