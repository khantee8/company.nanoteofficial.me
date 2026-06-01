import type { Agent } from './Agent';
import type { DeptId } from '../data/departments';
import type { AgentState } from './types';
import type { AmbientController } from './ambient';
import { WORKSTATIONS } from '../data/waypoints';

interface DeptAnim {
  phase: 'walk-to-work' | 'working' | 'celebrate' | 'walk-home' | 'error';
  timer: number;
}

export interface StateOverlayController {
  update: (
    agents: Record<DeptId, Agent>,
    states: Partial<Record<DeptId, AgentState>>,
    dt: number,
  ) => void;
}

const CELEBRATE_DURATION = 3.5;
const ERROR_DURATION = 3.0;

const DONE_BUBBLES = ['Done! ✅', 'Finished! ✓', 'Complete! 📋', 'Shipped! 🚀', 'All done! ✨'];
const ERROR_BUBBLES = ['Error! ⚠️', 'Failed ❌', 'Something broke...', 'Need help! 🔧'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function createStateOverlay(ambient: AmbientController): StateOverlayController {
  const active = new Map<DeptId, DeptAnim>();
  const prevStates = new Map<DeptId, AgentState>();

  return {
    update(agents, states, dt) {
      for (const [dept, state] of Object.entries(states) as [DeptId, AgentState][]) {
        const prev = prevStates.get(dept) ?? 'idle';
        prevStates.set(dept, state);

        if (state === 'running' && prev !== 'running' && !active.has(dept)) {
          ambient.lockAgent(dept);
          const ws = WORKSTATIONS[dept];
          agents[dept].moveTo(ws.x, ws.y, 'working');
          agents[dept].say('Starting... 💼', 2500);
          active.set(dept, { phase: 'walk-to-work', timer: 0 });
        }

        if (state === 'done' && prev === 'running') {
          const anim = active.get(dept);
          if (anim) {
            anim.phase = 'celebrate';
            anim.timer = CELEBRATE_DURATION;
            agents[dept].say(pick(DONE_BUBBLES), CELEBRATE_DURATION * 1000);
          }
        }

        if (state === 'error' && prev === 'running') {
          const anim = active.get(dept);
          if (anim) {
            anim.phase = 'error';
            anim.timer = ERROR_DURATION;
            agents[dept].say(pick(ERROR_BUBBLES), ERROR_DURATION * 1000);
          }
        }
      }

      for (const [dept, anim] of active) {
        if (anim.phase === 'walk-to-work') {
          const a = agents[dept];
          if (a.state !== 'walking') {
            anim.phase = 'working';
          }
        }

        if (anim.phase === 'celebrate' || anim.phase === 'error') {
          anim.timer -= dt;
          if (anim.timer <= 0) {
            agents[dept].goHome();
            anim.phase = 'walk-home';
          }
        }

        if (anim.phase === 'walk-home') {
          const a = agents[dept];
          if (a.state !== 'walking') {
            active.delete(dept);
            ambient.unlockAgent(dept);
          }
        }
      }
    },
  };
}
