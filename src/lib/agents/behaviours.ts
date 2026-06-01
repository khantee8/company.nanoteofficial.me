import type { Agent } from './Agent';
import type { DeptId } from '../data/departments';
import type { AgentState as ServerAgentState } from './types';
import { createAmbientController } from './ambient';
import { createStateOverlay } from './stateOverlay';

export interface AgentMap {
  ceo: Agent; mkt: Agent; rnd: Agent; ops: Agent; fin: Agent;
}

export const AGENT_IDS: readonly DeptId[] = ['ceo', 'mkt', 'rnd', 'ops', 'fin'] as const;

export interface BehaviourController {
  stop: () => void;
  updateServerStates: (states: Partial<Record<DeptId, ServerAgentState>>) => void;
}

export function startBehaviourLoop(a: AgentMap): BehaviourController {
  const ambient = createAmbientController();
  const overlay = createStateOverlay(ambient);
  let serverStates: Partial<Record<DeptId, ServerAgentState>> = {};
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastTick = Date.now();

  const tick = () => {
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;

    overlay.update(a, serverStates, dt);
    ambient.tick(a);

    timeoutId = setTimeout(tick, 1200 + Math.random() * 800);
  };

  timeoutId = setTimeout(tick, 1500);

  return {
    stop() {
      if (timeoutId) clearTimeout(timeoutId);
      ambient.stop();
    },
    updateServerStates(states) {
      serverStates = states;
    },
  };
}
