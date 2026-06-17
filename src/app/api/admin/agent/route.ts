import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';
import { isDeptId } from '@/lib/agents';
import { getRepo } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  if (!verifySession(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { dept?: string; disabled?: boolean };
  if (!body.dept || !isDeptId(body.dept)) return new NextResponse('bad dept', { status: 400 });
  if (typeof body.disabled !== 'boolean') return new NextResponse('bad disabled', { status: 400 });
  await getRepo().setAgentDisabled(body.dept, body.disabled);
  return NextResponse.json({ ok: true, dept: body.dept, disabled: body.disabled });
}
