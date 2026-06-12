import { describe, it, expect, vi, beforeEach } from 'vitest';

const { streamMock } = vi.hoisted(() => {
  type FakeBlock = { type: string; text?: string; [k: string]: unknown };
  type FakeMsg = {
    content: FakeBlock[];
    stop_reason: string;
    usage: { input_tokens: number; output_tokens: number };
  };
  type FakeParams = { messages: { role: string }[] };
  return {
    // param typed so `.mock.calls[i][0].messages` is introspectable in tests
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    streamMock: vi.fn((_p: FakeParams): { finalMessage: () => Promise<FakeMsg> } => ({
      finalMessage: async () => ({
        content: [{ type: 'text', text: 'hi' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    })),
  };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { stream: streamMock };
  },
}));

import { complete, completeRaw } from './claude';

describe('complete model selection', () => {
  beforeEach(() => streamMock.mockClear());

  it('defaults to haiku when no model is given (cost-saving default)', async () => {
    await complete({ system: 's', prompt: 'p' });
    expect(streamMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }),
    );
  });

  it('uses the provided model override and maxTokens', async () => {
    await complete({ system: 's', prompt: 'p', model: 'claude-haiku-4-5-20251001', maxTokens: 600 });
    expect(streamMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001', max_tokens: 600 }),
    );
  });
});

describe('web_search tool declaration', () => {
  beforeEach(() => streamMock.mockClear());

  it('declares web_search with allowed_callers direct (Haiku has no programmatic tool calling)', async () => {
    await complete({ system: 's', prompt: 'p', webSearch: true, maxSearches: 3 });
    expect(streamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            type: 'web_search_20260209',
            name: 'web_search',
            max_uses: 3,
            allowed_callers: ['direct'],
          }),
        ],
      }),
    );
  });

  it('sends no tools when webSearch is off', async () => {
    await complete({ system: 's', prompt: 'p' });
    expect(streamMock.mock.calls[0][0]).not.toHaveProperty('tools');
  });
});

describe('completeRaw pause_turn resumption', () => {
  beforeEach(() => streamMock.mockClear());

  it('resumes a paused turn and concatenates text + sums usage', async () => {
    streamMock
      .mockReturnValueOnce({
        finalMessage: async () => ({
          content: [
            { type: 'text', text: 'part one' },
            { type: 'server_tool_use', id: 't1', name: 'web_search', input: {} },
          ],
          stop_reason: 'pause_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      })
      .mockReturnValueOnce({
        finalMessage: async () => ({
          content: [{ type: 'text', text: 'part two' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 30, output_tokens: 5 },
        }),
      });

    const res = await completeRaw({ system: 's', prompt: 'p', webSearch: true });

    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(res.text).toBe('part one\npart two');
    expect(res.stopReason).toBe('end_turn');
    expect(res.usage).toEqual({ input: 40, output: 25 });
    // The resume request must re-send the paused assistant content.
    expect(streamMock.mock.calls[1][0].messages).toHaveLength(2);
    expect(streamMock.mock.calls[1][0].messages[1].role).toBe('assistant');
  });

  it('stops resuming after the bound even if it keeps pausing', async () => {
    streamMock.mockReturnValue({
      finalMessage: async () => ({
        content: [{ type: 'text', text: 'x' }],
        stop_reason: 'pause_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    });
    const res = await completeRaw({ system: 's', prompt: 'p', webSearch: true });
    // 1 initial + up to 4 resumes = 5 requests, then give up.
    expect(streamMock).toHaveBeenCalledTimes(5);
    expect(res.stopReason).toBe('pause_turn');
  });
});
