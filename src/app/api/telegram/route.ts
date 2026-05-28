import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { parseCommand, isAllowedChat, sendMessage } from '@/lib/telegram';
import { AGENTS, isDeptId } from '@/lib/agents';
import { runAgent } from '@/lib/agents/runner';
import { getRepo } from '@/lib/redis';
import { complete } from '@/lib/claude';
import { PERSONAS } from '@/lib/agents/personas';
import { DEPARTMENTS } from '@/lib/data/departments';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NAME_TO_ID: Record<string, string> = {
  finance: 'fin', fin: 'fin', marketing: 'mkt', mkt: 'mkt',
  rnd: 'rnd', research: 'rnd', operations: 'ops', ops: 'ops', ceo: 'ceo',
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

  console.log('telegram webhook: chatId=%s allowed=%s secret_match=%s', chatId, process.env.TELEGRAM_ALLOWED_CHAT_ID, req.headers.get('x-telegram-bot-api-secret-token') === process.env.TELEGRAM_WEBHOOK_SECRET);
  if (chatId == null || !isAllowedChat(chatId, process.env.TELEGRAM_ALLOWED_CHAT_ID)) {
    console.log('telegram webhook: chat not allowed, dropping');
    return NextResponse.json({ ok: true });
  }
  const parsed = parseCommand(text);
  if (!parsed) {
    await sendMessage('Unknown command. Try /help', String(chatId));
    return NextResponse.json({ ok: true });
  }

  const reply = (t: string) => sendMessage(t, String(chatId));

  if (parsed.cmd === 'help') {
    await reply('Commands:\n/status — all agents\n/run <dept> — trigger a run\n/ask <dept> <question>\nDepts: finance, marketing, rnd, operations, ceo');
  } else if (parsed.cmd === 'status') {
    const repo = getRepo();
    const lines = await Promise.all(
      DEPARTMENTS.map(async (d) => {
        const s = await repo.getStatus(d.id);
        return `${d.shortName}: ${s.state}${s.summary ? ` — ${s.summary}` : ''}`;
      }),
    );
    await reply(lines.join('\n'));
  } else if (parsed.cmd === 'run') {
    const id = NAME_TO_ID[(parsed.args[0] ?? '').toLowerCase()];
    if (!id || !isDeptId(id)) { await reply('Usage: /run <finance|marketing|rnd|operations|ceo>'); return NextResponse.json({ ok: true }); }
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
        const answer = await complete({ system: PERSONAS[id], prompt: question, maxTokens: 600 });
        await sendMessage(`*${id.toUpperCase()}*: ${answer}`, String(chatId));
      } catch (e) {
        await sendMessage(`⚠ ask failed: ${e instanceof Error ? e.message : 'error'}`, String(chatId));
      }
    });
  }

  return NextResponse.json({ ok: true });
}
