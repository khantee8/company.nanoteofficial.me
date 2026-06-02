// src/lib/data/departments.ts
export type DeptId = 'ceo' | 'cyb' | 'mkt' | 'rnd' | 'ops' | 'fin';

/** Pixel height of the raised executive mezzanine (2nd floor). */
export const MEZZANINE_ELEVATION = 26;

/** Departments that live on the raised 2nd floor. */
export const RAISED_DEPTS: DeptId[] = ['ceo', 'fin'];

export const isRaised = (id: DeptId): boolean => RAISED_DEPTS.includes(id);

export interface Department {
  id: DeptId;
  name: string;
  shortName: string;
  color: string;
  homeX: number;
  homeY: number;
  /** Vertical offset in px — non-zero for 2nd-floor (mezzanine) departments. */
  elevation: number;
  task: string;
}

// Layout: CEO + Finance sit on a raised mezzanine across the back (2nd floor);
// CyberX, Marketing & Social, AI R&D and Operations work on the ground floor.
export const DEPARTMENTS: Department[] = [
  { id: 'ceo', name: 'NaNote CEO',             shortName: 'NaNote', color: '#ffdd57', homeX: 5.5,  homeY: 2.4, elevation: MEZZANINE_ELEVATION, task: '● directing team' },
  { id: 'fin', name: 'Finance',                shortName: 'FIN',    color: '#7f8cff', homeX: 18.0, homeY: 2.4, elevation: MEZZANINE_ELEVATION, task: '● analyzing markets' },
  { id: 'cyb', name: 'CyberX',                 shortName: 'CYB',    color: '#39ff9d', homeX: 3.0,  homeY: 6.6, elevation: 0, task: '● scanning threats' },
  { id: 'mkt', name: 'Marketing & Social Media', shortName: 'SOCIAL', color: '#ff6b9d', homeX: 9.0,  homeY: 6.6, elevation: 0, task: '● drafting content' },
  { id: 'rnd', name: 'AI R&D',                 shortName: 'R&D',    color: '#00cfff', homeX: 15.0, homeY: 6.6, elevation: 0, task: '● scanning research' },
  { id: 'ops', name: 'Operations',             shortName: 'OPS',    color: '#ff9a3c', homeX: 21.0, homeY: 6.6, elevation: 0, task: '● monitoring systems' },
];

export const DEPT_ZONE_BOUNDS: Record<DeptId, { x0: number; y0: number; x1: number; y1: number; gx: number; gy: number }> = {
  // 2nd floor (mezzanine)
  ceo: { x0: 0.3,  y0: 0.3, x1: 11.2, y1: 4.0, gx: 5.5,  gy: 2.4 },
  fin: { x0: 12.4, y0: 0.3, x1: 23.6, y1: 4.0, gx: 18.0, gy: 2.4 },
  // 1st floor (ground)
  cyb: { x0: 0.3,  y0: 5.0, x1: 6.0,  y1: 8.6, gx: 3.0,  gy: 6.6 },
  mkt: { x0: 6.3,  y0: 5.0, x1: 11.9, y1: 8.6, gx: 9.0,  gy: 6.6 },
  rnd: { x0: 12.1, y0: 5.0, x1: 17.9, y1: 8.6, gx: 15.0, gy: 6.6 },
  ops: { x0: 18.1, y0: 5.0, x1: 23.6, y1: 8.6, gx: 21.0, gy: 6.6 },
};
