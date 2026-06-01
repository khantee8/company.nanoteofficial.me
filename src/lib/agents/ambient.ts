import type { Agent } from './Agent';
import type { DeptId } from '../data/departments';
import { WAYPOINTS } from '../data/waypoints';

export interface AmbientRoutine {
  agents: DeptId[];
  steps: Array<(a: Record<DeptId, Agent>) => void>;
}

const { MEETING, COFFEE, WHITEBOARD, SERVER_RACK } = WAYPOINTS;

const BUBBLES = {
  coffee: ['Coffee time ☕', 'Need caffeine...', 'Quick break ☕', 'Refueling ☕'],
  thinking: ['Hmm... 🤔', 'Interesting...', 'Let me think...', 'What if... 💡'],
  chat: ['Hey!', 'Quick question', 'What do you think?', 'Got a sec?'],
  reply: ['Good point!', 'Makes sense ✓', 'Let me check', 'On it!'],
  idle: ['*stretches*', '*checks phone*', '*looks around*', '*taps desk*'],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function coffeeBreak(dept: DeptId): AmbientRoutine {
  return {
    agents: [dept],
    steps: [
      (a) => { a[dept].moveTo(COFFEE.x, COFFEE.y, 'idle'); },
      (a) => { a[dept].say(pick(BUBBLES.coffee)); },
      (a) => { a[dept].goHome(); },
    ],
  };
}

function whiteboardVisit(dept: DeptId): AmbientRoutine {
  return {
    agents: [dept],
    steps: [
      (a) => { a[dept].moveTo(WHITEBOARD.x, WHITEBOARD.y, 'idle'); },
      (a) => { a[dept].say(pick(BUBBLES.thinking)); },
      (a) => { a[dept].goHome(); },
    ],
  };
}

function peerChat(d1: DeptId, d2: DeptId): AmbientRoutine {
  return {
    agents: [d1, d2],
    steps: [
      (a) => { a[d1].moveTo(MEETING.x - 1, MEETING.y); a[d2].moveTo(MEETING.x + 1, MEETING.y); },
      (a) => { a[d1].say(pick(BUBBLES.chat)); },
      (a) => { a[d2].say(pick(BUBBLES.reply)); },
      (a) => { a[d1].goHome(); a[d2].goHome(); },
    ],
  };
}

function deskFidget(dept: DeptId): AmbientRoutine {
  return {
    agents: [dept],
    steps: [
      (a) => { a[dept].say(pick(BUBBLES.idle), 2500); },
    ],
  };
}

function serverCheck(): AmbientRoutine {
  return {
    agents: ['ops'],
    steps: [
      (a) => { a.ops.moveTo(SERVER_RACK.x, SERVER_RACK.y, 'working'); },
      (a) => { a.ops.say('Checking systems ⚙️'); },
      (a) => { a.ops.goHome(); },
    ],
  };
}

const DEPT_LIST: DeptId[] = ['ceo', 'mkt', 'rnd', 'ops', 'fin'];

const CHAT_PAIRS: [DeptId, DeptId][] = [
  ['ceo', 'fin'], ['ceo', 'rnd'], ['mkt', 'rnd'],
  ['mkt', 'ops'], ['ops', 'fin'], ['ceo', 'mkt'],
];

function buildRoutinePool(): (() => AmbientRoutine)[] {
  const pool: (() => AmbientRoutine)[] = [];
  for (const d of DEPT_LIST) {
    pool.push(() => coffeeBreak(d));
    pool.push(() => whiteboardVisit(d));
    pool.push(() => deskFidget(d));
  }
  for (const [a, b] of CHAT_PAIRS) {
    pool.push(() => peerChat(a, b));
  }
  pool.push(() => serverCheck());
  return pool;
}

export interface AmbientController {
  tick: (agents: Record<DeptId, Agent>) => void;
  lockAgent: (dept: DeptId) => void;
  unlockAgent: (dept: DeptId) => void;
  stop: () => void;
}

export function createAmbientController(): AmbientController {
  const pool = buildRoutinePool();
  const locked = new Set<DeptId>();
  let activeRoutine: AmbientRoutine | null = null;
  let stepIndex = 0;
  let cooldown = 0;

  return {
    tick(agents) {
      if (cooldown > 0) { cooldown--; return; }

      if (activeRoutine) {
        if (stepIndex < activeRoutine.steps.length) {
          activeRoutine.steps[stepIndex](agents);
          stepIndex++;
          cooldown = 3;
          return;
        }
        activeRoutine = null;
        stepIndex = 0;
        cooldown = Math.floor(3 + Math.random() * 5);
        return;
      }

      const candidates = pool.filter(() => true);
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }

      for (const factory of candidates) {
        const routine = factory();
        if (routine.agents.some((d) => locked.has(d))) continue;
        activeRoutine = routine;
        stepIndex = 0;
        return;
      }

      cooldown = 5;
    },

    lockAgent(dept) { locked.add(dept); },
    unlockAgent(dept) { locked.delete(dept); },

    stop() {
      activeRoutine = null;
      stepIndex = 0;
    },
  };
}
