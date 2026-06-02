import type { DeptId } from './departments';

export const WAYPOINTS = {
  MEETING:     { x: 12,   y: 7   },
  COFFEE:      { x: 19.2, y: 7   },
  WHITEBOARD:  { x: 14,   y: 0.9 },
  SERVER_RACK: { x: 18.0, y: 0.9 },
};

export const WORKSTATIONS: Record<DeptId, { x: number; y: number }> = {
  ceo: { x: 1.6,  y: 4.5 },
  cyb: { x: 5.2,  y: 4.5 },
  mkt: { x: 9.2,  y: 4.5 },
  rnd: { x: 14.0, y: 0.9 },
  ops: { x: 18.0, y: 0.9 },
  fin: { x: 22.4, y: 4.2 },
};
