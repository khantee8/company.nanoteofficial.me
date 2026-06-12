const PROJECTS = ['nanoteofficial.me', 'finance.nanoteofficial.me', 'company.nanoteofficial.me'];

export interface DeployState { project: string; state: string; ok: boolean; createdAt: number | null; }

// The projects live under a Vercel team; team-scoped resources return an empty
// list (→ every project read as UNKNOWN) unless the query carries teamId.
// Resolve it once from the token and cache for the lambda's lifetime.
let _teamId: string | null | undefined;
export function _resetTeamIdCache(): void { _teamId = undefined; }

export async function resolveTeamId(token: string): Promise<string | null> {
  if (_teamId !== undefined) return _teamId;
  try {
    const res = await fetch('https://api.vercel.com/v2/teams?limit=1', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = res.ok ? ((await res.json()) as { teams?: Array<{ id?: string }> }) : {};
    _teamId = data.teams?.[0]?.id ?? null;
  } catch {
    _teamId = null;
  }
  return _teamId;
}

export function deploymentsUrl(project: string, teamId: string | null): string {
  return `https://api.vercel.com/v6/deployments?app=${encodeURIComponent(project)}&limit=1${
    teamId ? `&teamId=${encodeURIComponent(teamId)}` : ''
  }`;
}

export async function fetchDeployments(): Promise<DeployState[]> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN missing');
  const teamId = await resolveTeamId(token);
  const out: DeployState[] = [];
  for (const project of PROJECTS) {
    try {
      const res = await fetch(
        deploymentsUrl(project, teamId),
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) { out.push({ project, state: `http ${res.status}`, ok: false, createdAt: null }); continue; }
      const data = (await res.json()) as { deployments?: Array<{ state?: string; readyState?: string; createdAt?: number }> };
      const d = data.deployments?.[0];
      const state = d?.readyState ?? d?.state ?? 'UNKNOWN';
      out.push({ project, state, ok: state === 'READY', createdAt: d?.createdAt ?? null });
    } catch {
      out.push({ project, state: 'error', ok: false, createdAt: null });
    }
  }
  return out;
}

export function formatDeployments(rows: DeployState[]): string[] {
  return rows.map((r) => `${r.ok ? '✅' : '⚠️'} ${r.project}: ${r.state}`);
}
