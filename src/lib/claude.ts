import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

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

/** One streamed request with transient-error retry (429/5xx, exponential backoff). */
async function streamOnce(
  params: Anthropic.Messages.MessageStreamParams,
): Promise<Anthropic.Messages.Message> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client().messages.stream(params).finalMessage();
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
  const { system, prompt, model = MODEL, maxTokens = 1500, webSearch = false, maxSearches = 5 } = opts;
  const tools: Anthropic.Messages.Tool[] | undefined = webSearch
    ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches } as unknown as Anthropic.Messages.Tool]
    : undefined;

  const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: prompt }];
  const texts: string[] = [];
  let stopReason: string | null = null;
  let input = 0;
  let output = 0;

  for (let resume = 0; resume <= MAX_PAUSE_RESUMES; resume++) {
    const msg = await streamOnce({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      ...(tools ? { tools } : {}),
    });
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
