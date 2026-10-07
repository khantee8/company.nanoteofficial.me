import { NextRequest, NextResponse } from 'next/server';
import { sendMessage } from '@/lib/telegram';
import { getRepo } from '@/lib/redis';
import { validSignature } from '@/lib/webhookSig';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  // ponytail: verify only when the secret is configured, so an unset env keeps
  // deploy alerts working; make it fail-closed once the secret is confirmed in prod.
  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (secret && !validSignature(raw, req.headers.get('x-vercel-signature'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (() => { try { return JSON.parse(raw); } catch { return null; } })() as
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
