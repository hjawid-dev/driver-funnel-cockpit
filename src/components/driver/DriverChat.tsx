import { useEffect, useRef, useState } from 'react';
import { Bot, Send, UserRound } from 'lucide-react';
import type { Applicant, Gig } from '../../lib/types';
import type { ChatMsg, ChatThread } from '../../lib/chat/types';
import { HELP_BY_ID } from '../../content/help';
import { driverStep, type DriverStep } from '../../lib/driverFlow';
import { driverContext } from '../../lib/chat/context';
import { askAssistant, toTurns } from '../../lib/chat/client';
import { searchHelp } from '../../lib/chat/offline';
import { LIMITS } from '../../lib/chat/guard';
import { addAiAnswer, addDriverMessage, addOfflineAnswer, askForPerson, emptyThread } from '../../lib/chat/threads';
import { formatDateTime } from '../../lib/time';

interface Props {
  applicant: Applicant | null;
  thread: ChatThread | undefined;
  gigs: Gig[];
  now: number;
  onThread: (t: ChatThread) => void;
}

/** Suggested first questions, by where the driver is in the flow. */
const SUGGEST: Partial<Record<DriverStep | 'visitor', string[]>> = {
  visitor: ['Who can drive with you?', 'What does a job pay?', 'How long does applying take?'],
  id: ["I don't have BankID", 'What does a job pay?', 'Do I need my own company?'],
  licence: ['Can I use a digital licence?', 'What does a job pay?'],
  photo: ['What photo works?', 'Can I wear a headscarf in the photo?'],
  extract: ['How do I order the extract?', 'What do you do with my extract?', 'Hur lång tid tar utdraget?'],
  call: ['What happens in the call?', 'Can I move my call later?'],
  decision: ['What happens in the call?', 'I need to move my call'],
  first_gig: ['What should I bring on my first drive?', 'Can a friend come along?'],
  booked: ['What should I bring on my first drive?', 'What if I am running late?'],
  active: ['When do I get paid?', 'Are SL tickets refunded?', 'Can I cancel a job?'],
  closed: ['Why was I not accepted?', 'Can I apply again?'],
};

export function DriverChat({ applicant: a, thread, gigs, now, onThread }: Props) {
  const t = thread ?? emptyThread(a);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const suggestions = SUGGEST[a ? driverStep(a) : 'visitor'] ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [t.messages.length, streaming]);

  async function send(text: string) {
    const q = text.trim().slice(0, LIMITS.questionChars);
    if (!q || busy) return;
    setInput('');
    setNotice(null);
    const withQ = addDriverMessage(t, q, now);
    onThread(withQ);
    if (withQ.status !== 'ai') return; // a person is handling it

    setBusy(true);
    setStreaming('');
    const res = await askAssistant(toTurns(t.messages, q), driverContext(a, gigs, now), setStreaming);
    setBusy(false);
    setStreaming('');
    if (res.mode === 'ai') {
      onThread(addAiAnswer(withQ, res.text, res.sources, res.handover, now));
    } else if (res.mode === 'limited') {
      setNotice(res.message);
    } else {
      const hits = searchHelp(q);
      const text = hits.length
        ? 'The assistant is offline right now. These help articles may answer your question:'
        : "The assistant is offline right now and I couldn't find a matching article. Tap “Talk to a person” and ops replies here.";
      onThread(addOfflineAnswer(withQ, text, hits.map((h) => h.id), now));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <p className="flex items-start gap-1.5 border-b border-lavender bg-card px-4 py-2 text-[11px] leading-snug text-muted">
        <Bot size={14} className="mt-px shrink-0 text-indigo" aria-hidden />
        <span>
          <strong className="text-navy">You're chatting with an AI assistant.</strong> It answers from our help articles and can't decide on applications. Ask
          for a person any time. Demo: don't write real personal details.
        </span>
      </p>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3" aria-live="polite">
        {t.messages.length === 0 && !busy && (
          <div className="space-y-2 pt-2">
            <p className="text-sm font-semibold">Hi{a ? ` ${a.name.split(' ')[0]}` : ''}! What can I help you with?</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-lavender px-3 py-1.5 text-xs font-semibold text-indigo hover:border-indigo">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {t.messages.map((m) => (
          <Message key={m.id} m={m} />
        ))}
        {busy && (
          <Bubble side="left" tone="ai">
            {streaming ? <span className="whitespace-pre-line">{streaming}</span> : <span className="text-muted">Typing…</span>}
          </Bubble>
        )}
        {t.status !== 'ai' && (
          <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
            {t.status === 'waiting' ? 'A person from ops will reply here, usually within 15 minutes.' : 'A person from ops is handling your question.'}
          </p>
        )}
        {notice && <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">{notice}</p>}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-lavender p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="chat-input">
            Your question
          </label>
          <textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            maxLength={LIMITS.questionChars}
            rows={1}
            placeholder={t.status === 'ai' ? 'Ask anything, in any language' : 'Write to ops'}
            className="max-h-24 min-h-10 flex-1 resize-none rounded-xl border border-lavender px-3 py-2 text-sm"
          />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo text-white hover:bg-navy disabled:bg-lavender disabled:text-muted">
            <Send size={16} aria-hidden />
          </button>
        </div>
        {t.status === 'ai' && (
          <button type="button" disabled={busy} onClick={() => onThread(askForPerson(t, now))} className="mt-2 flex items-center gap-1 text-xs font-semibold text-indigo hover:underline disabled:text-muted">
            <UserRound size={13} aria-hidden /> Talk to a person
          </button>
        )}
      </form>
    </div>
  );
}

function Bubble({ side, tone, children }: { side: 'left' | 'right'; tone: 'driver' | 'ai' | 'ops'; children: React.ReactNode }) {
  const cls = { driver: 'bg-indigo text-white', ai: 'bg-card', ops: 'bg-ok-bg' }[tone];
  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${cls} ${side === 'right' ? 'rounded-br-md' : 'rounded-bl-md'}`}>{children}</div>
    </div>
  );
}

function Message({ m }: { m: ChatMsg }) {
  if (m.from === 'note') return <p className="px-4 text-center text-[11px] text-muted">{m.text}</p>;
  if (m.from === 'driver')
    return (
      <Bubble side="right" tone="driver">
        <span className="whitespace-pre-line">{m.text}</span>
      </Bubble>
    );
  return (
    <Bubble side="left" tone={m.from === 'ops' ? 'ops' : 'ai'}>
      <span className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
        {m.from === 'ops' ? (
          <>
            <UserRound size={11} aria-hidden /> {m.by ?? 'Ops'} · ops
          </>
        ) : (
          <>
            <Bot size={11} aria-hidden /> AI assistant{m.offline ? ' · offline' : ''}
          </>
        )}
        <span className="num ml-auto pl-2 font-normal normal-case tracking-normal">{formatDateTime(m.at).split(', ')[1]}</span>
      </span>
      <span className="whitespace-pre-line">{m.text}</span>
      {m.sources && m.sources.length > 0 && (
        <span className="mt-1.5 block space-y-1">
          {m.sources.map((id) =>
            HELP_BY_ID[id] ? (
              <details key={id} className="rounded-lg bg-white px-2 py-1 text-xs">
                <summary className="cursor-pointer font-semibold text-indigo">{m.offline ? '' : 'Source: '}{HELP_BY_ID[id].title}</summary>
                <span className="mt-1 block whitespace-pre-line text-muted">{HELP_BY_ID[id].body}</span>
              </details>
            ) : null,
          )}
        </span>
      )}
    </Bubble>
  );
}
