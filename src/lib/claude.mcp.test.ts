import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Anthropic SDK: capture the params passed to beta.messages.stream.
const betaStream = vi.fn();
const baseStream = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { stream: baseStream };
    beta = { messages: { stream: betaStream } };
  },
}));

import { completeRaw } from './claude';

const finalMessage = (msg: unknown) => ({ finalMessage: async () => msg });
const text = (t: string, stop = 'end_turn') => ({
  content: [{ type: 'text', text: t }], stop_reason: stop, usage: { input_tokens: 1, output_tokens: 2 },
});

beforeEach(() => { betaStream.mockReset(); baseStream.mockReset(); });

describe('completeRaw with mcpServers', () => {
  it('routes through beta.messages.stream with the connector beta + mcp_servers + mcp_toolset', async () => {
    betaStream.mockReturnValueOnce(finalMessage(text('hi')));
    const res = await completeRaw({
      system: 's', prompt: 'p', model: 'claude-sonnet-4-6',
      mcpServers: [{ url: 'https://x/api/mcp', name: 'thai-funds', token: 'secret' }],
    });
    expect(res.text).toBe('hi');
    expect(baseStream).not.toHaveBeenCalled();
    const params = betaStream.mock.calls[0][0];
    expect(params.betas).toContain('mcp-client-2025-11-20');
    expect(params.mcp_servers).toEqual([
      { type: 'url', url: 'https://x/api/mcp', name: 'thai-funds', authorization_token: 'secret' },
    ]);
    expect(params.tools).toEqual([{ type: 'mcp_toolset', mcp_server_name: 'thai-funds' }]);
  });

  it('resumes a pause_turn in the beta path', async () => {
    betaStream
      .mockReturnValueOnce(finalMessage(text('part1', 'pause_turn')))
      .mockReturnValueOnce(finalMessage(text('part2', 'end_turn')));
    const res = await completeRaw({
      system: 's', prompt: 'p',
      mcpServers: [{ url: 'https://x/api/mcp', name: 'tf' }],
    });
    expect(betaStream).toHaveBeenCalledTimes(2);
    expect(res.text).toBe('part1\npart2');
    // the resumed call must still carry the connector wiring, and a tokenless
    // server must NOT emit an authorization_token field
    expect(betaStream.mock.calls[1][0].betas).toContain('mcp-client-2025-11-20');
    expect(betaStream.mock.calls[1][0].mcp_servers).toEqual([
      { type: 'url', url: 'https://x/api/mcp', name: 'tf' },
    ]);
  });

  it('uses the plain (non-beta) path when no mcpServers', async () => {
    baseStream.mockReturnValueOnce(finalMessage(text('plain')));
    const res = await completeRaw({ system: 's', prompt: 'p' });
    expect(res.text).toBe('plain');
    expect(betaStream).not.toHaveBeenCalled();
  });

  it('hybrid: combines web_search AND the MCP toolset in one beta request', async () => {
    betaStream.mockReturnValueOnce(finalMessage(text('hi')));
    await completeRaw({
      system: 's', prompt: 'p', model: 'claude-sonnet-4-6',
      webSearch: true, maxSearches: 6,
      mcpServers: [{ url: 'https://x/api/mcp', name: 'thai-funds', token: 't' }],
    });
    const params = betaStream.mock.calls[0][0];
    expect(params.betas).toContain('mcp-client-2025-11-20');
    expect(params.mcp_servers).toHaveLength(1);
    expect(params.tools).toEqual([
      { type: 'mcp_toolset', mcp_server_name: 'thai-funds' },
      { type: 'web_search_20260209', name: 'web_search', max_uses: 6, allowed_callers: ['direct'] },
    ]);
  });
});
