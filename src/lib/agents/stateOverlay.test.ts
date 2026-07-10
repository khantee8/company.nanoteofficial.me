import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStateOverlay } from './stateOverlay';
import { Agent } from './Agent';
import type { AmbientController } from './ambient';
import type { AgentState } from './types';
import type { DeptId } from '../data/departments';
import { WORKSTATIONS } from '../data/waypoints';

// v1.12 final-review (I3) — production now only ever sets `queued` on
// submit and `done`/`error` on collection ('running' is dead since the
// async batch substrate landed), so these tests exercise the choreography
// through the states the office canvas actually sees.

function fakeAmbient() {
  const lockAgent = vi.fn();
  const unlockAgent = vi.fn();
  const ambient: AmbientController = { tick: vi.fn(), lockAgent, unlockAgent, stop: vi.fn() };
  return { ambient, lockAgent, unlockAgent };
}

// Home coincides with the dept's workstation, so `moveTo` + a single
// `agent.update()` snaps the agent straight to its arrive state instead of
// needing many hand-simulated physics ticks — the overlay's own state
// machine (not real walking distance) is what's under test here.
function agentAtWorkstation(dept: DeptId): Agent {
  const ws = WORKSTATIONS[dept];
  return new Agent(dept, 'X', '#fff', ws.x, ws.y);
}

describe('createStateOverlay — queued choreography (v1.12 final-review)', () => {
  let ambient: AmbientController;
  let lockAgent: ReturnType<typeof vi.fn>;
  let unlockAgent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ ambient, lockAgent, unlockAgent } = fakeAmbient());
  });

  it('idle → queued triggers the same walk-to-work/working choreography as running', () => {
    const overlay = createStateOverlay(ambient);
    const agents = { fin: agentAtWorkstation('fin') } as unknown as Record<DeptId, Agent>;

    overlay.update(agents, { fin: 'queued' } as Partial<Record<DeptId, AgentState>>, 0.1);

    expect(lockAgent).toHaveBeenCalledWith('fin');
    expect(agents.fin.state).toBe('walking');
    expect(agents.fin.tx).toBeCloseTo(WORKSTATIONS.fin.x);
    expect(agents.fin.ty).toBeCloseTo(WORKSTATIONS.fin.y);
    expect(agents.fin.bubble).toContain('Starting');
  });

  it('does not re-trigger walk-to-work on a second queued tick (already active)', () => {
    const overlay = createStateOverlay(ambient);
    const agents = { fin: agentAtWorkstation('fin') } as unknown as Record<DeptId, Agent>;

    overlay.update(agents, { fin: 'queued' }, 0.1);
    expect(lockAgent).toHaveBeenCalledTimes(1);
    agents.fin.say('unchanged', 99999);
    overlay.update(agents, { fin: 'queued' }, 0.1);

    // second call must not re-lock or reset the bubble — the dept is
    // already "active" from the first queued tick.
    expect(lockAgent).toHaveBeenCalledTimes(1);
    expect(agents.fin.bubble).toBe('unchanged');
  });

  it('queued → done celebrates, then sends the agent home and unlocks it once the celebrate timer elapses', () => {
    const overlay = createStateOverlay(ambient);
    const agents = { fin: agentAtWorkstation('fin') } as unknown as Record<DeptId, Agent>;

    overlay.update(agents, { fin: 'queued' }, 0.1); // idle → queued: walk-to-work
    agents.fin.update(0.1); // arrives instantly (home === workstation) → state 'working'
    overlay.update(agents, { fin: 'queued' }, 0.1); // phase 'walk-to-work' → 'working'

    overlay.update(agents, { fin: 'done' }, 0.1); // queued(→running) → done: celebrate
    expect(agents.fin.bubble).toBeTruthy();
    expect(unlockAgent).not.toHaveBeenCalled();

    // drain the celebrate timer (3.5s) via empty-state ticks — the second
    // loop in `update` walks `active` regardless of the states argument.
    for (let i = 0; i < 40; i++) overlay.update(agents, {}, 0.1);
    // goHome() just fired; the agent is instantaneously "walking" home —
    // one physics tick resolves it since home === workstation here.
    agents.fin.update(0.1);
    overlay.update(agents, {}, 0.1);

    expect(agents.fin.tx).toBeCloseTo(agents.fin.homeX);
    expect(agents.fin.ty).toBeCloseTo(agents.fin.homeY);
    expect(unlockAgent).toHaveBeenCalledWith('fin');
  });

  it('queued → error shows the error bubble, then sends the agent home and unlocks it once the error timer elapses', () => {
    const overlay = createStateOverlay(ambient);
    const agents = { cyb: agentAtWorkstation('cyb') } as unknown as Record<DeptId, Agent>;

    overlay.update(agents, { cyb: 'queued' }, 0.1);
    agents.cyb.update(0.1);
    overlay.update(agents, { cyb: 'queued' }, 0.1);

    overlay.update(agents, { cyb: 'error' }, 0.1);
    expect(agents.cyb.bubble).toBeTruthy();
    expect(unlockAgent).not.toHaveBeenCalled();

    for (let i = 0; i < 35; i++) overlay.update(agents, {}, 0.1); // error timer is 3.0s
    agents.cyb.update(0.1);
    overlay.update(agents, {}, 0.1);

    expect(agents.cyb.tx).toBeCloseTo(agents.cyb.homeX);
    expect(agents.cyb.ty).toBeCloseTo(agents.cyb.homeY);
    expect(unlockAgent).toHaveBeenCalledWith('cyb');
  });

  it('idle → running (legacy state) still triggers the same choreography as queued', () => {
    const overlay = createStateOverlay(ambient);
    const agents = { mkt: agentAtWorkstation('mkt') } as unknown as Record<DeptId, Agent>;

    overlay.update(agents, { mkt: 'running' }, 0.1);

    expect(lockAgent).toHaveBeenCalledWith('mkt');
    expect(agents.mkt.state).toBe('walking');
  });
});
