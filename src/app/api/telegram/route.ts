import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { parseCommand, isAllowedChat, sendMessage, isFocusLive, FOCUS_TTL_MS } from '@/lib/telegram';
import type { FocusSession } from '@/lib/telegram';
import { AGENTS, isDeptId } from '@/lib/agents';
import { runAgent } from '@/lib/agents/runner';
import { getRepo } from '@/lib/redis';
import { complete } from '@/lib/claude';
import { CHAT_PERSONAS } from '@/lib/agents/personas';
import { DEPARTMENTS } from '@/lib/data/departments';
import { getKnowledge } from '@/lib/kb';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NAME_TO_ID: Record<string, string> = {
  finance: 'fin', fin: 'fin', marketing: 'mkt', mkt: 'mkt',
  rnd: 'rnd', research: 'rnd', operations: 'ops', ops: 'ops', ceo: 'ceo',
  cyberx: 'cyb', cyb: 'cyb',
};

const CADENCE: Record<string, string> = {
  cyb: 'CyberX — รายวัน', fin: 'FinX — จ/พ/ศ (ธีมหมุน)', rnd: 'AIX — อ/พฤ',
  mkt: 'M&SX — จ/พฤ', ops: 'OperX — รายวัน', ceo: 'CEOX — รายสัปดาห์',
};

export async function POST(req: NextRequest) {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new NextResponse('forbidden', { status: 403 });
  }
  const update = (await req.json().catch(() => null)) as
    | { message?: { chat?: { id?: number }; text?: string } }
    | null;
  const chatId = update?.message?.chat?.id;
  const text = update?.message?.text ?? '';

  if (chatId == null || !isAllowedChat(chatId, process.env.TELEGRAM_ALLOWED_CHAT_ID)) {
    return NextResponse.json({ ok: true });
  }
  const parsed = parseCommand(text);

  if (!parsed) {
    const repo = getRepo();
    const session = await repo.getFocus(chatId);
    if (isFocusLive(session) && session) {
      if (text.trim().toLowerCase() === '/end') {
        await repo.clearFocus(chatId);
        await sendMessage('จบบทสนทนาแล้ว', String(chatId));
        return NextResponse.json({ ok: true });
      }
      after(async () => {
        try {
          const history = session.turns.map((t) => `${t.role === 'user' ? 'ผู้ใช้' : 'คุณ'}: ${t.text}`).join('\n');
          const prompt = `${history}\nผู้ใช้: ${text}\n\nตอบต่อเนื่องในบทสนทนานี้ (ค้นเว็บเพิ่มได้ถ้าจำเป็น อ้างอิงแหล่ง)`;
          const answer = await complete({ system: CHAT_PERSONAS[session.dept as keyof typeof CHAT_PERSONAS], prompt, webSearch: true, maxSearches: 5, maxTokens: 1500 });
          await sendMessage(`*${session.dept.toUpperCase()}*: ${answer}`, String(chatId));
          const turns = [...session.turns, { role: 'user' as const, text }, { role: 'assistant' as const, text: answer }].slice(-8);
          await repo.setFocus(chatId, { dept: session.dept, turns, until: Date.now() + FOCUS_TTL_MS });
        } catch (e) {
          await sendMessage(`⚠ follow-up failed: ${e instanceof Error ? e.message : 'error'}`, String(chatId));
        }
      });
      return NextResponse.json({ ok: true });
    }
    await sendMessage('Unknown command. Try /help', String(chatId));
    return NextResponse.json({ ok: true });
  }

  const reply = (t: string) => sendMessage(t, String(chatId));

  if (parsed.cmd === 'help') {
    await reply(
      'Commands:\n' +
      '/status — สถานะทุก agent\n' +
      '/agents — รายชื่อ agent + รูปแบบการทำงาน\n' +
      '/run <dept> — สั่ง run agent\n' +
      '/ask <dept> <question> — ถาม agent พร้อมค้นเว็บ (เปิด focus session 15 นาที)\n' +
      '  หลัง /ask พิมพ์ต่อได้เลย ไม่ต้องใช้คำสั่ง (/end เพื่อจบ)\n' +
      '/report <dept> — รายงานล่าสุดที่เผยแพร่แล้ว\n' +
      'Depts: finance, marketing, rnd, operations, ceo, cyberx',
    );
  } else if (parsed.cmd === 'status') {
    const repo = getRepo();
    const lines = await Promise.all(
      DEPARTMENTS.map(async (d) => {
        const s = await repo.getStatus(d.id);
        return `${d.shortName}: ${s.state}${s.summary ? ` — ${s.summary}` : ''}`;
      }),
    );
    await reply(lines.join('\n'));
  } else if (parsed.cmd === 'agents') {
    const header = 'Agent cadence:\n';
    await reply(header + Object.values(CADENCE).join('\n'));
  } else if (parsed.cmd === 'report') {
    const rawDept = (parsed.args[0] ?? '').toLowerCase();
    const id = NAME_TO_ID[rawDept];
    if (!id || !isDeptId(id)) {
      await reply('Usage: /report <finance|marketing|rnd|operations|ceo|cyberx>');
      return NextResponse.json({ ok: true });
    }
    const [entry] = await getKnowledge(getRepo(), { dept: id, limit: 1 });
    if (!entry) {
      await reply('ยังไม่มีรายงานที่เผยแพร่');
    } else {
      await reply(`*${id.toUpperCase()}* — ${entry.highlight || entry.summary}\nslug: ${entry.slug}`);
    }
  } else if (parsed.cmd === 'run') {
    const id = NAME_TO_ID[(parsed.args[0] ?? '').toLowerCase()];
    if (!id || !isDeptId(id)) { await reply('Usage: /run <finance|marketing|rnd|operations|ceo|cyberx>'); return NextResponse.json({ ok: true }); }
    await reply(`▶ running ${id}…`);
    after(async () => {
      try {
        await runAgent({ dept: id, run: AGENTS[id] }, { repo: getRepo(), notify: (t) => sendMessage(t, String(chatId)) });
      } catch { /* runAgent already notified */ }
    });
  } else if (parsed.cmd === 'ask') {
    const id = NAME_TO_ID[(parsed.args[0] ?? '').toLowerCase()];
    const question = parsed.args[1] ?? '';
    if (!id || !isDeptId(id) || !question) { await reply('Usage: /ask <dept> <question>'); return NextResponse.json({ ok: true }); }
    after(async () => {
      try {
        const answer = await complete({ system: CHAT_PERSONAS[id], prompt: question, webSearch: true, maxSearches: 5, maxTokens: 1800 });
        await sendMessage(`*${id.toUpperCase()}*: ${answer}`, String(chatId));
        const repo = getRepo();
        const session: FocusSession = { dept: id, turns: [{ role: 'user', text: question }, { role: 'assistant', text: answer }], until: Date.now() + FOCUS_TTL_MS };
        await repo.setFocus(chatId, session);
      } catch (e) {
        await sendMessage(`⚠ ask failed: ${e instanceof Error ? e.message : 'error'}`, String(chatId));
      }
    });
  }

  return NextResponse.json({ ok: true });
}
