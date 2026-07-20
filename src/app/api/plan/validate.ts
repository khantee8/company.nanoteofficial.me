export type CreateInput = { title: string; brief: string; audience: string };

export function validateCreate(
  body: Record<string, unknown>,
): { ok: true; value: CreateInput } | { ok: false; error: string } {
  const title = String(body?.title ?? '').trim();
  if (!title) return { ok: false, error: 'title required' };
  return {
    ok: true,
    value: {
      title,
      brief: String(body?.brief ?? ''),
      audience: String(body?.audience ?? ''),
    },
  };
}
