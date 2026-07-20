import { cookies } from 'next/headers';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';
import { makePlanDbStore } from '@/lib/planDb';
import { generateDeck } from '@/lib/slides/pipeline';
import { THEMES, type ThemeId } from '@/lib/slides/deck';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verifySession((await cookies()).get(ADMIN_COOKIE)?.value)) {
    return new Response('unauthorized', { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const theme: ThemeId = THEMES.includes(body.theme) ? body.theme : 'midnight';
  const slideCount = Math.min(Math.max(Number(body.slideCount) || 8, 3), 20);
  const store = makePlanDbStore();
  const plan = await store.getPlan(id);
  if (!plan) return new Response('not found', { status: 404 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      try {
        const result = await generateDeck(
          { theme, slideCount, audience: plan.audience, brief: plan.brief, extra: body.extra },
          undefined,
          (n) => send({ type: 'step', ...n }),
        );
        const version = await store.addVersion(id, result.deck, result.meta);
        send({ type: 'done', versionNo: version.versionNo, deck: result.deck, meta: result.meta });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : 'generation failed' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' } });
}
