import type { DeptId } from './departments';

export const WAYPOINTS = {
  MEETING:     { x: 10,   y: 7   },
  COFFEE:      { x: 17.2, y: 7   },
  WHITEBOARD:  { x: 10,   y: 0.9 },
  SERVER_RACK: { x: 14.0, y: 0.9 },
};

export const WORKSTATIONS: Record<DeptId, { x: number; y: number }> = {
  ceo: { x: 1.6,  y: 4.5 },
  mkt: { x: 5.2,  y: 4.5 },
  rnd: { x: 10,   y: 0.9 },
  ops: { x: 14.0, y: 0.9 },
  fin: { x: 18.4, y: 4.2 },
};
