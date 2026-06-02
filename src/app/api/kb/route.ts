import { NextRequest, NextResponse } from 'next/server';
import { getRepo } from '@/lib/redis';
import { getKnowledge } from '@/lib/kb';
import { isDeptId } from '@/lib/agents';

export const dynamic = 'force-dynamic';

// Public knowledge-base export — the seam kb.nanoteofficial.me will consume.
// Agent outputs are already public on /dashboard, so reads are not gated.
export async function GET(req: NextRequest) {
  try {
    const deptParam = req.nextUrl.searchParams.get('dept');
    const dept = deptParam && isDeptId(deptParam) ? deptParam : undefined;

    const limitRaw = Number(req.nextUrl.searchParams.get('limit'));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : undefined;

    const entries = await getKnowledge(getRepo(), { dept, limit });
    return NextResponse.json({ entries, count: entries.length, generatedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ entries: [], count: 0, generatedAt: new Date().toISOString() });
  }
}
