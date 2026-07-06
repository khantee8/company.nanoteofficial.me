import { NextRequest, NextResponse } from 'next/server';
import { AGENTS, isDeptId } from '@/lib/agents';
import { runAgent } from '@/lib/agents/runner';
import { getRepo } from '@/lib/redis';
import { sendMessage } from '@/lib/telegram';
import { runSweep } from '@/lib/agents/watchdog';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return new NextResponse('unauthorized', { status: 401 });

  // v1.11 — OperX self-heal sweep: retry (at most) one failed dept today.
  if (req.nextUrl.searchParams.get('sweep') === '1') {
    try {
      const sweep = await runSweep({ repo: getRepo(), notify: (t) => sendMessage(t) });
      return NextResponse.json({ ok: true, sweep });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  const dept = req.nextUrl.searchParams.get('dept');
  if (!dept || !isDeptId(dept)) return new NextResponse('bad dept', { status: 400 });
  if (await getRepo().isAgentDisabled(dept)) {
    return NextResponse.json({ ok: true, dept, skipped: 'disabled' });
  }

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
