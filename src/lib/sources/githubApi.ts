const REPOS = ['khantee8/nanoteofficial.me', 'khantee8/finance.nanoteofficial.me', 'khantee8/company.nanoteofficial.me'];

export interface RepoActivity { repo: string; lastCommit: string | null; lastCi: string | null; }

export async function fetchActivity(): Promise<RepoActivity[]> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const out: RepoActivity[] = [];
  for (const repo of REPOS) {
    try {
      const cRes = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=1`, { headers });
      const commits = cRes.ok ? ((await cRes.json()) as Array<{ commit?: { message?: string } }>) : [];
      const lastCommit = commits[0]?.commit?.message?.split('\n')[0] ?? null;

      const wRes = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=1`, { headers });
      const runs = wRes.ok ? ((await wRes.json()) as { workflow_runs?: Array<{ conclusion?: string | null }> }) : { workflow_runs: [] };
      const lastCi = runs.workflow_runs?.[0]?.conclusion ?? null;

      out.push({ repo, lastCommit, lastCi });
    } catch {
      out.push({ repo, lastCommit: null, lastCi: null });
    }
  }
  return out;
}

export function formatActivity(rows: RepoActivity[]): string[] {
  return rows.map((r) => `${r.repo.split('/')[1]}: "${r.lastCommit ?? '—'}" · CI ${r.lastCi ?? 'n/a'}`);
}
