// src/lib/data/departments.ts
export type DeptId = 'ceo' | 'mkt' | 'rnd' | 'ops' | 'fin';

export interface Department {
  id: DeptId;
  name: string;
  shortName: string;
  color: string;
  homeX: number;
  homeY: number;
  task: string;
}

export const DEPARTMENTS: Department[] = [
  { id: 'ceo', name: 'NaNote CEO',  shortName: 'NaNote', color: '#ffdd57', homeX: 1.6,  homeY: 2.5, task: '● directing team' },
  { id: 'mkt', name: 'Marketing',   shortName: 'MKT',    color: '#ff6b9d', homeX: 5.2,  homeY: 2.5, task: '● posting content' },
  { id: 'rnd', name: 'R&D Lab',     shortName: 'R&D',    color: '#00cfff', homeX: 9.5,  homeY: 2.5, task: '○ idle' },
  { id: 'ops', name: 'Operations',  shortName: 'OPS',    color: '#ff9a3c', homeX: 14.8, homeY: 2.8, task: '● deploying v1.3' },
  { id: 'fin', name: 'Finance',     shortName: 'FIN',    color: '#7f8cff', homeX: 18.4, homeY: 2.2, task: '● analyzing ROI' },
];

export const DEPT_ZONE_BOUNDS: Record<DeptId, { x0: number; y0: number; x1: number; y1: number; gx: number; gy: number }> = {
  ceo: { x0: 0.1,  y0: 0.1, x1: 3.8,  y1: 3.8, gx: 1.8,  gy: 1.8 },
  mkt: { x0: 4.1,  y0: 0.1, x1: 7.8,  y1: 3.8, gx: 5.5,  gy: 1.8 },
  rnd: { x0: 8.1,  y0: 0.1, x1: 12.8, y1: 3.8, gx: 10.2, gy: 1.8 },
  ops: { x0: 13.1, y0: 0.1, x1: 16.8, y1: 3.8, gx: 14.8, gy: 2.0 },
  fin: { x0: 17.1, y0: 0.1, x1: 19.8, y1: 3.8, gx: 18.2, gy: 1.8 },
};
