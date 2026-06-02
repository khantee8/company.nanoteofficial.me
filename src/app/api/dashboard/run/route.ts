import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { AGENTS, isDeptId } from '@/lib/agents';
import { runAgent } from '@/lib/agents/runner';
import { getRepo } from '@/lib/redis';
import { sendMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Constant-time string comparison to avoid leaking the passcode via timing. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function authorized(req: NextRequest): boolean {
  const code = process.env.DASHBOARD_PASSCODE;
  if (!code) return false; // gate stays closed until the owner sets a passcode
  const header = req.headers.get('authorization') ?? '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;
  return safeEqual(header.slice(prefix.length), code);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return new NextResponse('unauthorized', { status: 401 });

  const dept = req.nextUrl.searchParams.get('dept');
  if (!dept || !isDeptId(dept)) return new NextResponse('bad dept', { status: 400 });

  try {
    const result = await runAgent(
      { dept, run: AGENTS[dept] },
      { repo: getRepo(), notify: (t) => sendMessage(t) },
    );
    return NextResponse.json({ ok: true, dept, summary: result.summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, dept, error: message }, { status: 500 });
  }
}
