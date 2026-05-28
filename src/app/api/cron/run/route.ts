import { NextRequest, NextResponse } from 'next/server';
import { AGENTS, isDeptId } from '@/lib/agents';
import { runAgent } from '@/lib/agents/runner';
import { getRepo } from '@/lib/redis';
import { sendMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
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
