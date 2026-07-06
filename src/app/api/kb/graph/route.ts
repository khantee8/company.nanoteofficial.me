// src/app/api/kb/graph/route.ts — v1.11 knowledge graph. PUBLISHED-only, same
// visibility rule as /api/kb; consumed by kb.nanoteofficial.me and future products.
import { NextRequest, NextResponse } from 'next/server';
import { getRepo } from '@/lib/redis';
import { getKnowledge } from '@/lib/kb';
import { buildKbGraph } from '@/lib/kbGraph';
import { isDeptId } from '@/lib/agents';
import type { KbEntry } from '@/lib/agents/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const deptParam = params.get('dept');
    const dept = deptParam && isDeptId(deptParam) ? deptParam : undefined;
    const category = (params.get('category') ?? undefined) as KbEntry['category'] | undefined;

    const entries = await getKnowledge(getRepo(), { dept, category });
    return NextResponse.json({ ...buildKbGraph(entries), generatedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ nodes: [], edges: [], generatedAt: new Date().toISOString() });
  }
}
