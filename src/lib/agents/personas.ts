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

// Thai instruction that asks the agent to emit a fenced ```json findings block
// with the real source data behind its report, BEFORE the Highlight/Flags footer.
// This gives deterministic chart builders a structured signal to consume without
// relying on the LLM narrative. Citation rules keep hallucinated numbers out.
const FINDINGS_CONTRACT = `

ก่อนถึงสองหัวข้อปิดท้าย ให้แนบ "ข้อมูลที่ใช้สร้างกราฟ" เป็นบล็อกโค้ด JSON หนึ่งบล็อก ใช้รั้วโค้ดหัวว่า \`\`\`json findings (ตามด้วยคำว่า findings ตัวพิมพ์เล็ก):
- ใส่เฉพาะตัวเลข/รายการที่ "ค้นเจอจริง" ในรอบนี้เท่านั้น
- ทุกตัวเลขที่มาจากการค้นเว็บ ต้องมีฟิลด์ citation: { "url": "...", "title": "...", "date": "YYYY-MM-DD" } กำกับ ถ้าไม่มีแหล่งอ้างอิงห้ามใส่
- ถ้ารอบนี้ไม่มีข้อมูลที่ชาร์ตได้จริง ให้ใส่บล็อกว่าง:
\`\`\`json findings
{}
\`\`\`
- โครงสร้างภายในบล็อกให้เป็นไปตามที่บทบาทของคุณกำหนด`;

// v1.4.1 — dual-language output. The agent writes its narrative twice (Thai then
// English) separated by the `<!-- ===EN=== -->` delimiter; the shared findings
// block + Highlight/Flags footer appear ONCE after both. `splitBilingual`
// (bilingual.ts) reconstructs the two per-language documents the KB stores.
const BILINGUAL_RULE = `

รายงานสองภาษา (สำคัญมาก): เขียน "เนื้อหารายงาน" สองรอบติดกัน
1) รอบแรกเป็นภาษาไทยตามรูปแบบในบทบาทของคุณ
2) คั่นด้วยบรรทัดที่มีเพียงข้อความนี้เป๊ะๆ บรรทัดเดียว: <!-- ===EN=== -->
3) แล้วเขียนเนื้อหาเดียวกันซ้ำเป็นภาษาอังกฤษ (สาระเท่ากัน เป็นภาษาอังกฤษธรรมชาติ ไม่ใช่แปลคำต่อคำ)
ลำดับผลลัพธ์ทั้งหมดต้องเป็น: [เนื้อหาไทย] → <!-- ===EN=== --> → [เนื้อหาอังกฤษ] → บล็อก \`\`\`json findings → ## Highlight → ## Flags
บล็อก findings และสองหัวข้อปิดท้ายให้มี "ชุดเดียว" วางไว้หลังเนื้อหาภาษาอังกฤษเท่านั้น ห้ามทำซ้ำในแต่ละภาษา`;

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
// ROLES, loaded at runtime) + the json findings contract + the mandatory English
// output contract. Order: narrative → findings block → Highlight → Flags.
const persona = (role: string): string => `${AUTONOMOUS_PREAMBLE}${role}${FINDINGS_CONTRACT}${BILINGUAL_RULE}${OUTPUT_FOOTER}`;

// v1.4.5 — Finance writes ONE full Thai analyst report, then a SHORT English
// executive summary (not a full dual report) — halves output size and matches
// the single-language analyst format. The shared findings + Highlight/Flags tail
// still appears once. Same `<!-- ===EN=== -->` delimiter, so splitBilingual works.
const FINANCE_BILINGUAL_RULE = `

รายงานสองภาษาแบบ Thai-primary (สำคัญมาก):
1) เขียน "รายงานฉบับเต็ม" เป็นภาษาไทยตามโครงสร้างในบทบาท
2) คั่นด้วยบรรทัดที่มีเพียงข้อความนี้เป๊ะๆ บรรทัดเดียว: <!-- ===EN=== -->
3) แล้วเขียน "บทสรุปผู้บริหารฉบับย่อ" เป็นภาษาอังกฤษ ความยาว 150-250 คำเท่านั้น (verdict + ตัวเลขสำคัญ + ข้อควรระวัง) — ไม่ใช่การแปลทั้งฉบับ
ลำดับผลลัพธ์: [รายงานไทยฉบับเต็ม] → <!-- ===EN=== --> → [EN summary สั้น] → บล็อก \`\`\`json findings → ## Highlight → ## Flags
findings และสองหัวข้อปิดท้ายให้มี "ชุดเดียว" หลัง EN summary เท่านั้น`;

const financePersona = (role: string): string =>
  `${AUTONOMOUS_PREAMBLE}${role}${FINDINGS_CONTRACT}${FINANCE_BILINGUAL_RULE}${OUTPUT_FOOTER}`;

export const PERSONAS: Record<DeptId, string> = {
  ceo: persona(ROLES.ceo),
  cyb: persona(ROLES.cyb),
  mkt: persona(ROLES.mkt),
  rnd: persona(ROLES.rnd),
  ops: persona(ROLES.ops),
  fin: financePersona(ROLES.fin),
};

export const PROJECTS_BLURB =
  'NaNote Corp ships: nanoteofficial.me (portfolio), finance.nanoteofficial.me (AI finance advisor), and company.nanoteofficial.me (this live AI office simulator). Founder: NaNote (Saksit Jantila), focus on technology strategy + cybersecurity.';
