import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';
import { makePlanDbStore } from '@/lib/planDb';
import { validateCreate } from './validate';

export const dynamic = 'force-dynamic';

async function authed(): Promise<boolean> {
  return verifySession((await cookies()).get(ADMIN_COOKIE)?.value);
}

export async function GET() {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ plans: await makePlanDbStore().listPlans() });
}

export async function POST(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const v = validateCreate(await req.json().catch(() => ({})));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  return NextResponse.json({ plan: await makePlanDbStore().createPlan(v.value) });
}
