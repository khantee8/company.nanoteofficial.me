import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';
import { AGENTS, isDeptId } from '@/lib/agents';
import { runAgent } from '@/lib/agents/runner';
import { getRepo } from '@/lib/redis';
import { sendMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!verifySession(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const dept = req.nextUrl.searchParams.get('dept');
  if (!dept || !isDeptId(dept)) return new NextResponse('bad dept', { status: 400 });

  try {
    const body = (await req.json().catch(() => ({}))) as { overrides?: { maxSearches?: number; model?: string } };
    const result = await runAgent(
      { dept, run: AGENTS[dept] },
      { repo: getRepo(), notify: (t) => sendMessage(t) },
      body.overrides,
    );
    return NextResponse.json({ ok: true, dept, summary: result.summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, dept, error: message }, { status: 500 });
  }
}
