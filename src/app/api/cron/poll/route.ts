// src/app/api/cron/poll/route.ts — v1.12 batch collector. CRON_SECRET-gated;
// triggered by the GitHub Actions schedule (self-poll in submitRun is the fast path).
import { NextRequest, NextResponse } from 'next/server';
import { pollPendingRuns } from '@/lib/agents/asyncRun';
import { getRepo } from '@/lib/redis';
import { sendMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  try {
    const r = await pollPendingRuns({ repo: getRepo(), notify: (t) => sendMessage(t) });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
