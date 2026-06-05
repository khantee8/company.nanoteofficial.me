import { describe, it, expect, vi, beforeEach } from 'vitest';

const { streamMock } = vi.hoisted(() => ({
  streamMock: vi.fn(() => ({
    finalMessage: async () => ({
      content: [{ type: 'text', text: 'hi' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  })),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { stream: streamMock };
  },
}));

import { complete } from './claude';

describe('complete model selection', () => {
  beforeEach(() => streamMock.mockClear());

  it('defaults to sonnet when no model is given', async () => {
    await complete({ system: 's', prompt: 'p' });
    expect(streamMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' }),
    );
  });

  it('uses the provided model override and maxTokens', async () => {
    await complete({ system: 's', prompt: 'p', model: 'claude-haiku-4-5-20251001', maxTokens: 600 });
    expect(streamMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001', max_tokens: 600 }),
    );
  });
});
