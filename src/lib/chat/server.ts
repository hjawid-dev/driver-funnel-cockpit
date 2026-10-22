import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_STABLE, KNOWN_SOURCES, contextText } from './prompt.js';
import { MetaSplitter } from './meta.js';
import { LIMITS, RateLimiter, sameOrigin, validateChatRequest } from './guard.js';
import type { ChatEvent, OfflineReply } from './types';

/**
 * The chat endpoint (POST /api/chat). Runs on the server only, where the API key lives.
 * The reply streams back as newline-delimited JSON: text deltas, then sources and handover.
 */

/** The cheapest current model: plenty for answering from a fixed set of articles. */
export const CHAT_MODEL = 'claude-haiku-5-5';
const MAX_TOKENS = 1500; // includes the model's short reasoning; answers themselves are a few sentences
const TIMEOUT_MS = 30_000;

/** The part of the SDK client the handler uses, so tests can pass a fake. */
export interface ModelClient {
  stream(params: Anthropic.MessageStreamParams): AsyncIterable<Anthropic.MessageStreamEvent> & {
    finalMessage(): Promise<Anthropic.Message>;
    abort(): void;
  };
}

export interface ChatEnv {
  ANTHROPIC_API_KEY?: string;
  /** Set to "off" to switch the AI off without a deploy of new code (kill switch). */
  CHAT_ENABLED?: string;
}

const FALLBACK_TEXT = "I can't answer that here, so I've passed your question to a person in ops. They usually reply within 15 minutes.";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export function createChatHandler(opts: { env: ChatEnv; client?: ModelClient; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const perIp = new RateLimiter(LIMITS.perIp, LIMITS.windowMs);
  const global = new RateLimiter(LIMITS.globalPerHour, 60 * 60_000);
  let client = opts.client;

  return async function handle(req: Request): Promise<Response> {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    if (!sameOrigin(req.headers.get('origin'), host)) return json({ error: 'Requests must come from the app.' }, 403);

    if (opts.env.CHAT_ENABLED === 'off') return json({ mode: 'offline', reason: 'disabled' } satisfies OfflineReply);
    if (!opts.env.ANTHROPIC_API_KEY && !client) return json({ mode: 'offline', reason: 'not_configured' } satisfies OfflineReply);

    const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown').split(',')[0].trim();
    if (!perIp.take(ip, now())) return json({ error: "You've sent a lot of questions. Wait a few minutes and try again." }, 429);
    if (!global.take('all', now())) return json({ mode: 'offline', reason: 'busy' } satisfies OfflineReply);

    const raw = await req.text();
    if (raw.length > 20_000) return json({ error: 'Request too large.' }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'Invalid JSON.' }, 400);
    }
    const checked = validateChatRequest(body);
    if (!checked.ok) return json({ error: checked.error }, 400);
    const { messages, context } = checked.value;

    client ??= wrap(new Anthropic({ apiKey: opts.env.ANTHROPIC_API_KEY }));
    const stream = client.stream({
      model: CHAT_MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: 'low' },
      system: [
        { type: 'text', text: SYSTEM_STABLE, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: contextText(context) },
      ],
      messages,
    });

    const encoder = new TextEncoder();
    const body$ = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (e: ChatEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
        const timer = setTimeout(() => stream.abort(), TIMEOUT_MS);
        const splitter = new MetaSplitter();
        let shown = '';
        try {
          for await (const ev of stream) {
            if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
              const out = splitter.push(ev.delta.text);
              if (out) {
                shown += out;
                send({ t: 'delta', text: out });
              }
            }
          }
          const final = await stream.finalMessage();
          const { text, meta } = splitter.end(KNOWN_SOURCES);
          if (text) {
            shown += text;
            send({ t: 'delta', text });
          }
          if (final.stop_reason === 'refusal' || !shown.trim()) {
            if (!shown.trim()) send({ t: 'delta', text: FALLBACK_TEXT });
            send({ t: 'done', sources: [], handover: meta.handover ?? 'sensitive' });
          } else {
            send({ t: 'done', sources: meta.sources, handover: meta.handover });
          }
          // Cost and cache check in the logs. Never the conversation itself.
          const u = final.usage;
          console.log(`chat ok in=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} out=${u.output_tokens}`);
        } catch (err) {
          const status = err instanceof Anthropic.APIError ? err.status : undefined;
          console.error(`chat failed status=${status ?? 'none'}`);
          send({ t: 'error', message: 'The assistant is unavailable right now.' });
        } finally {
          clearTimeout(timer);
          controller.close();
        }
      },
    });

    return new Response(body$, {
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
    });
  };
}

function wrap(sdk: Anthropic): ModelClient {
  return { stream: (params) => sdk.messages.stream(params) };
}
