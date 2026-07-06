import { completeRaw, applyOverrides } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import { fetchDeployments, formatDeployments, type DeployState } from '@/lib/sources/vercelApi';
import { fetchActivity, formatActivity, type RepoActivity } from '@/lib/sources/githubApi';
import { normalizeTags, withProvenance, type Artifact, type Citation } from './artifacts';
import { extractFindingsBlock, hasCitation } from './findings';
import type { AgentRunResult, AgentContext } from './types';
import {
  assessCompanyHealth, criticalAlerts, overallSeverity, formatHealth, worst,
  type AgentHealth, type Severity,
} from './health';
import { aggregateUsage, assessBudget, type UsageAggregate } from './usage';

const shortProject = (p: string) => p.replace('.nanoteofficial.me', '').replace('nanoteofficial.me', 'portfolio');

// ─── Findings types + parser ──────────────────────────────────────────────────

export interface OpsNote { text: string; citation: Citation }
export interface OperationsFindings { fixToday: string; notes: OpsNote[] }

export function parseOperationsFindings(markdown: string): OperationsFindings | null {
  const raw = extractFindingsBlock<Partial<OperationsFindings>>(markdown);
  if (!raw) return null;
  const notes = Array.isArray(raw.notes) ? raw.notes.filter(
    (n): n is OpsNote => !!n && typeof n.text === 'string' && hasCitation(n as { citation?: Partial<Citation> }),
  ) : [];
  return { fixToday: typeof raw.fixToday === 'string' ? raw.fixToday : '', notes };
}

/** Web·cited ops notes table (only when external refs were used). */
export function opsNoteArtifacts(f: OperationsFindings): Artifact[] {
  if (f.notes.length === 0) return [];
  const sources = f.notes.map((n) => n.citation);
  return [
    withProvenance({
      kind: 'table', title: 'ops notes (researched)', columns: ['note'],
      rows: f.notes.map((n) => [n.text]),
    }, 'web', sources),
  ];
}

/** Ops charts built deterministically from CI/CD state — no LLM involvement. */
export function opsArtifacts(deploys: DeployState[], activity: RepoActivity[]): Artifact[] {
  const arts: Artifact[] = [];

  if (deploys.length > 0) {
    arts.push({
      kind: 'scorecard',
      title: 'deployment health',
      tiles: deploys.map((d) => ({
        label: shortProject(d.project),
        state: d.ok ? 'ok' : /build|queue|init/i.test(d.state) ? 'warn' : 'down',
      })),
    });
  }

  if (activity.length > 0) {
    arts.push({
      kind: 'table',
      title: 'repo activity',
      columns: ['repo', 'last commit', 'ci'],
      rows: activity.map((a) => [a.repo.split('/')[1] ?? a.repo, a.lastCommit ?? '—', a.lastCi ?? 'n/a']),
    });
  }

  return arts.map((a) => withProvenance(a, 'api'));
}

const SEVERITY_TILE: Record<Severity, 'ok' | 'warn' | 'down'> = {
  ok: 'ok', info: 'ok', warning: 'warn', critical: 'down',
};
const SEVERITY_LABEL: Record<Severity, string> = {
  ok: '🟢 ok', info: '🟢 info', warning: '🟡 warning', critical: '🔴 critical',
};

/** Internal agent-monitoring charts — deterministic from the health snapshot. */
export function agentHealthArtifacts(healths: AgentHealth[]): Artifact[] {
  if (healths.length === 0) return [];
  const arts: Artifact[] = [
    {
      kind: 'scorecard',
      title: 'agent health',
      tiles: healths.map((h) => ({ label: h.dept.toUpperCase(), state: SEVERITY_TILE[h.severity] })),
    },
  ];
  const unhealthy = healths.filter((h) => h.severity === 'warning' || h.severity === 'critical');
  if (unhealthy.length > 0) {
    arts.push({
      kind: 'table',
      title: 'agent issues',
      columns: ['agent', 'severity', 'issue'],
      rows: unhealthy.map((h) => [
        h.dept.toUpperCase(),
        SEVERITY_LABEL[h.severity],
        h.issues.map((i) => i.detail).join('; '),
      ]),
    });
  }
  return arts.map((a) => withProvenance(a, 'api'));
}

