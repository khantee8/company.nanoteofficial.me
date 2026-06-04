export type TgCommand = 'status' | 'run' | 'ask' | 'agents' | 'report' | 'help';
export interface ParsedCommand { cmd: TgCommand; args: string[]; }

const KNOWN: TgCommand[] = ['status', 'run', 'ask', 'agents', 'report', 'help'];

export function parseCommand(text: string): ParsedCommand | null {
  if (!text.startsWith('/')) return null;
  const [head, ...rest] = text.trim().split(/\s+/);
  const cmd = head.slice(1).split('@')[0].toLowerCase() as TgCommand;
  if (!KNOWN.includes(cmd)) return null;
  if (cmd === 'ask') {
    const [dept, ...q] = rest;
    return { cmd, args: dept ? [dept, q.join(' ')] : [] };
  }
  return { cmd, args: rest };
}

export function isAllowedChat(chatId: number | string, allowed: string | undefined): boolean {
  return !!allowed && String(chatId) === String(allowed);
}

export async function sendMessage(text: string, chatId?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = chatId ?? process.env.TELEGRAM_ALLOWED_CHAT_ID;
  if (!token || !chat) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
    if (!res.ok) console.error('telegram sendMessage failed:', res.status);
  } catch {
    /* best-effort notify */
  }
}

export interface FocusSession {
  dept: string;
  turns: { role: 'user' | 'assistant'; text: string }[];
  until: number;
}
export const FOCUS_TTL_MS = 15 * 60 * 1000;
export const focusKey = (chatId: string | number) => `tg:focus:${chatId}`;
export function isFocusLive(s: FocusSession | null, now = Date.now()): boolean {
  return !!s && s.until > now;
}
