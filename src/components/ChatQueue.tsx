import { useState } from 'react';
import { Bot, CircleCheck, FilePlus2, MousePointerClick, Smartphone, UserRound } from 'lucide-react';
import type { ChatThread } from '../lib/chat/types';
import { HANDOVER_LABEL } from '../lib/chat/types';
import { AI_TARGET, CHAT_SLA_MS, backToAi, slaFor, chatStats, closeGap, contentGaps, opsReply, waitingThreads } from '../lib/chat/threads';
import { HELP_BY_ID } from '../content/help';
import { REVIEWER } from '../lib/types';
import { ago, formatDateTime, formatDuration } from '../lib/time';
import { SectionHeader } from './ui';

interface Props {
  threads: ChatThread[];
  now: number;
  onThread: (t: ChatThread) => void;
  onViewChat: (applicantId: string | null) => void;
}

/**
 * Driver questions: what the AI assistant handed over, the share it answers on its own, and the
 * questions the help articles don't cover yet (what ops writes next).
 */
export function ChatQueue({ threads, now, onThread, onViewChat }: Props) {
  const waiting = waitingThreads(threads);
  const [openId, setOpenId] = useState<string | null>(waiting[0]?.id ?? null);
  const open = threads.find((t) => t.id === openId) ?? null;
  const stats = chatStats(threads, now);
  const gaps = contentGaps(threads);
  const recent = [...threads]
    .filter((t) => t.status !== 'waiting' && t.messages.length)
    .sort((a, b) => b.messages.at(-1)!.at - a.messages.at(-1)!.at)
    .slice(0, 8);

  return (
    <div className="space-y-6 pt-4">
      <Stats stats={stats} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section>
          <SectionHeader title={`Waiting for a person · ${waiting.length}`} aside={`Target: reply within ${formatDuration(CHAT_SLA_MS)}, 5 min when urgent`} />
          {waiting.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-card p-4 text-sm text-muted">
              <CircleCheck size={18} className="text-ok" aria-hidden /> Nobody is waiting. The assistant is handling the rest.
            </p>
          ) : (
            <ul className="space-y-2">
              {waiting.map((t) => (
                <ThreadRow key={t.id} t={t} now={now} active={t.id === openId} onOpen={() => setOpenId(t.id)} />
              ))}
            </ul>
          )}
          {recent.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Recent conversations (for spot checks)</h3>
              <ul className="space-y-1.5">
                {recent.map((t) => (
                  <ThreadRow key={t.id} t={t} now={now} active={t.id === openId} onOpen={() => setOpenId(t.id)} compact />
                ))}
              </ul>
            </>
          )}
        </section>

        <section aria-label="Conversation">
          {open ? (
            <ThreadView key={open.id} t={open} now={now} onThread={onThread} onViewChat={onViewChat} />
          ) : (
            <p className="rounded-xl border border-dashed border-lavender p-6 text-center text-sm text-muted">Pick a conversation to read it.</p>
          )}
        </section>
      </div>

      <section>
        <SectionHeader title={`Help content gaps · ${gaps.length}`} aside="Questions the help articles didn't cover. Write or update an article, then mark it covered." />
        {gaps.length === 0 ? (
          <p className="rounded-xl bg-card p-4 text-sm text-muted">No open gaps.</p>
        ) : (
          <ul className="divide-y divide-lavender rounded-xl border border-lavender">
            {gaps.map((g) => (
              <li key={g.msgId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">“{g.question}”</span>
                  <span className="block text-xs text-muted">
                    {g.name} · {ago(g.at, now)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const t = threads.find((x) => x.id === g.threadId);
                    if (t) onThread(closeGap(t, g.msgId));
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-lavender px-3 py-1.5 text-xs font-semibold text-indigo hover:border-indigo"
                >
                  <FilePlus2 size={14} aria-hidden /> Article added
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stats({ stats }: { stats: ReturnType<typeof chatStats> }) {
  const rate = stats.rate === null ? null : Math.round(stats.rate);
  const tone = rate === null ? 'text-muted' : rate >= AI_TARGET ? 'text-ok' : rate >= AI_TARGET - 10 ? 'text-warn' : 'text-bad';
  const reasons = Object.entries(stats.byReason) as [keyof typeof HANDOVER_LABEL, number][];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <article className="rounded-xl border border-lavender p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Bot size={15} className="text-indigo" aria-hidden /> Answered by AI
        </h3>
        <p className={`num mt-1 text-2xl font-semibold ${tone}`}>{rate === null ? '–' : `${rate}%`}</p>
        <p className="text-xs text-muted">
          Target {AI_TARGET}% · {stats.byAi} of {stats.questions} questions, last 7 days
        </p>
      </article>
      <article className="rounded-xl border border-lavender p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <UserRound size={15} className="text-indigo" aria-hidden /> Handed to a person
        </h3>
        <p className="num mt-1 text-2xl font-semibold">{stats.handedOver}</p>
        <p className="text-xs text-muted">{reasons.length ? reasons.map(([r, n]) => `${HANDOVER_LABEL[r]} ${n}`).join(' · ') : 'None this week'}</p>
      </article>
      <article className="rounded-xl border border-lavender p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <MousePointerClick size={15} className="text-indigo" aria-hidden /> Done in the chat
        </h3>
        <p className="num mt-1 text-2xl font-semibold">{stats.selfService}</p>
        <p className="text-xs text-muted">Calls booked or moved, extracts marked, first drives picked, reminders. Confirmed by the driver, last 7 days</p>
      </article>
      <article className="rounded-xl border border-lavender p-4">
        <h3 className="text-sm font-semibold">Ops reply time</h3>
        <p className="num mt-1 text-2xl font-semibold">{stats.medianOpsReplyMin === null ? '–' : `${Math.round(stats.medianOpsReplyMin)} min`}</p>
        <p className="text-xs text-muted">Median, target under 15 min</p>
      </article>
    </div>
  );
}

function ThreadRow({ t, now, active, onOpen, compact }: { t: ChatThread; now: number; active: boolean; onOpen: () => void; compact?: boolean }) {
  const lastQ = [...t.messages].reverse().find((m) => m.from === 'driver');
  const waited = t.waitingSince ? now - t.waitingSince : 0;
  const urgent = t.status === 'waiting' && t.reason === 'urgent';
  const late = t.status === 'waiting' && waited > slaFor(t);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active}
        className={`w-full rounded-xl border px-3 text-left ${compact ? 'py-2' : 'py-3'} ${active ? 'border-indigo bg-lavender/40' : urgent ? 'border-bad/60 hover:border-bad' : 'border-lavender hover:border-indigo'} ${late || urgent ? 'bg-bad-bg/30' : ''}`}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold">{t.name}</span>
          {t.status === 'waiting' ? (
            <span className={`num shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${late ? 'bg-bad-bg text-bad' : 'bg-warn-bg text-warn'}`}>
              {late ? `Overdue ${formatDuration(waited)}` : `Waiting ${formatDuration(waited)}`}
            </span>
          ) : (
            <span className="num shrink-0 text-xs text-muted">{ago(t.messages.at(-1)!.at, now)}</span>
          )}
        </span>
        {lastQ && <span className="mt-0.5 block truncate text-xs text-muted">“{lastQ.text}”</span>}
        {!compact && t.reason && (
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${urgent ? 'bg-bad text-white' : 'bg-card text-navy'}`}>
            {urgent ? 'Urgent · problem on a drive now' : HANDOVER_LABEL[t.reason]}
          </span>
        )}
      </button>
    </li>
  );
}

function ThreadView({ t, now, onThread, onViewChat }: { t: ChatThread; now: number; onThread: (t: ChatThread) => void; onViewChat: (id: string | null) => void }) {
  const [reply, setReply] = useState('');
  return (
    <div className="flex flex-col rounded-xl border border-lavender">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-lavender px-4 py-3">
        <div>
          <p className="font-semibold">{t.name}</p>
          <p className="text-xs text-muted">
            {t.status === 'waiting' ? `Waiting for a person · ${t.reason ? HANDOVER_LABEL[t.reason] : ''}` : t.status === 'ops' ? 'Handled by ops' : 'The assistant is answering'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onViewChat(t.applicantId)}
          className="flex items-center gap-1.5 rounded-lg border border-lavender px-3 py-1.5 text-xs font-semibold text-indigo hover:border-indigo"
        >
          <Smartphone size={14} aria-hidden /> Driver's view
        </button>
      </div>
      <ol className="max-h-[420px] space-y-2 overflow-y-auto px-4 py-3">
        {t.messages.map((m) => (
          <li key={m.id} className={m.from === 'note' ? `text-center text-[11px] ${m.actionDone ? 'font-semibold text-ok' : 'text-muted'}` : 'text-sm'}>
            {m.from === 'note' ? (
              m.actionDone ? `✓ Done in the chat: ${m.actionDone}` : m.text
            ) : (
              <div className={`rounded-xl px-3 py-2 ${m.from === 'driver' ? 'bg-card' : m.from === 'ops' ? 'bg-ok-bg' : 'border border-lavender'}`}>
                <p className="mb-0.5 flex justify-between gap-2 text-[11px] font-semibold text-muted">
                  <span>
                    {m.from === 'driver' ? 'Driver' : m.from === 'ops' ? `${m.by ?? 'Ops'} (ops)` : `AI assistant${m.offline ? ' (offline)' : ''}`}
                    {m.handover && <span className="ml-1.5 rounded-full bg-warn-bg px-1.5 text-warn">Handed over: {HANDOVER_LABEL[m.handover]}</span>}
                  </span>
                  <span className="num font-normal">{formatDateTime(m.at)}</span>
                </p>
                <p className="whitespace-pre-line">{m.text}</p>
                {m.proposal && (
                  <p className="mt-1 text-[11px] font-semibold text-indigo">
                    Proposed: {m.proposal.label} · {{ open: 'waiting for the driver', done: 'confirmed', declined: 'declined', stale: 'no longer available' }[m.proposal.status]}
                  </p>
                )}
                {m.sources && m.sources.length > 0 && (
                  <p className="mt-1 text-[11px] text-muted">Sources: {m.sources.map((s) => HELP_BY_ID[s]?.title ?? s).join(' · ')}</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      <form
        className="border-t border-lavender p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!reply.trim()) return;
          onThread(opsReply(t, reply.trim(), REVIEWER, now));
          setReply('');
        }}
      >
        <label htmlFor="ops-reply" className="sr-only">
          Reply to {t.name}
        </label>
        <textarea
          id="ops-reply"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={2}
          placeholder={`Reply to ${t.name.split(' ')[0]} as ${REVIEWER}`}
          className="w-full resize-none rounded-lg border border-lavender px-3 py-2 text-sm"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="submit" disabled={!reply.trim()} className="rounded-lg bg-indigo px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy disabled:bg-lavender disabled:text-muted">
            Send reply
          </button>
          {t.status !== 'ai' && (
            <button type="button" onClick={() => onThread(backToAi(t, now))} className="rounded-lg border border-lavender px-3 py-1.5 text-sm font-semibold text-indigo hover:border-indigo">
              Done, hand back to the assistant
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
