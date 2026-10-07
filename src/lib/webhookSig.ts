import { createHmac, timingSafeEqual } from 'crypto';

/** Vercel signs the raw body with HMAC-SHA1 (hex) in `x-vercel-signature`. */
export function validSignature(raw: string, signature: string | null, secret: string): boolean {
  const expected = Buffer.from(createHmac('sha1', secret).update(raw).digest('hex'));
  const given = Buffer.from(signature ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
