import type { ChatRequest, ChatTurn, DriverContext } from './types';

/**
 * Protection for a public demo that calls a paid model. The spending cap on the API account is
 * the hard limit; these checks keep any single visitor from using it up.
 */
export const LIMITS = {
  questionChars: 500,
  answerChars: 2000,
  turns: 20,
  perIp: 20, // requests per window
  windowMs: 10 * 60_000,
  globalPerHour: 400, // per server instance
};

export type Checked = { ok: true; value: ChatRequest } | { ok: false; error: string };

const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

export function validateChatRequest(body: unknown): Checked {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be a JSON object.' };
  const { messages, context } = body as { messages?: unknown; context?: unknown };
  if (!Array.isArray(messages) || messages.length === 0) return { ok: false, error: 'messages is required.' };
  if (messages.length > LIMITS.turns) return { ok: false, error: 'This conversation is too long. Start a new one.' };

  const turns: ChatTurn[] = [];
  for (const [i, m] of messages.entries()) {
    const { role, content } = (m ?? {}) as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') return { ok: false, error: `messages[${i}].role is invalid.` };
    const max = role === 'user' ? LIMITS.questionChars : LIMITS.answerChars;
    if (!isStr(content, max) || !content.trim()) return { ok: false, error: `messages[${i}] is empty or too long.` };
    if (i > 0 && turns[i - 1].role === role) return { ok: false, error: 'Roles must alternate.' };
    turns.push({ role, content: content.trim() });
  }
  if (turns[0].role !== 'user' || turns[turns.length - 1].role !== 'user') return { ok: false, error: 'The conversation must start and end with the driver.' };

  const ctx: DriverContext = {};
  if (context && typeof context === 'object') {
    const c = context as Record<string, unknown>;
    if (isStr(c.firstName, 40) && c.firstName.trim()) ctx.firstName = c.firstName;
    if (isStr(c.status, 160) && c.status.trim()) ctx.status = c.status;
    if (Array.isArray(c.facts)) ctx.facts = c.facts.filter((f): f is string => isStr(f, 160)).slice(0, 6);
  }
  return { ok: true, value: { messages: turns, context: ctx } };
}

/** Requests must come from the page itself (a speed bump against casual reuse, not a lock). */
export function sameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Sliding-window limit per key, in memory. Resets when the server instance restarts. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  /** Records a hit and returns true when it is allowed. */
  take(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.hits.clear(); // keep memory bounded
    return true;
  }
}
