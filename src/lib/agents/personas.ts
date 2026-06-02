import type { DeptId } from '@/lib/data/departments';
import { ROLES } from './roles';

// Kept in English so the runner's parseHighlight/parseFlags and the dashboard
// can extract these sections regardless of the report's body language (Thai).
const OUTPUT_FOOTER = `

End your output with these two sections (keep these two headers in English):
## Highlight
หนึ่งถึงสองประโยค: ใจความสำคัญที่สุดของงานวันนี้ (เขียนเป็นภาษาไทยได้)
## Flags
รายการสั้นๆ (0-3 ข้อ) ของสิ่งที่แผนกอื่นต้องดำเนินการต่อ ถ้าไม่มีให้เขียน "None."`;

// Personas are sourced from the canonical role specs in roles.ts (Thai).
export const PERSONAS: Record<DeptId, string> = {
  ceo: `${ROLES.ceo}${OUTPUT_FOOTER}`,
  cyb: `${ROLES.cyb}${OUTPUT_FOOTER}`,
  mkt: `${ROLES.mkt}${OUTPUT_FOOTER}`,
  rnd: `${ROLES.rnd}${OUTPUT_FOOTER}`,
  ops: `${ROLES.ops}${OUTPUT_FOOTER}`,
  fin: `${ROLES.fin}${OUTPUT_FOOTER}`,
};

export const PROJECTS_BLURB =
  'NaNote Corp ships: nanoteofficial.me (portfolio), finance.nanoteofficial.me (AI finance advisor), and company.nanoteofficial.me (this live AI office simulator). Founder: NaNote (Saksit Jantila), focus on technology strategy + cybersecurity.';
