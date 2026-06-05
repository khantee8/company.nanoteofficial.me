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

/** Streamed completion that surfaces stop_reason + usage. Streaming avoids
 *  HTTP timeouts on the large max_tokens an analyst report needs. */
export async function completeRaw(opts: CompleteOpts): Promise<CompleteResult> {
  const { system, prompt, model = MODEL, maxTokens = 1500, webSearch = false, maxSearches = 5 } = opts;
  const tools: Anthropic.Messages.Tool[] | undefined = webSearch
    ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches } as unknown as Anthropic.Messages.Tool]
    : undefined;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const stream = client().messages.stream({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
        ...(tools ? { tools } : {}),
      });
      const msg = await stream.finalMessage();
      return {
        text: textOf(msg),
        stopReason: msg.stop_reason,
        usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens },
      };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (status && status < 500 && status !== 429) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}

export async function complete(opts: CompleteOpts): Promise<string> {
  return (await completeRaw(opts)).text;
}
