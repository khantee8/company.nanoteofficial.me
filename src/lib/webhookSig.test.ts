import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { validSignature } from './webhookSig';

describe('validSignature', () => {
  const raw = '{"type":"deployment.ready"}';
  const sig = createHmac('sha1', 's3cret').update(raw).digest('hex');

  it('accepts the HMAC-SHA1 of the raw body', () => {
    expect(validSignature(raw, sig, 's3cret')).toBe(true);
  });

  it('rejects a missing, wrong-secret or tampered signature', () => {
    expect(validSignature(raw, null, 's3cret')).toBe(false);
    expect(validSignature(raw, sig, 'other')).toBe(false);
    expect(validSignature(raw + ' ', sig, 's3cret')).toBe(false);
  });
});
