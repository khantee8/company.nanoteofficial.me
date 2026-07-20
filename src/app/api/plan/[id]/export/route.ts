import { cookies } from 'next/headers';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';
import { makePlanDbStore } from '@/lib/planDb';
import { deckToPptx } from '@/lib/slides/pptx';
import { validateDeck } from '@/lib/slides/deck';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verifySession((await cookies()).get(ADMIN_COOKIE)?.value)) return new Response('unauthorized', { status: 401 });
  const { id } = await params;
  const url = new URL(req.url);
  const v = Number(url.searchParams.get('v'));
  const ver = await makePlanDbStore().getVersion(id, v);
  if (!ver) return new Response('not found', { status: 404 });
  const parsed = validateDeck(ver.deck);
  if (!parsed.ok) return new Response('bad deck', { status: 422 });
  const buf = await deckToPptx(parsed.deck);
  return new Response(new Uint8Array(buf), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'content-disposition': `attachment; filename="plan-${id}-v${v}.pptx"` } });
}
