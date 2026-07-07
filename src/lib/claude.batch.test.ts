import { describe, it, expect } from 'vitest';
import { buildRequestShape } from './claude';

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
