import type { DeptId } from '@/lib/data/departments';
import { ROLES } from './roles';

// The briefs in `.agents/*.md` were authored for an INTERACTIVE assistant — some
// literally say "ask the user 2-4 questions" (e.g. the Finance brief). In the
// simulator each agent instead runs UNATTENDED once a day on cron, with nobody
// to answer. This preamble adapts any interactive brief to autonomous operation
// at runtime, so we keep the briefs as the single source of truth without
// editing them. It is prepended before the brief; the OUTPUT_FOOTER is appended.
const AUTONOMOUS_PREAMBLE = `โหมดการทำงาน (สำคัญ อ่านก่อน): คุณทำงานแบบอัตโนมัติ (unattended) วันละครั้งตามรอบเวลา ไม่มีผู้ใช้คอยตอบโต้แบบเรียลไทม์
- ที่ใดก็ตามที่บทบาท/ขั้นตอนด้านล่างบอกให้ "ถามผู้ใช้" หรือรออินพุต ให้ตั้งสมมติฐานที่สมเหตุสมผลแทน ระบุสมมติฐานนั้นให้ชัด แล้วทำงานต่อจนจบด้วยตัวเอง ห้ามถามกลับแล้วหยุดรอ
- ใช้เฉพาะข้อมูลจริงที่ดึงมาได้ในรอบนี้ ถ้าข้อมูลส่วนใดหาไม่ได้ให้บอกตรงๆ ว่าขาด ห้ามแต่งตัวเลข ชื่อ หรือแหล่งอ้างอิง
- ข้ามขั้นตอนที่เป็นการกระทำบน UI หรือระบบที่คุณทำเองไม่ได้ (เช่น สร้างลิงก์ หรือ export ไฟล์) แล้วโฟกัสที่การผลิตเนื้อหารายงานจริง
- ส่งออกเป็น "รายงานประจำวันของวันนี้" เพียงฉบับเดียว

ต่อไปนี้คือบทบาทและคู่มือการทำงานของคุณ:

`;

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

// Each persona = autonomous preamble + the verbatim `.agents/*.md` brief (via
// ROLES, loaded at runtime) + the mandatory English output contract.
const persona = (role: string): string => `${AUTONOMOUS_PREAMBLE}${role}${OUTPUT_FOOTER}`;

export const PERSONAS: Record<DeptId, string> = {
  ceo: persona(ROLES.ceo),
  cyb: persona(ROLES.cyb),
  mkt: persona(ROLES.mkt),
  rnd: persona(ROLES.rnd),
  ops: persona(ROLES.ops),
  fin: persona(ROLES.fin),
};

export const PROJECTS_BLURB =
  'NaNote Corp ships: nanoteofficial.me (portfolio), finance.nanoteofficial.me (AI finance advisor), and company.nanoteofficial.me (this live AI office simulator). Founder: NaNote (Saksit Jantila), focus on technology strategy + cybersecurity.';
