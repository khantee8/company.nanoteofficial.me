// src/app/dashboard/[dept]/page.tsx — public per-agent deep-dive.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NavBar } from '@/components/NavBar';
import { AgentDetail } from '@/components/AgentDetail';
import { getRepo } from '@/lib/redis';
import { getDashboardData, emptyDashboard, type DashboardData } from '@/lib/dashboard';
import { isDeptId } from '@/lib/agents';
import { DEPARTMENTS } from '@/lib/data/departments';

export const dynamic = 'force-dynamic';

async function loadData(): Promise<DashboardData> {
  try {
    return await getDashboardData(getRepo());
  } catch {
    return emptyDashboard();
  }
}

export async function generateMetadata({ params }: { params: Promise<{ dept: string }> }): Promise<Metadata> {
  const { dept } = await params;
  const meta = isDeptId(dept) ? DEPARTMENTS.find((d) => d.id === dept) : undefined;
  const name = meta?.name ?? 'Agent';
  return {
    title: `${name} — NaNote Corp`,
    description: `Live data-driven intelligence from the ${name} agent at NaNote Corp.`,
  };
}

export default async function AgentPage({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  if (!isDeptId(dept)) notFound();

  const data = await loadData();
  const agent = data.agents.find((a) => a.dept === dept) ?? null;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <NavBar />
      <main style={{ flex: 1, overflowY: 'auto' }}>
        <AgentDetail dept={dept} agent={agent} />
      </main>
    </div>
  );
}
