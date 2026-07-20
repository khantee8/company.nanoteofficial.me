'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLang } from '@/lib/i18n/LangProvider';

type Plan = { id: string; title: string; audience: string; updatedAt: string };

export function PlanList() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({ title: '', brief: '', audience: '' });
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { t } = useLang();

  useEffect(() => { fetch('/api/plan').then((r) => r.json()).then((d) => setPlans(d.plans ?? [])).catch(() => setPlans([])); }, []);

  async function create() {
    if (!form.title.trim()) return;
    if (busy) return;
    setErr('');
    setBusy(true);
    try {
      const r = await fetch('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok || !d.plan) {
        setErr(d.error ?? 'failed to create plan');
        return;
      }
      router.push(`/plan/${d.plan.id}`);
    } catch {
      setErr('network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{t('plan.title')}</h1>
        <button onClick={() => setOpen((v) => !v)} style={{ padding: '8px 14px', borderRadius: 8, background: '#3b5bff', color: '#fff', border: 0 }}>{t('plan.new')}</button>
      </div>
      {open && (
        <div style={{ border: '1px solid #2a3038', borderRadius: 10, padding: 16, marginBottom: 20, display: 'grid', gap: 8 }}>
          <input placeholder={t('plan.form.title')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea placeholder={t('plan.form.brief')} rows={4} value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} />
          <input placeholder={t('plan.form.audience')} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
          {err && <p style={{ color: '#ff6b6b', fontSize: 13 }}>{err}</p>}
          <button onClick={create} disabled={busy}>{t('plan.form.create')}</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
        {plans.map((p) => (
          <a key={p.id} href={`/plan/${p.id}`} style={{ border: '1px solid #2a3038', borderRadius: 10, padding: 16, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontWeight: 600 }}>{p.title}</div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>{p.audience || t('plan.noAudience')}</div>
          </a>
        ))}
        {plans.length === 0 && <p style={{ opacity: 0.6 }}>{t('plan.empty')}</p>}
      </div>
    </main>
  );
}
