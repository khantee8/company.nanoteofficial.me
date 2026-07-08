import { DEPARTMENTS, isFrontendDept, type DeptId } from '@/lib/data/departments';
import type { AgentRunResult, AgentContext, AgentOutputHealth, RunOverrides, KbEntry } from './types';
import { CATEGORY_BY_DEPT } from './artifacts';
import { EN_DELIMITER, normalizeReportOrder, splitBilingual } from './bilingual';
import type { RedisRepo } from '@/lib/redis';
import { deriveSlug } from '@/lib/redis';
import { qualityGate } from './kbGate';
import { pushLibrarySync } from '@/lib/librarySync';
import { aggregateUsage, startOfMonthUtc } from './usage';

export interface Agent {
  dept: DeptId;
  run: (ctx: AgentContext) => Promise<AgentRunResult>;
}

export interface RunnerDeps {
  repo: RedisRepo;
  notify: (text: string) => Promise<void>;
}

const DEPT_ORDER: DeptId[] = ['cyb', 'fin', 'rnd', 'mkt', 'ops', 'ceo'];

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

type Lang = 'th' | 'en';

// The captured Highlight/Flags body may be bilingual: Thai, then a line with
// EN_DELIMITER, then English (v1.5.1). Pick the requested half; fall back to the
// Thai half when there is no delimiter (legacy single-language entries).
function pickLangSegment(body: string, lang: Lang): string {
  const parts = body.split(EN_DELIMITER);
  return (lang === 'en' ? parts[1] ?? parts[0] : parts[0]).trim();
}

