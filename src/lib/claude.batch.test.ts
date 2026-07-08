import { describe, it, expect, vi, beforeEach } from 'vitest';

// v1.12 Task 6 — getAgentBatch(batchId, useMcp) must retrieve/read a
// beta-created (MCP) batch through the SAME beta surface it was created on;
// the plain (non-beta) surface 404s on a beta batch id. Mock the SDK client
// (same pattern as claude.mcp.test.ts) to assert the routing.
const betaRetrieve = vi.fn();
const betaResults = vi.fn();
const baseRetrieve = vi.fn();
const baseResults = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { batches: { retrieve: baseRetrieve, results: baseResults } };
    beta = { messages: { batches: { retrieve: betaRetrieve, results: betaResults } } };
  },
}));

import { buildRequestShape, getAgentBatch } from './claude';

beforeEach(() => {
  betaRetrieve.mockReset();
  betaResults.mockReset();
  baseRetrieve.mockReset();
  baseResults.mockReset();
});

describe('buildRequestShape', () => {
  it('plain web-search shape: tools carry web_search with max_uses', () => {
    const { params, useMcp } = buildRequestShape({ system: 's', prompt: 'p', maxTokens: 100, webSearch: true, maxSearches: 2 });
    expect(useMcp).toBe(false);
    expect(params).toMatchObject({
      max_tokens: 100, system: 's',
      messages: [{ role: 'user', content: 'p' }],
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 2, allowed_callers: ['direct'] }],
    });
    expect(params).not.toHaveProperty('mcp_servers');
  });

  it('MCP shape: mcp_toolset + mcp_servers + useMcp flag', () => {
    const { params, useMcp } = buildRequestShape({ system: 's', prompt: 'p', mcpServers: [{ url: 'https://m/api', name: 'thai-funds', token: 't' }] });
    expect(useMcp).toBe(true);
    expect(params).toMatchObject({
      tools: [{ type: 'mcp_toolset', mcp_server_name: 'thai-funds' }],
      mcp_servers: [{ type: 'url', url: 'https://m/api', name: 'thai-funds', authorization_token: 't' }],
    });
  });

  it('no tools → no tools key', () => {
    const { params } = buildRequestShape({ system: 's', prompt: 'p' });
    expect(params).not.toHaveProperty('tools');
  });
});

describe('getAgentBatch useMcp routing', () => {
  async function* succeeded() {
    yield {
      result: {
        type: 'succeeded',
        message: { stop_reason: 'end_turn', content: [], usage: { input_tokens: 1, output_tokens: 1 }, model: 'm' },
      },
    };
  }

  it('useMcp=true retrieves + reads results via the beta batches surface with the MCP beta header', async () => {
    betaRetrieve.mockResolvedValueOnce({ processing_status: 'ended' });
    betaResults.mockResolvedValueOnce(succeeded());

    const res = await getAgentBatch('b1', true);

    expect(res.status).toBe('ended');
    expect(betaRetrieve).toHaveBeenCalledWith('b1', { betas: ['mcp-client-2025-11-20'] });
    expect(betaResults).toHaveBeenCalledWith('b1', { betas: ['mcp-client-2025-11-20'] });
    expect(baseRetrieve).not.toHaveBeenCalled();
    expect(baseResults).not.toHaveBeenCalled();
  });

  it('useMcp=false (default) uses the plain, non-beta batches surface', async () => {
    baseRetrieve.mockResolvedValueOnce({ processing_status: 'in_progress' });

    const res = await getAgentBatch('b2');

    expect(res.status).toBe('in_progress');
    expect(baseRetrieve).toHaveBeenCalledWith('b2');
    expect(betaRetrieve).not.toHaveBeenCalled();
    expect(betaResults).not.toHaveBeenCalled();
  });
});
