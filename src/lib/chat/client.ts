import type { ChatEvent, ChatMsg, ChatTurn, DriverContext, HandoverReason, OfflineReply } from './types';
import { LIMITS } from './guard';

export type AskResult =
  | { mode: 'ai'; text: string; sources: string[]; handover: HandoverReason | null; action: string | null }
  | { mode: 'offline'; reason: OfflineReply['reason'] | 'error' }
  | { mode: 'limited'; message: string };

/**
 * The conversation as the model sees it: driver and assistant turns, with ops replies, automatic
 * reminders and actions done in the chat folded in as assistant turns, so "yes" and "tomorrow" make sense.
 */
export function toTurns(messages: ChatMsg[], question: string): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    if (m.offline || (m.from === 'note' && !m.actionDone)) continue;
    const role = m.from === 'driver' ? 'user' : 'assistant';
    const content =
      m.from === 'ops'
        ? `(Reply from ${m.by ?? 'ops'}) ${m.text}`
        : m.from === 'auto'
          ? `(Automatic message) ${m.title ?? ''}${m.text ? `: ${m.text}` : ''}`
          : m.from === 'note'
            ? `(Done in the app) ${m.text}`
            : m.text;
    const last = turns[turns.length - 1];
    if (last?.role === role) last.content = `${last.content}\n${content}`.slice(0, role === 'user' ? LIMITS.questionChars : LIMITS.answerChars);
    else turns.push({ role, content: content.slice(0, role === 'user' ? LIMITS.questionChars : LIMITS.answerChars) });
  }
  // The new question goes last. Unanswered driver messages just before it are kept with it.
  const last = turns[turns.length - 1];
  if (last?.role === 'user') last.content = `${last.content}\n${question}`.slice(-LIMITS.questionChars);
  else turns.push({ role: 'user', content: question });
  // Keep the most recent turns within the limit. The conversation must start with the driver, so
  // when it starts with an automatic message, a short opening line keeps that message in view.
  const recent = turns.slice(-(LIMITS.turns - 1));
  if (recent[0]?.role !== 'user') recent.unshift({ role: 'user', content: '(Opened the chat)' });
  return recent;
}

/** Ask the assistant; `onText` receives the answer as it streams in. */
export async function askAssistant(turns: ChatTurn[], context: DriverContext, onText: (soFar: string) => void, signal?: AbortSignal): Promise<AskResult> {
  let res: Response;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: turns, context }),
      signal,
    });
  } catch {
    return { mode: 'offline', reason: 'error' };
  }
  if (res.status === 429) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { mode: 'limited', message: body.error ?? 'Too many questions. Try again in a few minutes.' };
  }
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !res.body) return { mode: 'offline', reason: 'error' };
  if (type.includes('application/json')) {
    const body = (await res.json().catch(() => null)) as OfflineReply | null;
    return { mode: 'offline', reason: body?.mode === 'offline' ? body.reason : 'error' };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  let done: Extract<ChatEvent, { t: 'done' }> | null = null;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const ev = JSON.parse(line) as ChatEvent;
      if (ev.t === 'delta') {
        text += ev.text;
        onText(text);
      } else if (ev.t === 'done') done = ev;
      else if (ev.t === 'error') return { mode: 'offline', reason: 'error' };
    }
  }
  if (!done || !text.trim()) return { mode: 'offline', reason: 'error' };
  return { mode: 'ai', text: text.trim(), sources: done.sources, handover: done.handover, action: done.action ?? null };
}
