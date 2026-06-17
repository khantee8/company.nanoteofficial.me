import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';
import { getRepo } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifySession(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  return NextResponse.json({ log: await getRepo().getSyncLog() });
}
