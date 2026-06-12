import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import type { AgentRunResult, AgentContext } from './types';
import { CATEGORY_BY_DEPT } from './artifacts';
import { normalizeReportOrder, splitBilingual } from './bilingual';
import type { RedisRepo } from '@/lib/redis';
import { deriveSlug } from '@/lib/redis';

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

export function parseHighlight(markdown: string): string {
  const match = markdown.match(/## Highlight\s*\n([\s\S]*?)(?=\n## |\n---|\s*$)/i);
  if (!match) return '';
  return match[1].trim().slice(0, 300);
}

export function parseFlags(markdown: string): string[] {
  const match = markdown.match(/## Flags\s*\n([\s\S]*?)(?=\n## |\n---|\s*$)/i);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5);
}

export async function buildContext(dept: DeptId, repo: RedisRepo): Promise<AgentContext> {
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
  }

  return {
    ownHistory,
    companyDigest,
    todayPeers: todayPeers.filter((p): p is NonNullable<typeof p> => p !== null),
    companySnapshot,
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

export async function runAgent(agent: Agent, deps: RunnerDeps): Promise<AgentRunResult> {
  const { dept } = agent;
  const { repo, notify } = deps;
  const now = () => new Date().toISOString();

  await repo.setStatus({ dept, state: 'running', lastRun: now() });
  try {
    const ctx = await buildContext(dept, repo);
    const result = await agent.run(ctx);
    const ts = now();
    // Dual-generated narrative → two clean per-language documents (both carry the
    // shared findings + Highlight/Flags tail, so parsing works on either).
    // v1.5: agents emit the findings/Highlight/Flags head FIRST (truncation-
    // safe); normalize back to the narrative-first storage layout before split.
    const { th: markdown, en: markdownEn } = splitBilingual(normalizeReportOrder(result.markdown));
    const highlight = parseHighlight(markdown);
    const flags = parseFlags(markdown);
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

    await Promise.all([
      repo.setOutput({ dept, markdown, markdownEn, summary: result.summary, ts, category, tags, artifacts, meta: result.meta, incomplete }),
      repo.pushEvent({ dept, msg: result.feedMsg, ts }),
      repo.setStatus({ dept, state: 'done', lastRun: ts, summary: result.summary }),
      repo.pushHistory({ dept, date, summary: result.summary, highlight, markdown }),
      repo.pushDigest({ dept, date, summary: result.summary, highlight, flags }),
      // Archive into the knowledge base as a DRAFT — the Admin KB Manager
      // reviews and publishes before it surfaces on the public /api/kb feed.
      repo.pushKb({ id, slug, dept, date, ts, category, theme,
        tags, status: 'draft', summary: result.summary, highlight, flags, artifacts,
        sources, provenance, related, markdown, markdownEn, incomplete }),
    ]);

    const warn = incomplete ? '\n⚠️ รายงานอาจไม่สมบูรณ์ — ตรวจก่อนเผยแพร่' : '';
    await notify(`*${dept.toUpperCase()}* ✓ ${result.summary}${warn}\n\n${markdown.slice(0, 800)}`);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await repo.setStatus({ dept, state: 'error', lastRun: now(), error: message });
    await notify(`*${dept.toUpperCase()}* ⚠ failed: ${message}`);
    throw err;
  }
}