export function parseHighlight(markdown: string, lang: Lang = 'th'): string {
  const match = markdown.match(/## Highlight\s*\n([\s\S]*?)(?=\n## |\n---|\s*$)/i);
  if (!match) return '';
  return pickLangSegment(match[1], lang).slice(0, 300);
}

export function parseFlags(markdown: string, lang: Lang = 'th'): string[] {
  const match = markdown.match(/## Flags\s*\n([\s\S]*?)(?=\n## |\n---|\s*$)/i);
  if (!match) return [];
  return pickLangSegment(match[1], lang)
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5);
}

export async function buildContext(dept: DeptId, repo: RedisRepo, overrides?: RunOverrides): Promise<AgentContext> {
  const today = todayDate();
  const myIndex = DEPT_ORDER.indexOf(dept);

  const [ownHistory, digest] = await Promise.all([
    repo.getHistory(dept),
    repo.getDigest(),
  ]);

  const companyDigest = digest.filter((d) => d.dept !== dept);

  const earlierDepts = DEPT_ORDER.slice(0, myIndex);
  const todayPeers = await Promise.all(
    earlierDepts.map(async (d) => {
      const status = await repo.getStatus(d);
      if (!status.lastRun?.startsWith(today)) return null;
      const output = await repo.getOutput(d);
      if (!output) return null;
      return {
        dept: d,
        summary: output.summary,
        highlight: parseHighlight(output.markdown),
        flags: parseFlags(output.markdown),
      };
    }),
  );

  // The CEO's Executive Cockpit aggregates whole-company state; only it pays the
  // extra status reads.
  let companySnapshot: AgentContext['companySnapshot'];
  if (dept === 'ceo') {
    // v1.11 — deterministic KPI inputs for the CEOX scorecard. statuses/listKb/
    // usage are independent reads — fan them out in one Promise.all, and reuse
    // the single unfiltered listKb() for both the related-ids graph pass and
    // the published count (was two separate listKb calls).
    const now = Date.now();
    const [statuses, allKb, usage] = await Promise.all([
      Promise.all(DEPARTMENTS.map((d) => repo.getStatus(d.id))),
      repo.listKb(),
      repo.getUsageSince(startOfMonthUtc(now)),
    ]);
    const seen = new Set<DeptId>();
    const relatedEntryIds: string[] = [];
    for (const e of allKb) {
      if (e.dept === 'ceo' || seen.has(e.dept)) continue;
      seen.add(e.dept);
      relatedEntryIds.push(e.id);
    }
    const kbPublished = allKb.filter((e) => e.status === 'published').length;
    const weekAgo = now - 7 * 86_400_000;
    const recentRuns = statuses.filter((s) => s.lastRun && Date.parse(s.lastRun) >= weekAgo);
    const kpis = {
      runsOk7d: recentRuns.filter((s) => s.state === 'done').length,
      runsTotal7d: recentRuns.length,
      kbPublished,
      costMtdUsd: aggregateUsage(usage, { now, budgetUsd: null }).mtdUsd,
    };
    companySnapshot = { statuses, digest, relatedEntryIds, kpis };
  } else if (dept === 'ops') {
    const statuses = await Promise.all(DEPARTMENTS.map((d) => repo.getStatus(d.id)));
    const outputs = await Promise.all(
      DEPARTMENTS.map(async (d): Promise<AgentOutputHealth> => {
        const o = await repo.getOutput(d.id);
        return {
          dept: d.id,
          incomplete: o?.incomplete ?? false,
          stopReason: typeof o?.meta?.stopReason === 'string' ? o.meta.stopReason : undefined,
          artifactCount: o?.artifacts?.length ?? 0,
          hasSummary: !!o?.summary,
          ts: o?.ts ?? null,
        };
      }),
    );
    // v1.8 — ~40d of cost-ledger entries for the Operations budget monitor.
    // v1.11 — recent watchdog sweep outcomes for the self-heal narrative.
    const [usage, sweeps] = await Promise.all([
      repo.getUsageSince(Date.now() - 40 * 86_400_000),
      repo.getSweepLog(),
    ]);
    companySnapshot = { statuses, digest, outputs, usage, sweeps: sweeps.slice(0, 10) };
  }

  return {
    ownHistory,
    companyDigest,
    todayPeers: todayPeers.filter((p): p is NonNullable<typeof p> => p !== null),
    companySnapshot,
    overrides,
  };
}

export function formatContext(ctx: AgentContext): string {
  const parts: string[] = [];

  if (ctx.ownHistory.length > 0) {
    parts.push('## Your Recent Work');
    for (const h of ctx.ownHistory) {
      parts.push(`### ${h.date}\n${h.highlight || h.summary}`);
    }
  }

  if (ctx.companyDigest.length > 0) {
    parts.push('## Company Digest (Recent Days)');
    for (const d of ctx.companyDigest) {
      const flagStr = d.flags.length > 0 ? `\nFlags: ${d.flags.join('; ')}` : '';
      parts.push(`- **${d.dept.toUpperCase()}** (${d.date}): ${d.highlight || d.summary}${flagStr}`);
    }
  }

  if (ctx.todayPeers.length > 0) {
    parts.push("## Today's Company Activity");
    for (const p of ctx.todayPeers) {
      const flagStr = p.flags.length > 0 ? `\nFlags: ${p.flags.join('; ')}` : '';
      parts.push(`### ${p.dept.toUpperCase()}\n${p.highlight || p.summary}${flagStr}`);
    }
    parts.push("Reference your colleagues' work where relevant — don't repeat it, build on it.");
  }

  return parts.join('\n\n');
}

export async function persistRunResult(dept: DeptId, result: AgentRunResult, deps: RunnerDeps): Promise<void> {
  const { repo, notify } = deps;
  const now = () => new Date().toISOString();

  const ts = now();
  // Dual-generated narrative → two clean per-language documents (both carry the
  // shared findings + Highlight/Flags tail, so parsing works on either).
  // v1.5: agents emit the findings/Highlight/Flags head FIRST (truncation-
  // safe); normalize back to the narrative-first storage layout before split.
  const { th: markdown, en: markdownEn } = splitBilingual(normalizeReportOrder(result.markdown));
  const highlight = parseHighlight(markdown, 'th');
  const highlightEn = parseHighlight(markdown, 'en');
  const flags = parseFlags(markdown, 'th');
  const flagsEn = parseFlags(markdown, 'en');
  const date = todayDate();
  const category = CATEGORY_BY_DEPT[dept];
  const artifacts = result.artifacts ?? [];
  const tags = result.tags ?? [];
  const id = `${dept}:${ts}`;
  const theme = result.theme;
  const provenance = result.provenance ?? 'api';
  const sources = result.sources ?? [];
  const incomplete = result.incomplete ?? false;
  const slug = deriveSlug({ dept, date, theme, category });

  // v1.11 role seam — backend depts (CEOX/OperX) write no KB entry.
  // Frontend depts auto-publish through the quality gate; a failed gate is a
  // normal draft the Admin Knowledge panel promotes manually.
  const frontend = isFrontendDept(dept);
  const kbStatus: KbEntry['status'] = frontend && qualityGate(result) ? 'published' : 'draft';

  // F1 — restore the graph's dead builds_on edges: when a frontend dept's
  // report doesn't explicitly cross-link (result.related), deterministically
  // wire it to the same-day reports of departments that ran earlier in
  // DEPT_ORDER (the runner's own collaboration order) — this is exactly the
  // "today's peers" set buildContext already showed the LLM, so the graph
  // reflects what the agent actually saw.
  let related = result.related ?? [];
  if (frontend && related.length === 0) {
    const recent = await repo.listKb({ limit: 24 });
    const myIndex = DEPT_ORDER.indexOf(dept);
    related = recent
      .filter((e) => e.date === date && e.dept !== dept && DEPT_ORDER.indexOf(e.dept) < myIndex)
      .map((e) => e.id);
  }

  await Promise.all([
    repo.setOutput({ dept, markdown, markdownEn, summary: result.summary, ts, category, tags, artifacts, meta: result.meta, incomplete }),
    repo.pushEvent({ dept, msg: result.feedMsg, ts }),
    repo.setStatus({ dept, state: 'done', lastRun: ts, summary: result.summary }),
    repo.pushHistory({ dept, date, summary: result.summary, highlight, markdown }),
    repo.pushDigest({ dept, date, summary: result.summary, highlight, highlightEn, flags, flagsEn }),
    ...(frontend
      ? [repo.pushKb({ id, slug, dept, date, ts, category, theme,
          tags, status: kbStatus, summary: result.summary, highlight, highlightEn, flags, flagsEn, artifacts,
          sources, provenance, related, markdown, markdownEn, incomplete })]
      : []),
    // v1.8 — record token usage to the cost ledger (skip non-LLM runs lacking usage/model).
    ...(result.usage && result.model
      ? [repo.recordUsage({ dept, model: result.model, input: result.usage.input, output: result.usage.output, ts: Date.parse(ts) })]
      : []),
  ]);

  const warn = incomplete ? '\n⚠️ รายงานอาจไม่สมบูรณ์ — ตรวจก่อนเผยแพร่' : '';
  const kbNote = !frontend ? ''
    : kbStatus === 'published' ? `\n📚 published → KB (${slug})`
    : '\n📝 draft — review in /admin';
  // pushLibrarySync and the run notify are independent (and pushLibrarySync
  // never throws) — fire them concurrently instead of blocking notify on sync.
  await Promise.all([
    frontend && kbStatus === 'published' ? pushLibrarySync(slug, repo) : Promise.resolve(),
    notify(`*${dept.toUpperCase()}* ✓ ${result.summary}${warn}${kbNote}\n\n${markdown.slice(0, 800)}`),
  ]);
  if (result.alert) await notify(result.alert.text);
}

export async function runAgent(agent: Agent, deps: RunnerDeps, overrides?: RunOverrides): Promise<AgentRunResult> {
  const { dept } = agent;
  const { repo, notify } = deps;
  const now = () => new Date().toISOString();

  await repo.setStatus({ dept, state: 'running', lastRun: now() });
  try {
    const ctx = await buildContext(dept, repo, overrides);
    const result = await agent.run(ctx);
    await persistRunResult(dept, result, deps);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await repo.setStatus({ dept, state: 'error', lastRun: now(), error: message });
    await notify(`*${dept.toUpperCase()}* ⚠ failed: ${message}`);
    throw err;
  }
}
