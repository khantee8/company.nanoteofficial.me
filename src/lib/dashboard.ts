// src/lib/dashboard.ts
import type { RedisRepo } from './redis';
import { DEPARTMENTS, type DeptId } from './data/departments';
import type { AgentStatus, AgentOutput, HistoryEntry, DigestEntry } from './agents/types';

export interface DashboardAgent {
  dept: DeptId;
  status: AgentStatus;
  output: AgentOutput | null;
  history: HistoryEntry[];
}

export interface DashboardData {
  agents: DashboardAgent[];
  digest: DigestEntry[];
  generatedAt: string;
}

/** Assemble the full read-only dashboard payload from Redis (one call site). */
export async function getDashboardData(repo: RedisRepo): Promise<DashboardData> {
  const agents = await Promise.all(
    DEPARTMENTS.map(async (d): Promise<DashboardAgent> => ({
      dept: d.id,
      status: await repo.getStatus(d.id),
      output: await repo.getOutput(d.id),
      history: await repo.getHistory(d.id),
    })),
  );
  const digest = await repo.getDigest();
  return { agents, digest, generatedAt: new Date().toISOString() };
}

export const emptyDashboard = (): DashboardData => ({
  agents: [],
  digest: [],
  generatedAt: new Date().toISOString(),
});
