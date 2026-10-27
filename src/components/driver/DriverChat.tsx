import { useEffect, useRef, useState } from 'react';
import { Bell, Bot, Check, CircleCheck, Send, UserRound } from 'lucide-react';
import type { Applicant, Gig } from '../../lib/types';
import { assisting, currentJob, driverIncidentState, driverStatus, escalate, gotKeys, reportReason, type Job } from '../../lib/liveOps';
import { REASON_LABEL, type PickupReason } from '../../lib/sms';
import { PickupStatus } from './PickupStatus';
import type { ChatMsg, ChatThread } from '../../lib/chat/types';
import { HELP_BY_ID } from '../../content/help';
import { driverStep, type DriverStep } from '../../lib/driverFlow';
import { driverContext } from '../../lib/chat/context';
import { askAssistant, toTurns } from '../../lib/chat/client';
import { searchHelp } from '../../lib/chat/offline';
import { LIMITS } from '../../lib/chat/guard';
import { driverInbox } from '../../lib/automation';
import { actionOptions, applyChatAction, pickupOptions, quickReplies, sameAction, type QuickReply } from '../../lib/chat/selfService';
import {
  addAck,
  addAiAnswer,
  addDriverMessage,
  addOfflineAnswer,
  addSelfService,
  askForPerson,
  chatTimeline,
  emptyThread,
  markSeen,
  resolveProposal,
  unreadCount,
} from '../../lib/chat/threads';
import { formatDateTime } from '../../lib/time';

interface Props {
  applicant: Applicant | null;
  thread: ChatThread | undefined;
  apps: Applicant[];
  gigs: Gig[];
  jobs?: Job[];
  now: number;
  onThread: (t: ChatThread) => void;
  onUpdate: (a: Applicant) => void;
  /** The driver's taps on today's job (Got the keys, Call me now), also from the chat. */
  onJob?: (j: Job, base?: ChatThread) => void;
  /** Ops' switch for automated texts to customers. */
  textsEnabled?: boolean;
  /** Go to the application steps (e.g. to see the first-drive offers). */
  onSteps: () => void;
}

/** The same choices as the job card, minus "something else" (they are already in the chat). */
const CHAT_REASONS: PickupReason[] = ['keys_missing', 'no_contact', 'car_missing', 'damage', 'unsafe'];

/** Suggested first questions, by where the driver is in the flow. */
const SUGGEST: Partial<Record<DriverStep | 'visitor', string[]>> = {
  visitor: ['Who can drive with you?', 'What does a job pay?', 'How long does applying take?'],
  id: ["I don't have BankID", 'What does a job pay?', 'Do I need my own company?'],
  licence: ['Can I use a digital licence?', 'What does a job pay?'],
  photo: ['What photo works?', 'Can I wear a headscarf in the photo?'],
  extract: ['How do I order the extract?', "I've ordered my extract", 'Hur lång tid tar utdraget?'],
  call: ['Book my call for tomorrow morning', 'Do I need my extract for the call?'],
  decision: ['Can I move my call?', 'What happens in the call?'],
  first_gig: ['Which first drive is closest to me?', 'When do I show my extract?'],
  booked: ['What should I bring on my first drive?', 'When do I show my extract?'],
  active: ['When do I get paid?', 'Are SL tickets refunded?', 'Can I cancel a job?'],
  closed: ['Why was I not accepted?', 'Can I apply again?'],
};

