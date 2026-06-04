import { NextRequest, NextResponse } from 'next/server';
import { getRepo } from '@/lib/redis';
import { getKnowledge, getKnowledgeEntry } from '@/lib/kb';
import { isDeptId } from '@/lib/agents';
import type { KbEntry } from '@/lib/agents/types';

export const dynamic = 'force-dynamic';

// Public knowledge-base export — the seam kb.nanoteofficial.me will consume.
// Agent outputs are already public on /dashboard, so reads are not gated.
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const deptParam = params.get('dept');
    const dept = deptParam && isDeptId(deptParam) ? deptParam : undefined;
    const category = (params.get('category') ?? undefined) as KbEntry['category'] | undefined;
    const q = params.get('q') ?? undefined;
    const from = params.get('from') ?? undefined;
    const to = params.get('to') ?? undefined;

    const slug = params.get('slug') ?? undefined;
    const id = params.get('id') ?? undefined;
    if (slug || id) {
      const hit = await getKnowledgeEntry(getRepo(), { slug, id });
      if (!hit) return NextResponse.json({ error: 'not found' }, { status: 404 });
      return NextResponse.json(hit);
    }

    const limitRaw = Number(params.get('limit'));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : undefined;

    const entries = await getKnowledge(getRepo(), { dept, category, q, from, to, limit });
    return NextResponse.json({ entries, count: entries.length, generatedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ entries: [], count: 0, generatedAt: new Date().toISOString() });
  }
}
