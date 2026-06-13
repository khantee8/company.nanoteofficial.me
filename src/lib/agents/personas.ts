import type { DeptId } from '@/lib/data/departments';
import { ROLES } from './roles';

// The briefs in `.agents/*.md` were authored for an INTERACTIVE assistant — some
// literally say "ask the user 2-4 questions" (e.g. the Finance brief). In the
// simulator each agent instead runs UNATTENDED once a day on cron, with nobody
// to answer. This preamble adapts any interactive brief to autonomous operation
// at runtime, so we keep the briefs as the single source of truth without
// editing them. It is prepended before the brief; OUTPUT_HEAD_CONTRACT follows.
const AUTONOMOUS_PREAMBLE = `โหมดการทำงาน (สำคัญ อ่านก่อน): คุณทำงานแบบอัตโนมัติ (unattended) วันละครั้งตามรอบเวลา ไม่มีผู้ใช้คอยตอบโต้แบบเรียลไทม์
- ที่ใดก็ตามที่บทบาท/ขั้นตอนด้านล่างบอกให้ "ถามผู้ใช้" หรือรออินพุต ให้ตั้งสมมติฐานที่สมเหตุสมผลแทน ระบุสมมติฐานนั้นให้ชัด แล้วทำงานต่อจนจบด้วยตัวเอง ห้ามถามกลับแล้วหยุดรอ
- ใช้เฉพาะข้อมูลจริงที่ดึงมาได้ในรอบนี้ ถ้าข้อมูลส่วนใดหาไม่ได้ให้บอกตรงๆ ว่าขาด ห้ามแต่งตัวเลข ชื่อ หรือแหล่งอ้างอิง
- ข้ามขั้นตอนที่เป็นการกระทำบน UI หรือระบบที่คุณทำเองไม่ได้ (เช่น สร้างลิงก์ หรือ export ไฟล์) แล้วโฟกัสที่การผลิตเนื้อหารายงานจริง
- ส่งออกเป็น "รายงานประจำวันของวันนี้" เพียงฉบับเดียว

ต่อไปนี้คือบทบาทและคู่มือการทำงานของคุณ:

`;

// v1.5.0 — findings-first head contract. The machine-readable head (findings →
// Highlight → Flags → ---) is the FIRST thing every agent writes, so a run cut
// at max_tokens can never destroy the chart/KB data or the verdict. The runner
// normalizes the emitted order back to the legacy storage layout
// (bilingual.ts normalizeReportOrder), so downstream consumers are unchanged.
const OUTPUT_HEAD_CONTRACT = `

---
MANDATORY OUTPUT CONTRACT — this overrides any format described above. You MUST
OPEN your output with this exact head, in this order, BEFORE any narrative:

1) บล็อกข้อมูลสำหรับสร้างกราฟ: รั้วโค้ดขึ้นต้นว่า \`\`\`json findings (คำว่า findings ตัวพิมพ์เล็ก)
   - ใส่เฉพาะตัวเลข/รายการที่ "ค้นเจอจริง" ในรอบนี้เท่านั้น
   - ทุกตัวเลขที่มาจากการค้นเว็บ ต้องมีฟิลด์ citation: { "url": "...", "title": "...", "date": "YYYY-MM-DD" } กำกับ ถ้าไม่มีแหล่งอ้างอิงห้ามใส่
   - ถ้ารอบนี้ไม่มีข้อมูลที่ชาร์ตได้จริง ให้ใส่บล็อกว่าง: {}
   - โครงสร้างภายในบล็อกให้เป็นไปตามที่บทบาทของคุณกำหนด
2) ## Highlight — ใจความสำคัญที่สุดของงานวันนี้ "สองภาษา": บรรทัดภาษาไทย 1-2 ประโยค แล้วขึ้นบรรทัดใหม่ที่มีเพียง <!-- ===EN=== --> แล้วตามด้วยใจความเดียวกันเป็นภาษาอังกฤษ 1-2 ประโยค (ถ้าเขียน EN ไม่ได้ ให้ละบรรทัดคั่นนี้)
3) ## Flags — รายการ bullet 0-3 ข้อของสิ่งที่แผนกอื่นต้องทำต่อ "สองภาษา": bullet ภาษาไทยก่อน แล้วบรรทัด <!-- ===EN=== --> แล้วตามด้วย bullet ชุดเดียวกันเป็นภาษาอังกฤษ ถ้าไม่มีให้เขียน "None." ทั้งสองฝั่ง
4) บรรทัดคั่นที่มีเพียง: ---

Keep the two headers in English, verbatim ("## Highlight" then "## Flags"): do
not rename, translate, number, merge, or omit them, and never emit them more
than once. After the "---" line, write the full report per your role's
structure.`;

