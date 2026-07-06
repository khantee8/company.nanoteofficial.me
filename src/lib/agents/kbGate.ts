import type { AgentRunResult } from './types';

/** v1.11 auto-publish gate for FRONTEND depts. A run may go straight to
 *  `published` (+ Library sync) only when it is demonstrably clean:
 *  finished (not truncated / zero-cited), carries cited material, and has a
 *  summary. Citation integrity itself is enforced upstream by each
 *  parse<Dept>Findings() (hasCitation needs url+date) — this gate only checks
 *  that cited material EXISTS. Anything less lands as a draft for /admin. */
export function qualityGate(result: AgentRunResult): boolean {
  if (result.incomplete) return false;
  if (!result.summary?.trim()) return false;
  const cited =
    (result.sources?.length ?? 0) > 0 ||
    (result.artifacts ?? []).some((a) => a.provenance === 'web' && (a.sources?.length ?? 0) > 0);
  return cited;
}
