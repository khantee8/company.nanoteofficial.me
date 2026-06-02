import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(async () => ({ content: [{ type: 'text', text: 'hi' }] })),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
    constructor(_opts: unknown) {}
  },
}));

import { complete } from './claude';

describe('complete model selection', () => {
  beforeEach(() => createMock.mockClear());

  it('defaults to sonnet when no model is given', async () => {
    await complete({ system: 's', prompt: 'p' });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' }),
    );
  });

  it('uses the provided model override and maxTokens', async () => {
    await complete({ system: 's', prompt: 'p', model: 'claude-haiku-4-5-20251001', maxTokens: 600 });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001', max_tokens: 600 }),
    );
  });
});