// v1.5.0 — full dual reports for the five non-finance agents, written AFTER the
// mandatory head.
const BILINGUAL_RULE = `

รายงานสองภาษา (สำคัญมาก): หลังบรรทัดคั่น --- ของส่วนหัว ให้เขียน "รายงานฉบับเต็ม" สองรอบติดกัน
1) รอบแรกเป็นภาษาไทยตามโครงสร้างรายงานในบทบาทของคุณ
2) คั่นด้วยบรรทัดที่มีเพียงข้อความนี้เป๊ะๆ บรรทัดเดียว: <!-- ===EN=== -->
3) แล้วเขียนเนื้อหาเดียวกันซ้ำเป็นภาษาอังกฤษ (สาระเท่ากัน เป็นภาษาอังกฤษธรรมชาติ ไม่ใช่แปลคำต่อคำ)
ลำดับผลลัพธ์ทั้งหมดต้องเป็น: บล็อก \`\`\`json findings → ## Highlight → ## Flags → --- → [รายงานไทยฉบับเต็ม] → <!-- ===EN=== --> → [รายงานอังกฤษฉบับเต็ม]
บล็อก findings และ Highlight/Flags มี "ชุดเดียว" ที่หัวรายงานเท่านั้น ห้ามทำซ้ำท้ายรายงาน`;

// v1.4.5 mode, reordered for the v1.5 head: Finance writes ONE full Thai analyst
// report then a SHORT English executive summary (not a full dual report).
const FINANCE_BILINGUAL_RULE = `

รายงานสองภาษาแบบ Thai-primary (สำคัญมาก): หลังบรรทัดคั่น --- ของส่วนหัว
1) เขียน "รายงานฉบับเต็ม" เป็นภาษาไทยตามโครงสร้างในบทบาท
2) คั่นด้วยบรรทัดที่มีเพียงข้อความนี้เป๊ะๆ บรรทัดเดียว: <!-- ===EN=== -->
3) แล้วเขียน "บทสรุปผู้บริหารฉบับย่อ" เป็นภาษาอังกฤษ ความยาว 150-250 คำเท่านั้น (verdict + ตัวเลขสำคัญ + ข้อควรระวัง) — ไม่ใช่การแปลทั้งฉบับ
ลำดับผลลัพธ์ทั้งหมดต้องเป็น: บล็อก \`\`\`json findings → ## Highlight → ## Flags → --- → [รายงานไทยฉบับเต็ม] → <!-- ===EN=== --> → [EN summary สั้น]
บล็อก findings และ Highlight/Flags มี "ชุดเดียว" ที่หัวรายงานเท่านั้น ห้ามทำซ้ำท้ายรายงาน`;

const persona = (role: string): string => `${AUTONOMOUS_PREAMBLE}${role}${BILINGUAL_RULE}${OUTPUT_HEAD_CONTRACT}`;
const financePersona = (role: string): string =>
  `${AUTONOMOUS_PREAMBLE}${role}${FINANCE_BILINGUAL_RULE}${OUTPUT_HEAD_CONTRACT}`;

// v1.5.0 — Telegram /ask + focus-session follow-ups. A chat answer needs none of
// the report scaffolding (with the head contract it would LEAD with a JSON block
// in chat). Preamble + brief + a short chat instruction only.
const CHAT_RULE = `

โหมดแชต: ตอบคำถามตรงๆ กระชับ เป็นภาษาเดียวกับคำถาม อ้างอิงแหล่ง+วันที่เมื่อค้นเว็บ ไม่ต้องใช้โครงสร้างรายงาน ไม่ต้องมีบล็อก findings หรือหัวข้อ Highlight/Flags`;

const chatPersona = (role: string): string => `${AUTONOMOUS_PREAMBLE}${role}${CHAT_RULE}`;

export const PERSONAS: Record<DeptId, string> = {
  ceo: persona(ROLES.ceo),
  cyb: persona(ROLES.cyb),
  mkt: persona(ROLES.mkt),
  rnd: persona(ROLES.rnd),
  ops: persona(ROLES.ops),
  fin: financePersona(ROLES.fin),
};

export const CHAT_PERSONAS: Record<DeptId, string> = {
  ceo: chatPersona(ROLES.ceo),
  cyb: chatPersona(ROLES.cyb),
  mkt: chatPersona(ROLES.mkt),
  rnd: chatPersona(ROLES.rnd),
  ops: chatPersona(ROLES.ops),
  fin: chatPersona(ROLES.fin),
};

export const PROJECTS_BLURB =
  'NaNote Corp ships: nanoteofficial.me (portfolio), finance.nanoteofficial.me (AI finance advisor), and company.nanoteofficial.me (this live AI office simulator). Founder: NaNote (Saksit Jantila), focus on technology strategy + cybersecurity.';
