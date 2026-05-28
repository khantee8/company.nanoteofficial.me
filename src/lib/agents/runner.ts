import type { DeptId } from '@/lib/data/departments';
import type { AgentRunResult } from './types';
import type { RedisRepo } from '@/lib/redis';

export interface Agent {
  dept: DeptId;
  run: () => Promise<AgentRunResult>;
}

export interface RunnerDeps {
  repo: RedisRepo;
  notify: (text: string) => Promise<void>;
}

export async function runAgent(agent: Agent, deps: RunnerDeps): Promise<AgentRunResult> {
  const { dept } = agent;
  const { repo, notify } = deps;
  const now = () => new Date().toISOString();

  await repo.setStatus({ dept, state: 'running', lastRun: now() });
  try {
    const result = await agent.run();
    const ts = now();
    await repo.setOutput({ dept, markdown: result.markdown, summary: result.summary, ts, meta: result.meta });
    await repo.pushEvent({ dept, msg: result.feedMsg, ts });
    await repo.setStatus({ dept, state: 'done', lastRun: ts, summary: result.summary });
    await notify(`*${dept.toUpperCase()}* ✓ ${result.summary}\n\n${result.markdown.slice(0, 800)}`);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await repo.setStatus({ dept, state: 'error', lastRun: now(), error: message });
    await notify(`*${dept.toUpperCase()}* ⚠ failed: ${message}`);
    throw err;
  }
}
