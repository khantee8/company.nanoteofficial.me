import Anthropic from '@anthropic-ai/sdk';

// Haiku by default to keep agent-run spend low; set CLAUDE_MODEL in Vercel to override
export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MODEL = process.env.CLAUDE_MODEL || DEFAULT_MODEL;

// Output budget for web_search report agents (cyb/mkt/rnd): web_search + the
// bilingual head (findings + TH/EN highlight/flags) share this, so 8000 clipped
// the narrative (mkt/rnd were left as just a preamble). Ceiling — billed on use.
export const WEB_REPORT_MAX_TOKENS = 16000;

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
  /** v1.8 — the model actually used for the call (for cost attribution). */
  model: string;
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

/** v1.12 — the request shape shared by the sync stream path and batch submission. */
export function buildRequestShape(opts: CompleteOpts): { params: Record<string, unknown>; useMcp: boolean } {
  const { system, prompt, model = MODEL, maxTokens = 1500, webSearch = false, maxSearches = 5, mcpServers } = opts;
  const useMcp = !!mcpServers && mcpServers.length > 0;
  // web_search and the MCP connector can be combined (hybrid): the tools array
  // carries an mcp_toolset per server AND/OR the web_search tool. The presence of
  // mcp_servers forces the beta Messages path (useMcp). web_search_20260209 keeps
  // allowed_callers:['direct'] (Haiku can't do its dynamic filtering otherwise).
  const tools: unknown[] = [
    ...(useMcp ? mcpServers!.map((s) => ({ type: 'mcp_toolset', mcp_server_name: s.name })) : []),
    ...(webSearch ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches, allowed_callers: ['direct'] }] : []),
  ];
  const mcp_servers = useMcp
    ? mcpServers!.map((s) => ({ type: 'url', url: s.url, name: s.name, ...(s.token ? { authorization_token: s.token } : {}) }))
    : undefined;
  return {
    useMcp,
    params: {
      model, max_tokens: maxTokens, system,
      messages: [{ role: 'user', content: prompt }] as Anthropic.Messages.MessageParam[],
      ...(tools.length ? { tools } : {}),
      ...(mcp_servers ? { mcp_servers } : {}),
    },
  };
}

/** Streamed completion that surfaces stop_reason + usage. Streaming avoids
 *  HTTP timeouts on the large max_tokens an analyst report needs, and
 *  `pause_turn` is resumed so long web_search loops aren't cut off mid-research. */
export async function completeRaw(opts: CompleteOpts): Promise<CompleteResult> {
  const shape = buildRequestShape(opts);
  const messages = shape.params.messages as Anthropic.Messages.MessageParam[];
  const texts: string[] = [];
  let stopReason: string | null = null;
  let input = 0;
  let output = 0;

  // Server-side tool loops (web_search / MCP) cap at ~10 iterations and return
  // stop_reason 'pause_turn'; resume by re-sending the assistant content verbatim.
  for (let resume = 0; resume <= MAX_PAUSE_RESUMES; resume++) {
    const msg = await streamOnce(
      shape.params as unknown as Anthropic.Messages.MessageStreamParams,
      shape.useMcp,
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
    model: shape.params.model as string,
  };
}

export function completionFromMessage(msg: Anthropic.Messages.Message): CompleteResult {
  return { text: textOf(msg), stopReason: msg.stop_reason, usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens }, model: msg.model };
}

/** Submit a one-request agent batch. MCP shapes go through the beta batches
 *  surface with the connector beta header. Returns the batch id. */
export async function createAgentBatch(customId: string, shape: { params: Record<string, unknown>; useMcp: boolean }): Promise<string> {
  const requests = [{ custom_id: customId, params: shape.params }] as never;
  const batch = shape.useMcp
    ? await client().beta.messages.batches.create({ requests, betas: [MCP_BETA] } as never)
    : await client().messages.batches.create({ requests });
  return (batch as { id: string }).id;
}

export type BatchItemResult =
  | { type: 'succeeded'; message: Anthropic.Messages.Message }
  | { type: 'errored' | 'expired' | 'canceled'; error?: string };

export async function getAgentBatch(batchId: string): Promise<{ status: 'in_progress' } | { status: 'ended'; result: BatchItemResult }> {
  const b = await client().messages.batches.retrieve(batchId);
  if (b.processing_status !== 'ended') return { status: 'in_progress' };
  for await (const item of await client().messages.batches.results(batchId)) {
    const r = item.result as { type: string; message?: unknown; error?: { message?: string } };
    if (r.type === 'succeeded') return { status: 'ended', result: { type: 'succeeded', message: r.message as Anthropic.Messages.Message } };
    return { status: 'ended', result: { type: r.type as 'errored', error: r.error?.message } };
  }
  return { status: 'ended', result: { type: 'errored', error: 'empty batch results' } };
}

export async function complete(opts: CompleteOpts): Promise<string> {
  return (await completeRaw(opts)).text;
}

/** v1.10 — overlay operator run-with-options onto a completeRaw opts object. */
export function applyOverrides<T extends { maxSearches?: number; model?: string }>(
  opts: T, ctx: { overrides?: { maxSearches?: number; model?: string } },
): T {
  const o = ctx.overrides;
  if (!o) return opts;
  return {
    ...opts,
    ...(o.maxSearches !== undefined ? { maxSearches: o.maxSearches } : {}),
    ...(o.model !== undefined ? { model: o.model } : {}),
  };
}
