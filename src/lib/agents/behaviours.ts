// src/lib/agents/behaviours.ts
import type { Agent } from './Agent';
import type { DeptId } from '../data/departments';
import { WAYPOINTS } from '../data/waypoints';

export interface AgentMap {
  ceo: Agent; mkt: Agent; rnd: Agent; ops: Agent; fin: Agent;
}

/** Returns an array of behaviour script steps. Each step manipulates agents directly. */
export function buildScripts(a: AgentMap): Array<() => void> {
  const { ceo, mkt, rnd, ops, fin } = a;
  const { MEETING, COFFEE, WHITEBOARD, SERVER_RACK } = WAYPOINTS;

  return [
    () => { ceo.moveTo(MEETING.x - 1, MEETING.y); ceo.say('Team standup! 📋'); },
    () => { mkt.moveTo(MEETING.x,     MEETING.y); mkt.say('Campaign ready! 📢'); },
    () => { rnd.moveTo(MEETING.x + 1, MEETING.y); rnd.say('New data! 🔬'); },
    () => { ceo.say('Great work ✓'); },
    () => { ops.say('Deploy done! 🚀'); },
    () => { ceo.goHome(); mkt.goHome(); rnd.goHome(); },
    () => { rnd.moveTo(WHITEBOARD.x, WHITEBOARD.y, 'idle'); rnd.say('Hypothesis!'); },
    () => { rnd.goHome(); },
    () => { fin.moveTo(COFFEE.x, COFFEE.y, 'idle'); fin.say('+12.3% ROI ☕'); },
    () => { fin.goHome(); },
    () => { ops.moveTo(SERVER_RACK.x, SERVER_RACK.y, 'working'); ops.say('Checking rack ⚙️'); },
    () => { ops.goHome(); },
    () => { mkt.moveTo(COFFEE.x - 1, COFFEE.y, 'idle'); mkt.say('Coffee break ✨'); },
    () => { mkt.goHome(); },
    () => { ceo.moveTo(fin.homeX - 1, fin.homeY + 1); ceo.say('Budget review?'); },
    () => { fin.say('ROI up 14%! 📈'); },
    () => { ceo.goHome(); },
    () => { rnd.moveTo(MEETING.x - 1, MEETING.y + 1); rnd.say('Proposal ready 📄'); ceo.moveTo(MEETING.x, MEETING.y + 1); },
    () => { ceo.say('Approved! ✓'); rnd.say('Starting now!'); },
    () => { ceo.goHome(); rnd.goHome(); },
    () => { mkt.moveTo(MEETING.x + 1, MEETING.y - 1); mkt.say('Q2 campaign plan!'); ops.moveTo(MEETING.x + 2, MEETING.y); },
    () => { ops.say('Infra is ready'); },
    () => { mkt.goHome(); ops.goHome(); },
  ];
}

/** Starts a recurring scheduler that runs script steps every 3.5–6s. Returns stop fn. */
export function startBehaviourLoop(a: AgentMap): () => void {
  const scripts = buildScripts(a);
  let i = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const tick = () => {
    scripts[i % scripts.length]();
    i++;
    timeoutId = setTimeout(tick, 3500 + Math.random() * 2500);
  };
  timeoutId = setTimeout(tick, 1500);
  return () => { if (timeoutId) clearTimeout(timeoutId); };
}

/** DeptId list used by AgentMap. */
export const AGENT_IDS: readonly DeptId[] = ['ceo', 'mkt', 'rnd', 'ops', 'fin'] as const;
