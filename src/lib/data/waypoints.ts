import type { DeptId } from './departments';

// Ground-floor common areas (1st floor). Raised (2nd-floor) agents never walk
// here — their routines stay on the mezzanine so they don't appear to float.
export const WAYPOINTS = {
  MEETING:     { x: 20.0, y: 9.8 },  // meeting table (ground, right-front)
  COFFEE:      { x: 4.0,  y: 9.9 },  // coffee bar (ground, left-front)
  SNACK:       { x: 8.4,  y: 9.9 },  // snack station (ground, center-front)
  WHITEBOARD:  { x: 15.0, y: 8.4 },  // R&D whiteboard (ground)
  SERVER_RACK: { x: 21.6, y: 5.4 },  // ops server rack (ground, back of zone)
};

export const WORKSTATIONS: Record<DeptId, { x: number; y: number }> = {
  // 2nd floor (mezzanine) — must stay within the platform bounds
  ceo: { x: 5.5,  y: 2.8 },
  fin: { x: 18.0, y: 2.8 },
  // 1st floor (ground)
  cyb: { x: 3.0,  y: 7.2 },
  mkt: { x: 9.0,  y: 7.2 },
  rnd: { x: 15.0, y: 7.2 },
  ops: { x: 21.0, y: 7.2 },
};
