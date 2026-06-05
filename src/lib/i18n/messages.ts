// v1.4.1 — UI string dictionary. No i18n library (house "no new deps" rule):
// a typed map keyed by stable string id, with `en` and `th` kept key-identical
// (guarded by messages.test.ts). Agent-generated content is NOT here — that is
// dual-generated and stored per-language in the KB; this covers only UI chrome.

export type Lang = 'en' | 'th';

export const MESSAGES = {
  en: {
    'nav.office': 'Office',
    'nav.dashboard': 'Dashboard',
    'nav.doc': 'Docs',
    'nav.overview': 'Overview',
    'nav.live': '6 AGENTS LIVE',

    'exec.title': 'Executive Dashboard',
    'exec.subtitle':
      'A live, data-driven view of NaNote Corp — six AI agents working across two floors, each producing real daily intelligence.',
    'exec.loading': 'Loading agent intelligence…',
    'exec.noData': 'No agent data yet — agents report on a daily schedule.',
    'exec.pulse': 'Company Pulse',

    'kpi.reportingToday': 'Reporting today',
    'kpi.agentsWithOutput': 'Agents with output',
    'kpi.openFlags': 'Open flags',
    'kpi.lastActivity': 'Last activity',

    'cockpit.title': 'CEO · Executive Cockpit',
    'cockpit.openCeo': 'Open CEO detail →',

    'card.awaiting': 'Awaiting next scheduled run.',
    'card.viewDetail': 'View detail →',
    'card.history': 'history',
    'common.updated': 'updated',

    'detail.status': 'status',
    'detail.openFlags': 'open flags',
    'detail.charts': 'charts',
    'detail.history': 'history',
    'detail.analysis': 'Analysis',
    'detail.brief': 'This agent reports as a written brief — see the analysis below.',
    'detail.awaiting': 'Awaiting the next scheduled run.',
    'detail.sources': 'Sources',
    'detail.related': 'Related',

    'lang.en': 'EN',
    'lang.th': 'ไทย',

    'doc.title': 'User Guide',
    'doc.sec.start': 'Getting Started',
    'doc.sec.runs': 'How it runs',
    'doc.sec.using': 'Using it',
    'doc.sec.operating': 'Operating',
    'doc.overview': 'Overview',
    'doc.agents': 'The 6 Agents',
    'doc.cadence': 'Cadence & Provenance',
    'doc.dashboard': 'Dashboard',
    'doc.kb': 'Knowledge Base',
    'doc.telegram': 'Telegram Bot',
    'doc.admin': 'Admin Console',
  },
  th: {
    'nav.office': 'ออฟฟิศ',
    'nav.dashboard': 'แดชบอร์ด',
    'nav.doc': 'คู่มือ',
    'nav.overview': 'ภาพรวม',
    'nav.live': 'เอเจนต์ 6 ตัวออนไลน์',

    'exec.title': 'แดชบอร์ดผู้บริหาร',
    'exec.subtitle':
      'มุมมองแบบเรียลไทม์ที่ขับเคลื่อนด้วยข้อมูลของ NaNote Corp — เอเจนต์ AI หกตัวทำงานข้ามสองชั้น แต่ละตัวผลิตข้อมูลเชิงลึกจริงทุกวัน',
    'exec.loading': 'กำลังโหลดข้อมูลเอเจนต์…',
    'exec.noData': 'ยังไม่มีข้อมูลเอเจนต์ — เอเจนต์รายงานตามรอบเวลาประจำวัน',
    'exec.pulse': 'ชีพจรบริษัท',

    'kpi.reportingToday': 'รายงานวันนี้',
    'kpi.agentsWithOutput': 'เอเจนต์ที่มีผลงาน',
    'kpi.openFlags': 'ประเด็นค้าง',
    'kpi.lastActivity': 'กิจกรรมล่าสุด',

    'cockpit.title': 'CEO · ห้องบัญชาการผู้บริหาร',
    'cockpit.openCeo': 'เปิดหน้า CEO →',

    'card.awaiting': 'รอรอบทำงานถัดไป',
    'card.viewDetail': 'ดูรายละเอียด →',
    'card.history': 'ประวัติ',
    'common.updated': 'อัปเดต',

    'detail.status': 'สถานะ',
    'detail.openFlags': 'ประเด็นค้าง',
    'detail.charts': 'กราฟ',
    'detail.history': 'ประวัติ',
    'detail.analysis': 'บทวิเคราะห์',
    'detail.brief': 'เอเจนต์นี้รายงานเป็นบทความ — ดูบทวิเคราะห์ด้านล่าง',
    'detail.awaiting': 'รอรอบทำงานถัดไปตามกำหนด',
    'detail.sources': 'แหล่งอ้างอิง',
    'detail.related': 'ที่เกี่ยวข้อง',

    'lang.en': 'EN',
    'lang.th': 'ไทย',

    'doc.title': 'คู่มือผู้ใช้',
    'doc.sec.start': 'เริ่มต้นใช้งาน',
    'doc.sec.runs': 'การทำงาน',
    'doc.sec.using': 'การใช้งาน',
    'doc.sec.operating': 'การดูแลระบบ',
    'doc.overview': 'ภาพรวม',
    'doc.agents': 'เอเจนต์ทั้ง 6',
    'doc.cadence': 'รอบการทำงาน & ที่มาข้อมูล',
    'doc.dashboard': 'แดชบอร์ด',
    'doc.kb': 'ฐานความรู้',
    'doc.telegram': 'บอท Telegram',
    'doc.admin': 'คอนโซลผู้ดูแล',
  },
} as const;

export type MsgKey = keyof typeof MESSAGES.en;

export function translate(lang: Lang, key: MsgKey): string {
  return MESSAGES[lang][key];
}
