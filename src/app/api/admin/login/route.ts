import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, checkCredentials, createSessionToken, SESSION_MAX_AGE_S } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { user?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 });
  }
  const user = typeof body.user === 'string' ? body.user : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!checkCredentials(user, password)) {
    return NextResponse.json({ ok: false, error: 'invalid credentials' }, { status: 401 });
  }
  const token = createSessionToken();
  if (!token) {
    return NextResponse.json({ ok: false, error: 'admin not configured' }, { status: 503 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