export function DriverChat({ applicant: a, thread, apps, gigs, jobs = [], now, onThread, onUpdate, onJob, textsEnabled = true, onSteps }: Props) {
  const t = thread ?? emptyThread(a);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const timeline = chatTimeline(thread, a ? driverInbox(a, now) : []);
  // A stuck pickup the driver says is solved can be confirmed from the chat too.
  const job = a ? currentJob(jobs, a.id, now) : null;
  const options = [...actionOptions(a, apps, gigs, now), ...pickupOptions(job, now)];
  const last = timeline[timeline.length - 1];
  const quick = busy || t.status !== 'ai' ? [] : quickReplies(last, a, options);
  const askedYet = timeline.some((m) => m.from === 'driver');
  const suggestions = !quick.length && !askedYet && !busy ? (SUGGEST[a ? driverStep(a) : 'visitor'] ?? []) : [];
  const unread = unreadCount(timeline, t.seenAt);
  // Stuck at a pickup: while the assistant has it, the chat offers the same answers as the job card.
  const assist = job ? assisting(job, now) : null;
  // A stuck pickup speaks for itself, in one place: the thread's own banner stays out of the way.
  const onPickup = !!job && !!driverIncidentState(job, now) && !['driving', 'delivered'].includes(driverStatus(job, now));
  const until = assist ? new Date(assist.until).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  // While the assistant has the pickup: first what is wrong (the same short list as the job card), then the
  // answers that close it. The AI never picks the reason and never writes the text: the driver does.
  const texted = !!job && (job.texts ?? []).length > 0;
  const callMe = job && onJob ? { label: 'Call me now', run: () => onJob(escalate(job, 'driver', now)) } : null;
  const jobChips =
    !job || !assist || !onJob || busy
      ? []
      : !texted && (!job.problemReason || job.problemReason === 'other')
        ? [...CHAT_REASONS.map((r) => ({ label: REASON_LABEL[r], run: () => onJob(reportReason(job, r, now, textsEnabled)) })), callMe!]
        : [
            { label: 'Got the keys', run: () => onJob(gotKeys(job, now)) },
            { label: 'Still waiting', run: () => onThread(addAck(t, 'Still waiting.', `Thanks for waiting. If it isn't solved by ${until}, a person from ops calls you.`, now)) },
            callMe!,
          ];

  useEffect(() => {
    const list = endRef.current?.parentElement;
    if (list) list.scrollTop = list.scrollHeight;
  }, [timeline.length, streaming]);

  // Opening the chat marks everything as read.
  useEffect(() => {
    if (a && unread > 0) onThread(markSeen(t, now));
  }, [unread]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const context = { ...driverContext(a, gigs, now, jobs), options: options.map(({ id, label }) => ({ id, label })) };
    const res = await askAssistant(toTurns(timeline, q), context, setStreaming);
    setBusy(false);
    setStreaming('');
    if (res.mode === 'ai') {
      const option = res.action ? options.find((o) => o.id === res.action) : undefined;
      onThread(addAiAnswer(withQ, res.text, res.sources, res.handover, now, option));
    } else if (res.mode === 'limited') {
      setNotice(res.message);
    } else {
      const hits = searchHelp(q);
      const reply = hits.length
        ? 'The assistant is offline right now. These help articles may answer your question:'
        : "The assistant is offline right now and I couldn't find a matching article. Tap “Talk to a person” and ops replies here.";
      onThread(addOfflineAnswer(withQ, reply, hits.map((h) => h.id), now));
    }
  }

  function confirm(m: ChatMsg) {
    if (!a || !m.proposal) return;
    const act = m.proposal.action;
    if (act.type === 'pickup_solved') {
      // Checked again: the pickup may have been solved or handed over since the assistant offered it.
      if (!job || !onJob || !pickupOptions(job, now).some((o) => sameAction(o.action, act))) return onThread(resolveProposal(t, m.id, { stale: 'That pickup is already closed.' }, now));
      return onJob(gotKeys(job, now, act.how), resolveProposal(t, m.id, { done: 'Done: ops can see the pickup is solved. Carry on with the drive.' }, now));
    }
    const r = applyChatAction(a, m.proposal.action, apps, gigs, now);
    if (r.ok) {
      onUpdate(r.applicant);
      onThread(resolveProposal(t, m.id, { done: r.done }, now));
    } else {
      onThread(resolveProposal(t, m.id, { stale: r.reason }, now));
    }
  }

  function tap(q: QuickReply) {
    setNotice(null);
    if (q.kind === 'ask') return void send(q.text);
    if (q.kind === 'steps') return onSteps();
    if (q.kind === 'ack') return onThread(addAck(t, q.label, q.reply, now));
    if (!a) return;
    const r = applyChatAction(a, q.option.action, apps, gigs, now);
    if (!r.ok) return setNotice(r.reason);
    onUpdate(r.applicant);
    onThread(addSelfService(t, q.driverText, r.done, q.option.label, now));
  }

  const chips = quick.length ? quick : suggestions.map((s): QuickReply => ({ kind: 'ask', label: s, text: s }));

  return (
    <div className="flex h-full flex-col">
      <p className="flex items-start gap-1.5 border-b border-lavender bg-card px-4 py-2 text-[11px] leading-snug text-muted">
        <Bot size={14} className="mt-px shrink-0 text-indigo" aria-hidden />
        <span>
          <strong className="text-navy">You're chatting with an AI assistant.</strong> It answers from our help articles, can suggest things for you to
          confirm, and can't decide on applications. Ask for a person any time. Demo: don't write real personal details.
        </span>
      </p>

      <div data-guide="inbox" className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3" aria-live="polite">
        {timeline.length === 0 && !busy && <p className="pt-2 text-sm font-semibold">Hi{a ? ` ${a.name.split(' ')[0]}` : ''}! What can I help you with?</p>}
        {timeline.map((m) => (
          <Message key={m.id} m={m} onConfirm={() => confirm(m)} onDecline={() => onThread(resolveProposal(t, m.id, 'declined', now))} />
        ))}
        {busy && (
          <Bubble side="left" tone="ai">
            {streaming ? <span className="whitespace-pre-line">{streaming}</span> : <span className="text-muted">Typing…</span>}
          </Bubble>
        )}
        {onPickup ? (
          <>
            <PickupStatus j={job!} now={now} />
          </>
        ) : t.status !== 'ai' && (
          <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
            {t.status === 'waiting'
              ? t.reason === 'urgent'
                ? 'Ops calls you within 10 minutes. Your waiting time is paid.'
                : 'A person from ops will reply here, usually within 15 minutes.'
              : 'A person from ops is handling your question.'}
          </p>
        )}
        {notice && <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">{notice}</p>}
        <div ref={endRef} />
      </div>

      {jobChips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-lavender px-3 pt-2.5" aria-label="Quick replies">
          {jobChips.map((c, i) => (
            <button
              key={c.label}
              data-guide={c.label === 'Still waiting' ? 'chat-wait' : 'chat-choice'}
              type="button"
              onClick={c.run}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${i === 0 ? 'border-indigo bg-indigo text-white hover:bg-navy' : 'border-lavender text-indigo hover:border-indigo'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-lavender px-3 pt-2.5" aria-label="Quick replies">
          {chips.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => tap(q)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${q.kind === 'action' ? 'border-indigo bg-indigo text-white hover:bg-navy' : 'border-lavender text-indigo hover:border-indigo'}`}
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

      <form
        className="p-3"
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

function Bubble({ side, tone, children }: { side: 'left' | 'right'; tone: 'driver' | 'ai' | 'ops' | 'auto'; children: React.ReactNode }) {
  const cls = { driver: 'bg-indigo text-white', ai: 'bg-card', ops: 'bg-ok-bg', auto: 'border border-lavender bg-white' }[tone];
  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${cls} ${side === 'right' ? 'rounded-br-md' : 'rounded-bl-md'}`}>{children}</div>
    </div>
  );
}

const time = (at: number) => formatDateTime(at).split(', ')[1];

function Message({ m, onConfirm, onDecline }: { m: ChatMsg; onConfirm: () => void; onDecline: () => void }) {
  if (m.from === 'note')
    return m.actionDone ? (
      <p className="mx-auto flex max-w-[90%] items-start justify-center gap-1.5 rounded-lg bg-ok-bg px-3 py-1.5 text-center text-xs text-ok">
        <CircleCheck size={14} className="mt-px shrink-0" aria-hidden /> {m.text}
      </p>
    ) : (
      <p className="px-4 text-center text-[11px] text-muted">{m.text}</p>
    );
  if (m.from === 'driver')
    return (
      <Bubble side="right" tone="driver">
        <span className="whitespace-pre-line">{m.text}</span>
      </Bubble>
    );
  if (m.from === 'auto')
    return (
      <Bubble side="left" tone="auto">
        <span className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
          <Bell size={11} aria-hidden /> Automatic message
          <span className="num ml-auto pl-2 font-normal normal-case tracking-normal">{formatDateTime(m.at)}</span>
        </span>
        <span className="block font-semibold">{m.title}</span>
        {m.text && <span className="mt-0.5 block whitespace-pre-line text-muted">{m.text}</span>}
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
        <span className="num ml-auto pl-2 font-normal normal-case tracking-normal">{time(m.at)}</span>
      </span>
      <span className="whitespace-pre-line">{m.text}</span>
      {m.proposal && (
        <span className="mt-2 block rounded-xl border border-indigo/30 bg-white p-2.5">
          <span className="block text-xs font-semibold text-navy">{m.proposal.label}</span>
          {m.proposal.status === 'open' ? (
            <span className="mt-2 flex gap-1.5">
              <button type="button" onClick={onConfirm} className="flex items-center gap-1 rounded-lg bg-indigo px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy">
                <Check size={13} aria-hidden /> Confirm
              </button>
              <button type="button" onClick={onDecline} className="rounded-lg border border-lavender px-3 py-1.5 text-xs font-semibold text-muted hover:border-indigo">
                No thanks
              </button>
            </span>
          ) : (
            <span className={`mt-1 block text-[11px] font-semibold ${m.proposal.status === 'done' ? 'text-ok' : 'text-muted'}`}>
              {{ done: 'Confirmed', declined: 'Not changed', stale: 'No longer available', open: '' }[m.proposal.status]}
            </span>
          )}
        </span>
      )}
      {m.sources && m.sources.length > 0 && (
        <span className="mt-1.5 block space-y-1">
          {m.sources.map((id) =>
            HELP_BY_ID[id] ? (
              <details key={id} className="rounded-lg bg-white px-2 py-1 text-xs">
                <summary className="cursor-pointer font-semibold text-indigo">
                  {m.offline ? '' : 'Source: '}
                  {HELP_BY_ID[id].title}
                </summary>
                <span className="mt-1 block whitespace-pre-line text-muted">{HELP_BY_ID[id].body}</span>
              </details>
            ) : null,
          )}
        </span>
      )}
    </Bubble>
  );
}
