import type { DeptId } from '@/lib/data/departments';
import { ROLES } from './roles';

// Kept in English so the runner's parseHighlight/parseFlags and the dashboard
// can extract these sections regardless of the report's body language (Thai).
// Worded as a hard contract because the detailed role formats above otherwise
// tempt the model to treat its own format as the end and skip these sections.
const OUTPUT_FOOTER = `

---
MANDATORY OUTPUT CONTRACT — this overrides any format described above. No matter
what structure your report uses, the VERY LAST thing you write must be exactly
these two sections, in this order. Keep the two headers in English, verbatim
("## Highlight" then "## Flags"): do not rename, translate, number, merge, or
omit them, and never end your report without both.

## Highlight
หนึ่งถึงสองประโยค: ใจความสำคัญที่สุดของงานวันนี้ (เนื้อหาเป็นภาษาไทยได้)

## Flags
รายการ bullet สั้นๆ 0-3 ข้อ ของสิ่งที่แผนกอื่นต้องดำเนินการต่อ ถ้าไม่มีให้เขียนว่า "None."`;

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
