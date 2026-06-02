// src/lib/agents/roles.ts
//
// Agent role specs are loaded DIRECTLY from the source briefs in `.agents/*.md`
// at runtime — the brief file IS what the agent runs. There is no hand-copied
// duplicate to drift out of sync: edit the .md, redeploy, and the live agent
// changes with it.
//
// Each brief is read once at module init (server cold start) and exposed as
// ROLES[dept]. The wrapping (autonomous-operation preamble + the English
// `## Highlight` / `## Flags` output contract) is applied in personas.ts.
//
// NOTE: the briefs ship to Vercel via `outputFileTracingIncludes` in
// next.config.ts — without that, the serverless function bundle would not
// contain `.agents/` and loadBrief() would throw at runtime.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DeptId } from '@/lib/data/departments';

// Each department maps to its source brief filename under `.agents/`.
export const BRIEF_FILES: Record<DeptId, string> = {
  ceo: 'CEO Agent.md',
  fin: 'Finance Agent.md',
  cyb: 'CyberX Agent.md',
  mkt: 'Marketing & Social Media Agent.md',
  rnd: 'AI R&D Agent.md',
  ops: 'Operation Agent.md',
};

const BRIEFS_DIR = join(process.cwd(), '.agents');

function loadBrief(dept: DeptId): string {
  const file = join(BRIEFS_DIR, BRIEF_FILES[dept]);
  let text: string;
  try {
    text = readFileSync(file, 'utf8').trim();
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Agent brief for "${dept}" not found at ${file}. The .agents/*.md briefs are ` +
        `loaded at runtime and must ship with the build (see outputFileTracingIncludes ` +
        `in next.config.ts). Cause: ${cause}`,
    );
  }
  // Guard against a silently truncated/empty brief reaching the model.
  if (text.length < 200) {
    throw new Error(
      `Agent brief for "${dept}" at ${file} looks empty or truncated (${text.length} chars).`,
    );
  }
  return text;
}

// Read every brief once at module load (server-only; runs at cold start).
export const ROLES: Record<DeptId, string> = {
  ceo: loadBrief('ceo'),
  fin: loadBrief('fin'),
  cyb: loadBrief('cyb'),
  mkt: loadBrief('mkt'),
  rnd: loadBrief('rnd'),
  ops: loadBrief('ops'),
};
