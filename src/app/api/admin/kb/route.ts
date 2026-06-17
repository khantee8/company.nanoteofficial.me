// Admin KB Manager API — cookie-gated CRUD over knowledge-base entries.
//   GET    ?status=&dept=&category=&q=&limit=   → list (ALL statuses incl. drafts)
//   PATCH  { id, status?, pinned?, tags?, category? }  → curate one entry
//   DELETE ?id=                                  → remove one entry
// The public, published-only feed stays at GET /api/kb.
import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';
import { getRepo, type KbQuery, type KbPatch } from '@/lib/redis';
import { isDeptId } from '@/lib/agents';
import type { KbEntry } from '@/lib/agents/types';

export const dynamic = 'force-dynamic';

const STATUSES: KbEntry['status'][] = ['draft', 'published', 'archived'];
const CATEGORIES: KbEntry['category'][] = [
  'market-brief', 'threat-intel', 'research', 'content-plan', 'ops-status', 'exec-brief',
];

function authed(req: NextRequest): boolean {
  return verifySession(req.cookies.get(ADMIN_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return new NextResponse('unauthorized', { status: 401 });
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const dept = sp.get('dept');
  const category = sp.get('category');
  const limit = Number(sp.get('limit') ?? '200');

  const query: KbQuery = {
    status: status && STATUSES.includes(status as KbEntry['status']) ? (status as KbEntry['status']) : undefined,
    dept: dept && isDeptId(dept) ? dept : undefined,
    category: category && CATEGORIES.includes(category as KbEntry['category']) ? (category as KbEntry['category']) : undefined,
    q: sp.get('q') || undefined,
    limit: Number.isFinite(limit) ? limit : 200,
  };

  try {
    const entries = await getRepo().listKb(query);
    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ entries: [], error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!authed(req)) return new NextResponse('unauthorized', { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: string } & KbPatch;
  if (!body.id) return new NextResponse('missing id', { status: 400 });

  const patch: KbPatch = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return new NextResponse('bad status', { status: 400 });
    patch.status = body.status;
  }
  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category)) return new NextResponse('bad category', { status: 400 });
    patch.category = body.category;
  }
  if (body.pinned !== undefined) patch.pinned = Boolean(body.pinned);
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) return new NextResponse('bad tags', { status: 400 });
    patch.tags = body.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 16);
  }

  try {
    const entry = await getRepo().updateKbEntry(body.id, patch);
    if (!entry) return new NextResponse('not found', { status: 404 });
    if (patch.status === 'published') {
      // await fail-soft Library sync push so it runs on serverless
      await (await import('@/lib/librarySync')).pushLibrarySync(entry.slug, getRepo());
    }
    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!authed(req)) return new NextResponse('unauthorized', { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return new NextResponse('missing id', { status: 400 });
  try {
    await getRepo().deleteKbEntry(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