/** Parse MONTHLY_BUDGET_USD → a positive number, or null (display-only). */
export function parseBudget(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Cost/budget charts built deterministically from our own ledger aggregate. */
export function operationsCostArtifacts(agg: UsageAggregate): Artifact[] {
  const arts: Artifact[] = [];
  if (agg.perDept.length > 0) {
    arts.push({
      kind: 'bars', title: 'agent cost (MTD)', unit: '$',
      series: agg.perDept.map((d) => ({ label: d.dept.toUpperCase(), value: Number(d.costUsd.toFixed(2)) })),
    });
  }
  const rows: string[][] = [
    ['spend (MTD)', `$${agg.mtdUsd.toFixed(2)}`],
    ['tokens (MTD)', agg.mtdTokens.toLocaleString('en-US')],
    ['burn (7d avg)', `$${agg.last7dBurnUsdPerDay.toFixed(2)}/day`],
  ];
  if (agg.budgetUsd != null) {
    rows.push(['budget', `$${agg.budgetUsd.toFixed(2)}/mo`]);
    rows.push(['used', `${Math.round(agg.pctUsed ?? 0)}%`]);
    rows.push(['projected month-end', `$${agg.projectedMonthEndUsd.toFixed(2)}`]);
  } else {
    rows.push(['budget', 'tracking only (set MONTHLY_BUDGET_USD)']);
  }
  arts.push({ kind: 'table', title: 'cost & budget', columns: ['metric', 'value'], rows });
  return arts.map((a) => withProvenance(a, 'api'));
}

export function opsTags(deploys: DeployState[], activity: RepoActivity[]): string[] {
  const ci = activity.map((a) => a.lastCi).filter((c): c is string => !!c);
  return normalizeTags(['ci-cd', 'vercel', 'deploy', ...ci]);
}

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const [deploys, activity] = await Promise.all([
    fetchDeployments().catch(() => []),
    fetchActivity().catch(() => []),
  ]);
  const deployLines = formatDeployments(deploys);
  const activityLines = formatActivity(activity);
  const allOk = deploys.length > 0 && deploys.every((d) => d.ok);

  const snap = ctx.companySnapshot;
  const healths = snap
    ? assessCompanyHealth({
        statuses: snap.statuses, outputs: snap.outputs ?? [], digest: snap.digest, now: Date.now(),
      })
    : [];
  const healthLines = formatHealth(healths);
  const agentWorst = overallSeverity(healths);
  const crit = criticalAlerts(healths);

  const agg = aggregateUsage(snap?.usage ?? [], {
    now: Date.now(),
    budgetUsd: parseBudget(process.env.MONTHLY_BUDGET_USD),
  });
  const budget = assessBudget(agg);
  const combinedWorst = worst([agentWorst, budget?.severity ?? 'ok']);
  const budgetLine = agg.budgetUsd == null
    ? `tracking only — MTD $${agg.mtdUsd.toFixed(2)}, burn $${agg.last7dBurnUsdPerDay.toFixed(2)}/day (no budget set)`
    : (budget?.detail ?? `budget ok — $${agg.mtdUsd.toFixed(2)} / $${agg.budgetUsd.toFixed(2)}`);

  const sweepLines = (ctx.companySnapshot?.sweeps ?? [])
    .map((s) => `${new Date(s.ts).toISOString().slice(0, 10)} ${s.dept}: ${s.ok ? 'auto-recovered' : 'RETRY FAILED'} — ${s.detail}`)
    .join('\n');

  const context = formatContext(ctx);
  const { text: markdown, stopReason, usage, model } = await completeRaw(applyOverrides({
    system: PERSONAS.ops,
    prompt: `${context ? context + '\n\n---\n\n' : ''}CI/CD snapshot.\n\nDeployments:\n${deployLines.join('\n') || 'none'}\n\nRepo activity:\n${activityLines.join('\n') || 'none'}\n\nAgent run-health (internal monitoring):\n${healthLines || 'no snapshot'}\n\nSelf-heal sweep log (watchdog auto-retries):\n${sweepLines || 'no sweeps'}\n\nงบประมาณ Claude API (internal):\n${budgetLine}\n\nสรุปสุขภาพ deploy/CI และสุขภาพการทำงานของเอเจนต์อื่น แล้วชี้ "สิ่งเดียวที่ควรแก้วันนี้" วิเคราะห์เอเจนต์ที่มีปัญหา (error/stale/truncated/empty) พร้อมสาเหตุและวิธีแก้ และใส่ประเด็นเหล่านี้ในส่วน ## Flags เพื่อส่งต่อ CEO (รวมถึงงบประมาณถ้าใกล้หรือเกินลิมิต) สรุปผลการซ่อมอัตโนมัติ (self-heal) ในรายงานด้วย — อะไรพังแล้วระบบซ่อมเองสำเร็จ อะไรซ่อมไม่สำเร็จและต้องการคน ถ้าต้องอ้างอิงภายนอก (status page/changelog) ให้ค้นเว็บและแนบแหล่ง เปิดรายงานด้วยบล็อก \`\`\`json findings ตามสคีมาในบทบาทของคุณ`,
    webSearch: true,
    maxSearches: 3,
    maxTokens: 8000,
  }, ctx));

  const findings = parseOperationsFindings(markdown) ?? { fixToday: '', notes: [] };
  const artifacts = [
    ...opsArtifacts(deploys, activity),
    ...agentHealthArtifacts(healths),
    ...operationsCostArtifacts(agg),
    ...opsNoteArtifacts(findings),
  ];
  const sources = findings.notes.map((n) => n.citation);

  const SEV_EMOJI: Record<Severity, string> = { ok: '🟢', info: '🟢', warning: '🟡', critical: '🔴' };
  const deployPart = allOk ? 'all deploys green' : 'deploy attention needed';
  const agentPart =
    agentWorst === 'critical' ? `${crit.length} agent(s) need urgent attention`
    : agentWorst === 'warning' ? 'agent warnings present'
    : 'all agents healthy';
  const budgetPart = budget && budget.severity !== 'ok' ? ` · ${budget.detail}` : '';
  const baseSummary = `${SEV_EMOJI[combinedWorst]} ${agentPart} · ${deployPart}${budgetPart}`;

  const budgetCritical = budget?.severity === 'critical';
  const alertSystems = [...crit.map((h) => h.dept.toUpperCase()), ...(budgetCritical ? ['BUDGET'] : [])];
  const alertSymptoms = [
    ...crit.map((h) => `${h.dept.toUpperCase()} ${h.issues.filter((i) => i.severity === 'critical').map((i) => i.detail).join('; ')}`),
    ...(budgetCritical && budget ? [`BUDGET ${budget.detail}`] : []),
  ];
  const alert =
    alertSystems.length > 0
      ? {
          severity: 'critical' as const,
          text:
            `🔴 OPS ALERT\nระบบ: ${alertSystems.join(', ')}\n` +
            `อาการ: ${alertSymptoms.join(' | ')}\n` +
            `Action: ตรวจ cron/logs ของเอเจนต์ที่กระทบ หรือปรับ cadence/งบประมาณ แล้วรันใหม่`,
        }
      : undefined;

  return {
    markdown,
    summary: findings.fixToday ? `${baseSummary} · fix: ${findings.fixToday}` : baseSummary,
    feedMsg: crit.length > 0 ? 'ops alert: agent issue 🔴' : allOk ? 'all systems green 🚀' : 'deploy issue flagged ⚠',
    artifacts,
    tags: opsTags(deploys, activity),
    provenance: findings.notes.length > 0 ? 'web' : 'api',
    sources,
    alert,
    incomplete: stopReason === 'max_tokens',
    usage, model,
    meta: { deploys, activity, fixToday: findings.fixToday, notes: findings.notes.length, health: healths, stopReason, cost: { mtdUsd: agg.mtdUsd, budgetUsd: agg.budgetUsd } },
  };
}
