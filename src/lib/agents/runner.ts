import { DEPARTMENTS, isFrontendDept, type DeptId } from '@/lib/data/departments';
import type { AgentRunResult, AgentContext, AgentOutputHealth, RunOverrides, KbEntry } from './types';
import { CATEGORY_BY_DEPT } from './artifacts';
import { EN_DELIMITER, normalizeReportOrder, splitBilingual } from './bilingual';
import type { RedisRepo } from '@/lib/redis';
import { deriveSlug } from '@/lib/redis';
import { qualityGate } from './kbGate';
import { pushLibrarySync } from '@/lib/librarySync';

export interface Agent {
  dept: DeptId;
  run: (ctx: AgentContext) => Promise<AgentRunResult>;
}

export interface RunnerDeps {
  repo: RedisRepo;
  notify: (text: string) => Promise<void>;
}

const DEPT_ORDER: DeptId[] = ['cyb', 'fin', 'rnd', 'mkt', 'ops', 'ceo'];

function todayDate(): string {
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
    const statuses = await Promise.all(DEPARTMENTS.map((d) => repo.getStatus(d.id)));
    const recent = await repo.listKb({ limit: 24 });
    const seen = new Set<DeptId>();
    const relatedEntryIds: string[] = [];
    for (const e of recent) {
      if (e.dept === 'ceo' || seen.has(e.dept)) continue;
      seen.add(e.dept);
      relatedEntryIds.push(e.id);
    }
    companySnapshot = { statuses, digest, relatedEntryIds };
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
    const usage = await repo.getUsageSince(Date.now() - 40 * 86_400_000);
    companySnapshot = { statuses, digest, outputs, usage };
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

export async function runAgent(agent: Agent, deps: RunnerDeps, overrides?: RunOverrides): Promise<AgentRunResult> {
  const { dept } = agent;
  const { repo, notify } = deps;
  const now = () => new Date().toISOString();

  await repo.setStatus({ dept, state: 'running', lastRun: now() });
  try {
    const ctx = await buildContext(dept, repo, overrides);
    const result = await agent.run(ctx);
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
    const related = result.related ?? [];
    const incomplete = result.incomplete ?? false;
    const slug = deriveSlug({ dept, date, theme, category });

    // v1.11 role seam — backend depts (CEOX/OperX) are /admin-only: no KB.
    // Frontend depts auto-publish through the quality gate; a failed gate is a
    // normal draft the Admin Knowledge panel promotes manually.
    const frontend = isFrontendDept(dept);
    const kbStatus: KbEntry['status'] = frontend && qualityGate(result) ? 'published' : 'draft';

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

    if (frontend && kbStatus === 'published') await pushLibrarySync(slug, repo);

    const warn = incomplete ? '\n⚠️ รายงานอาจไม่สมบูรณ์ — ตรวจก่อนเผยแพร่' : '';
    const kbNote = !frontend ? ''
      : kbStatus === 'published' ? `\n📚 published → KB (${slug})`
      : '\n📝 draft — review in /admin';
    await notify(`*${dept.toUpperCase()}* ✓ ${result.summary}${warn}${kbNote}\n\n${markdown.slice(0, 800)}`);
    if (result.alert) await notify(result.alert.text);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await repo.setStatus({ dept, state: 'error', lastRun: now(), error: message });
    await notify(`*${dept.toUpperCase()}* ⚠ failed: ${message}`);
    throw err;
  }
}
