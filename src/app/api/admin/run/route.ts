import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';
import { isDeptId } from '@/lib/agents';
import { submitRunSafe } from '@/lib/agents/asyncRun';
import { getRepo } from '@/lib/redis';
import { sendMessage } from '@/lib/telegram';
import { isKnownModel } from '@/lib/cost';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!verifySession(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const dept = req.nextUrl.searchParams.get('dept');
  if (!dept || !isDeptId(dept)) return new NextResponse('bad dept', { status: 400 });

  try {
    const body = (await req.json().catch(() => ({}))) as { overrides?: { maxSearches?: number; model?: string } };
    // Validate operator overrides at the trust boundary: reject unknown models
    // (avoids a wasted/errored run from a typo) and clamp maxSearches to a sane range.
    const overrides = body.overrides;
    if (overrides) {
      if (overrides.model !== undefined && !isKnownModel(overrides.model)) {
        return new NextResponse('unknown model', { status: 400 });
      }
      if (overrides.maxSearches !== undefined) {
        if (!Number.isInteger(overrides.maxSearches) || overrides.maxSearches < 1 || overrides.maxSearches > 10) {
          return new NextResponse('maxSearches must be an integer 1-10', { status: 400 });
        }
      }
    }
    const r = await submitRunSafe(
      dept,
      { repo: getRepo(), notify: (t) => sendMessage(t) },
      { origin: 'admin', overrides },
    );
    if (r.queued) return NextResponse.json({ ok: true, queued: true });
    return NextResponse.json({ ok: true, dept, summary: r.summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, dept, error: message }, { status: 500 });
  }
}
