import { NextRequest, NextResponse } from 'next/server';
import { sendMessage } from '@/lib/telegram';
import { getRepo } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { type?: string; payload?: { deployment?: { url?: string }; name?: string; target?: string } }
    | null;
  if (!body?.type) return NextResponse.json({ ok: true });

  const name = body.payload?.name ?? 'project';
  const url = body.payload?.deployment?.url ?? '';
  let msg: string | null = null;
  if (body.type === 'deployment.succeeded' || body.type === 'deployment.ready') msg = `✅ Deploy ready: ${name} ${url}`;
  else if (body.type === 'deployment.error') msg = `⚠️ Deploy failed: ${name} ${url}`;

  if (msg) {
    await sendMessage(msg);
    try { await getRepo().pushEvent({ dept: 'ops', msg: msg.replace(/^[✅⚠️]\s*/, ''), ts: new Date().toISOString() }); } catch { /* ignore */ }
  }
  return NextResponse.json({ ok: true });
}
