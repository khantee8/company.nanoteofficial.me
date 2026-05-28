const PROJECTS = ['nanoteofficial.me', 'finance.nanoteofficial.me', 'company.nanoteofficial.me'];

export interface DeployState { project: string; state: string; ok: boolean; createdAt: number | null; }

export async function fetchDeployments(): Promise<DeployState[]> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN missing');
  const out: DeployState[] = [];
  for (const project of PROJECTS) {
    try {
      const res = await fetch(
        `https://api.vercel.com/v6/deployments?app=${encodeURIComponent(project)}&limit=1`,
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
