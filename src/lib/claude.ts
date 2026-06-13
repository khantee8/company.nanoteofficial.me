import Anthropic from '@anthropic-ai/sdk';

// Haiku by default to keep agent-run spend low; set CLAUDE_MODEL in Vercel to override
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

function textOf(msg: Anthropic.Messages.Message): string {
  return msg.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export interface CompleteOpts {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  webSearch?: boolean;
  maxSearches?: number;
  /** Remote MCP servers for the Anthropic MCP connector. When set, the request
   *  routes through the beta Messages API and web_search is ignored. */
  mcpServers?: { url: string; name: string; token?: string }[];
}

export interface CompleteResult {
  text: string;
  stopReason: string | null;
  usage: { input: number; output: number };
}

// Server-side tool loops (web_search) cap at ~10 iterations per request and then
// return stop_reason 'pause_turn'; the turn is resumed by re-sending the
// assistant content unchanged (the API detects the trailing server_tool_use and
// continues — do NOT append a "continue" user message). Bound the resumes.
const MAX_PAUSE_RESUMES = 4;

const MCP_BETA = 'mcp-client-2025-11-20';

/** One streamed request (plain or beta) with transient-error retry (429/5xx). */
async function streamOnce(
  params: Anthropic.Messages.MessageStreamParams,
  beta = false,
): Promise<Anthropic.Messages.Message> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const stream = beta
        ? client().beta.messages.stream({ ...(params as object), betas: [MCP_BETA] } as never)
        : client().messages.stream(params);
      return (await stream.finalMessage()) as Anthropic.Messages.Message;
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (status && status < 500 && status !== 429) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}

/** Streamed completion that surfaces stop_reason + usage. Streaming avoids
 *  HTTP timeouts on the large max_tokens an analyst report needs, and
 *  `pause_turn` is resumed so long web_search loops aren't cut off mid-research. */
export async function completeRaw(opts: CompleteOpts): Promise<CompleteResult> {
  const { system, prompt, model = MODEL, maxTokens = 1500, webSearch = false, maxSearches = 5, mcpServers } = opts;
  const useMcp = !!mcpServers && mcpServers.length > 0;

  // MCP connector and web_search are mutually exclusive in this wrapper; MCP wins.
  // web_search_20260209 keeps allowed_callers:['direct'] (Haiku can't do its
  // dynamic filtering otherwise; this wrapper only ever calls it directly).
  const tools: unknown[] | undefined = useMcp
    ? mcpServers!.map((s) => ({ type: 'mcp_toolset', mcp_server_name: s.name }))
    : webSearch
      ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches, allowed_callers: ['direct'] }]
      : undefined;

  const mcp_servers = useMcp
    ? mcpServers!.map((s) => ({ type: 'url', url: s.url, name: s.name, ...(s.token ? { authorization_token: s.token } : {}) }))
    : undefined;

  const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: prompt }];
  const texts: string[] = [];
  let stopReason: string | null = null;
  let input = 0;
  let output = 0;

  // Server-side tool loops (web_search / MCP) cap at ~10 iterations and return
  // stop_reason 'pause_turn'; resume by re-sending the assistant content verbatim.
  for (let resume = 0; resume <= MAX_PAUSE_RESUMES; resume++) {
    const msg = await streamOnce(
      {
        model,
        max_tokens: maxTokens,
        system,
        messages,
        ...(tools ? { tools } : {}),
        ...(mcp_servers ? { mcp_servers } : {}),
      } as unknown as Anthropic.Messages.MessageStreamParams,
      useMcp,
    );
    texts.push(textOf(msg));
    input += msg.usage.input_tokens;
    output += msg.usage.output_tokens;
    stopReason = msg.stop_reason;
    if (msg.stop_reason !== 'pause_turn') break;
    // Resume the paused turn: append the assistant content verbatim and re-request.
    messages.push({ role: 'assistant', content: msg.content });
  }

  return {
    text: texts.filter(Boolean).join('\n').trim(),
    stopReason,
    usage: { input, output },
  };
}

export async function complete(opts: CompleteOpts): Promise<string> {
  return (await completeRaw(opts)).text;
}
