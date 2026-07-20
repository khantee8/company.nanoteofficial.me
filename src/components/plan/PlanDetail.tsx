'use client';
import { useEffect, useState } from 'react';
import type { ThemeId, Deck } from '@/lib/slides/deck';
import type { StepNote } from '@/lib/slides/pipeline';
import { GenerateWizard } from './GenerateWizard';
import { ThinkingPane } from './ThinkingPane';
import { DeckRenderer } from './DeckRenderer';
import { VersionSwitcher } from './VersionSwitcher';
import { ExportButtons } from './ExportButtons';

type Plan = { id: string; title: string; brief: string; audience: string };
type Version = { versionNo: number; deck: Deck; meta: { costUsd: number; lintFixed: number } };

export function PlanDetail({ id }: { id: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [shown, setShown] = useState<Deck | null>(null);
  // Tracks which version number is currently displayed on the right so
  // ExportButtons exports the version actually shown, not always the latest
  // (VersionSwitcher can select an older version independently of `versions[0]`).
  const [shownVersionNo, setShownVersionNo] = useState<number | null>(null);
  const [steps, setSteps] = useState<StepNote[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    const d = await fetch(`/api/plan/${id}`).then((r) => r.json());
    setPlan(d.plan); setVersions(d.versions ?? []);
    if (d.latest) { setShown(d.latest.deck); setShownVersionNo(d.latest.versionNo); }
  }
  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await load(); })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function generate(opts: { theme: ThemeId; slideCount: number; extra: string }) {
    setBusy(true); setErr(''); setSteps([]); setShown(null);
    try {
      const res = await fetch(`/api/plan/${id}/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(opts) });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop() ?? '';
        for (const p of parts) {
          const line = p.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'step') setSteps((s) => [...s, ev]);
            else if (ev.type === 'done') { setShown(ev.deck); setShownVersionNo(ev.versionNo); await load(); }
            else if (ev.type === 'error') setErr(ev.message);
          } catch {
            continue;
          }
        }
      }
    } catch {
      setErr('generation stream failed — try again');
    } finally {
      setBusy(false);
    }
  }

  if (!plan) return <main style={{ padding: 24 }}>Loading…</main>;
  return (
    <main style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 20, padding: 20, alignItems: 'start' }}>
      <section style={{ display: 'grid', gap: 16 }}>
        <div><h1 style={{ fontSize: 22, fontWeight: 700 }}>{plan.title}</h1><p style={{ fontSize: 13, opacity: 0.7, whiteSpace: 'pre-wrap' }}>{plan.brief}</p></div>
        <GenerateWizard audience={plan.audience} onGenerate={generate} busy={busy} />
        {steps.length > 0 && <ThinkingPane steps={steps} done={!busy} />}
        {err && <p style={{ color: '#ff6b6b' }}>{err}</p>}
        {versions.length > 0 && <VersionSwitcher planId={id} versions={versions} onPick={(d, versionNo) => { setShown(d); setShownVersionNo(versionNo); }} />}
      </section>
      <section>
        {shown ? <><ExportButtons planId={id} versionNo={shownVersionNo ?? versions[0]?.versionNo ?? 1} /><DeckRenderer deck={shown} /></> : <p style={{ opacity: 0.5 }}>Generate a deck to see it here.</p>}
      </section>
    </main>
  );
}
