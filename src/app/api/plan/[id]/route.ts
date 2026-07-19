import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';
import { makePlanDbStore } from '@/lib/planDb';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verifySession((await cookies()).get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const store = makePlanDbStore();
  const plan = await store.getPlan(id);
  if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const versions = await store.listVersions(id);
  return NextResponse.json({ plan, versions, latest: versions[0] ?? null });
}
