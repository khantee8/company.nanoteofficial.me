// v1.4.1 — chart titles are authored as English literals in the deterministic
// `<dept>Artifacts()` builders (the Artifact type is unchanged). The renderer
// localizes a title at view time: for `th`, look it up here; a missing key falls
// back to the English title verbatim (safe default — no broken render).

import type { Lang } from './messages';

const TH: Record<string, string> = {
  // Finance
  'Total expense ratio (TER %)': 'ค่าธรรมเนียมรวม (TER %)',
  '1-year return (%)': 'ผลตอบแทนย้อนหลัง 1 ปี (%)',
  'Fund comparison': 'เปรียบเทียบกองทุน',
  // CyberX
  severity: 'ระดับความรุนแรง',
  'new exploited / day': 'ช่องโหว่ใหม่ที่ถูกใช้ / วัน',
  'newly exploited CVEs': 'CVE ที่เพิ่งถูกโจมตี',
  'advisories (researched)': 'คำแนะนำความปลอดภัย (ค้นคว้า)',
  // R&D
  'trending repos (stars / 14d)': 'repo มาแรง (ดาว / 14 วัน)',
  'language mix': 'สัดส่วนภาษา',
  'research radar': 'เรดาร์วิจัย',
  'research radar (cited)': 'เรดาร์วิจัย (อ้างอิง)',
  // Marketing
  'topic momentum (demand)': 'โมเมนตัมหัวข้อ (ดีมานด์)',
  'site reach / 7d': 'การเข้าถึงเว็บ / 7 วัน',
  'content plan': 'แผนคอนเทนต์',
  'demand signals (researched)': 'สัญญาณดีมานด์ (ค้นคว้า)',
  // Operations
  'deployment health': 'สุขภาพการดีพลอย',
  'repo activity': 'กิจกรรม repo',
  'ops notes (researched)': 'บันทึกปฏิบัติการ (ค้นคว้า)',
  // CEO
  'department health': 'สุขภาพแต่ละแผนก',
  'open flags by dept': 'ประเด็นค้างตามแผนก',
  '7-day activity': 'กิจกรรม 7 วัน',
  "today's decisions": 'การตัดสินใจวันนี้',
};

export function chartTitle(lang: Lang, title: string): string {
  if (lang === 'en') return title;
  return TH[title] ?? title;
}
