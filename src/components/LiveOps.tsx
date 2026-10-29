import { useEffect, useState, type ReactNode } from 'react';
import { Bot, Check, CircleCheck, Copy, MessageSquare, PhoneCall, Smartphone, TriangleAlert, Truck } from 'lucide-react';
import {
  pickupReadinessErrors, recordOwnError, agreeDeliveryDeadline, bookReplacement,
  assistantLog,
  assisting,
  CAUSE_LABEL,
  causeFromReason,
  cancelPayFor,
  ASSIST_MS,
  CHECK_24_MS,
  CHECK_60_MS,
  closeIncident,
  confirmByPhone,
  contactReplies,
  customerUpdate,
  driverStatus,
  escalate,
  ESCALATE_BEFORE_DECIDE_MS,
  ESCALATION_LABEL,
  escalation,
  incidentClock,
  jobAlert,
  markStep,
  NO_KEYS_ASSIST_MS,
  needsConfirmation,
  OUTCOME_LABEL,
  PLAYBOOK,
  pickupChecks,
  problemSummary,
  REPLY_WAIT_24_MS,
  REPLY_WAIT_60_MS,
  setOutcome,
  tellAccountOwner,
  type Check as PickupCheck,
  type IncidentCause,
  type Job,
  type Outcome,
  type StepKey,
} from '../lib/liveOps';
import { byOpsPriority, currentStep, OPS_GROUP, OPS_STATE_LABEL, opsState, type OpsGroup, type OpsState } from '../lib/opsState';
import { formatDateTime, formatDuration } from '../lib/time';
import type { ChatThread } from '../lib/chat/types';
import { ChatQueue } from './ChatQueue';
import { CollapsibleSection, Proposed } from './ui';
import { InfoTip } from './InfoTip';

/** What the main area shows: a pickup, or the driver questions a person must answer. */
export type LiveSelection = string | 'questions' | null;

interface Props {
  jobs: Job[];
  now: number;
  onJob: (j: Job, message: string) => void;
  onViewChat: (driverId: string | null) => void;
  selected: LiveSelection;
  onSelect: (s: LiveSelection) => void;
  threads: ChatThread[];
  waitingQuestions: number;
  onThread: (t: ChatThread) => void;
  /** Presentation mode on the fix for Part 1: open the prevention too. */
  focus?: 'playbook' | null;
}

const localInputTime = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const hm = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const firstName = (j: Job) => j.driverName.split(' ')[0];
const dayLabel = (ts: number, now: number) => { const day = (t: number) => { const d = new Date(t); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); }; const diff = (day(ts) - day(now)) / 86400000; return diff === 1 ? 'tmrw' : diff === -1 ? 'ystd' : new Date(ts).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); };

const STATE_STYLE: Record<OpsState, string> = {
  needs_person: 'bg-bad text-white',
  to_close: 'bg-warn-bg text-warn',
  issue: 'bg-lavender text-indigo',
  check_due: 'bg-warn-bg text-warn',
  upcoming: 'border border-lavender bg-white text-muted',
  at_pickup: 'bg-lavender text-navy',
  on_the_way: 'bg-indigo text-white',
  // Closed without delivery (e.g. the customer moved or cancelled): neutral, never the green of a delivery.
  resolved: 'bg-card text-navy ring-1 ring-inset ring-muted/30',
  delivered: 'bg-ok-bg text-ok',
};

export function StateChip({ state, label }: { state: OpsState; label?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATE_STYLE[state]}`}>{label ?? OPS_STATE_LABEL[state]}</span>;
}

const GROUP_LABEL: Record<OpsGroup, string> = { attention: 'Needs attention', routine: 'On track', done: 'Done' };

/** Live Ops: exceptions first in a short list; the selected pickup in the main area, with the step to do now. */
export function LiveOps({ jobs, now, onJob, onViewChat, selected, onSelect, threads, waitingQuestions, onThread, focus = null }: Props) {
  const [lastPickup, setLastPickup] = useState<string | null>(selected === 'questions' ? null : selected);
  const ordered = byOpsPriority(jobs, now);
  const job = ordered.find((j) => j.id === selected) ?? (selected === 'questions' ? null : ordered[0]) ?? null;
  const shownId = selected === 'questions' ? 'questions' : (job?.id ?? null);
  // Pin the pickup shown by default, so it stays open when its state (and place in the list) changes.
  useEffect(() => {
    if (selected === null && job) onSelect(job.id);
    if (selected && selected !== 'questions') setLastPickup(selected);
  }, [selected, job, onSelect]);
  // On a narrow screen the detail sits below the list: bring it into view.
  const pick = (s: LiveSelection) => {
    onSelect(s);
    if (window.matchMedia('(max-width: 1023px)').matches) setTimeout(() => document.getElementById('live-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const groups = (['attention', 'routine', 'done'] as OpsGroup[]).map((g) => ({ g, jobs: ordered.filter((j) => OPS_GROUP[opsState(j, now)] === g) }));

  return (
    <div className="space-y-5">
      <nav aria-label="Live Ops views" className="flex gap-1 border-b border-lavender">
        <button type="button" aria-pressed={shownId !== 'questions'} onClick={() => onSelect(ordered.find(j => j.id === lastPickup)?.id ?? ordered[0]?.id ?? null)} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${shownId !== 'questions' ? 'border-indigo text-indigo' : 'border-transparent text-muted hover:text-navy'}`}>
          <Truck size={17} aria-hidden /> Pickups
          <span className="num rounded-full bg-card px-2 py-0.5 text-xs text-muted">{jobs.length}</span>
        </button>
        <button type="button" aria-pressed={shownId === 'questions'} onClick={() => onSelect('questions')} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${shownId === 'questions' ? 'border-indigo text-indigo' : 'border-transparent text-muted hover:text-navy'}`}>
          <MessageSquare size={17} aria-hidden /> Driver questions
          <span className={`num rounded-full px-2 py-0.5 text-xs ${waitingQuestions ? 'bg-indigo text-white' : 'bg-card text-muted'}`}>{waitingQuestions}<span className="sr-only"> waiting</span></span>
        </button>
      </nav>

      {shownId === 'questions' ? (
        <section id="live-detail" aria-labelledby="questions-title" className="scroll-mt-4">
          <h2 id="questions-title" className="text-lg font-bold">Driver questions</h2>
          <p className="text-sm text-muted">Questions the AI assistant handed over to Ops. Choose a conversation to read and reply.</p>
          <ChatQueue threads={threads} now={now} onThread={onThread} onViewChat={onViewChat} />
        </section>
      ) : <div className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <nav aria-label="Pickups" className="space-y-4 lg:sticky lg:top-4">
        {groups.map(({ g, jobs: js }) =>
          js.length === 0 && g !== 'attention' ? null : (
            <section key={g}>
              <h2 className={`mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] ${g === 'attention' && js.length ? 'text-bad' : 'text-muted'}`}>
                {GROUP_LABEL[g]} · <span className="num">{js.length}</span>
              </h2>
              {js.length === 0 ? (
                <p className="flex items-center gap-1.5 rounded-lg bg-card px-3 py-2 text-sm text-muted">
                  <CircleCheck size={15} className="text-ok" aria-hidden /> Nothing right now
                </p>
              ) : (
                <ul className="space-y-1">
                  {js.map((j) => {
                    const s = opsState(j, now);
                    const on = shownId === j.id;
                    return (
                      <li key={j.id}>
                        <button
                          type="button" data-job-row={j.id}
                          onClick={() => pick(j.id)}
                          aria-current={on ? 'true' : undefined}
                          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm ${on ? 'border-indigo bg-lavender/40' : 'border-transparent hover:bg-card/70'}`}
                        >
                          <span className="num w-11 shrink-0 text-xs font-semibold">
                            {hm(j.pickupAt)}
                            {new Date(j.pickupAt).toDateString() !== new Date(now).toDateString() && <span className="block font-normal text-muted">{dayLabel(j.pickupAt, now)}</span>}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{j.driverName}</span>
                            <span className="block truncate text-xs text-muted">
                              {j.from.split(', ').at(-1)} → {j.to.split(', ').at(-1)}
                            </span>
                          </span>
                          <StateChip state={s} label={j.unassigned ? 'Needs driver' : undefined} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ),
        )}
      </nav>

      <div id="live-detail" className="min-w-0 scroll-mt-4">
        {job ? (
          <JobDetail key={job.id} j={job} now={now} onJob={onJob} onViewChat={onViewChat} focus={focus} />
        ) : (
          <p className="rounded-xl bg-card p-6 text-sm text-muted">No pickups in the next 24 hours.</p>
        )}
      </div>
      </div>}
    </div>
  );
}

// ---------- The selected pickup ----------

function JobDetail({ j, now, onJob, onViewChat, focus }: { j: Job; now: number; onJob: Props['onJob']; onViewChat: Props['onViewChat']; focus: Props['focus'] }) {
  const s = opsState(j, now);
  const incident = s === 'needs_person' || s === 'to_close';
  const closed = j.incident?.closedAt !== undefined && j.incident.closedAt <= now;
  const title = j.unassigned ? 'Driver assignment needed' : now > j.deadline && !j.deliveredAt && !closed ? 'Delivery status needed' : incident
    ? j.incident?.outcome
      ? OUTCOME_LABEL[j.incident.outcome.type]
      : jobAlert(j, now)?.kind === 'not_arrived'
        ? 'Not checked in'
        : 'Stuck at the pickup'
    : s === 'issue'
      ? 'Issue reported at the pickup'
      : OPS_STATE_LABEL[s];
  const problem = problemSummary(j, now);

  return (
    <article data-job-id={j.id} data-demo-target="job-detail" className={`rounded-2xl border bg-white ${s === 'needs_person' ? 'border-bad/40' : 'border-lavender'}`}>
      <header className={`flex flex-wrap items-start gap-3 rounded-t-2xl border-b px-4 py-3 sm:px-5 ${s === 'needs_person' ? 'border-bad/20 bg-bad-bg/40' : 'border-lavender'}`}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StateChip state={s} />
            {j.solutionExample && <span className="rounded bg-indigo px-1.5 text-xs font-semibold text-white">Solution example · from arrival</span>}
            {j.pilot && <span className="rounded bg-lavender px-1.5 py-0.5 text-xs font-semibold text-navy">Pilot customer</span>}
            {j.firstDrive && <span className="rounded bg-ok-bg px-1.5 py-0.5 text-xs font-semibold text-ok">First drive</span>}
            {j.newSite && <span className="rounded bg-warn-bg px-1.5 py-0.5 text-xs font-semibold text-warn">New site</span>}
          </div>
          <h2 className="mt-1 text-lg font-bold leading-tight">
            {j.driverName}: {title.charAt(0).toLowerCase() + title.slice(1)}
          </h2>
          <p className="text-xs text-muted">
            <span className="num">{j.id}</span> · {j.from} → {j.to}
          </p>
          {incident && problem.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-bad">
              <TriangleAlert size={15} aria-hidden />
              {problem.map((p, i) => (
                <span key={p} className="whitespace-nowrap">
                  {i > 0 && <span className="mr-1.5 font-normal text-bad/50">·</span>}
                  {p}
                </span>
              ))}
            </p>
          )}
        </div>
        <button type="button" disabled={!!j.unassigned} onClick={() => onViewChat(j.driverId)} className="flex items-center gap-1 rounded-md border border-lavender bg-white px-2 py-1 text-xs font-semibold text-indigo hover:border-indigo">
          <Smartphone size={13} aria-hidden /> Driver's chat
        </button>
      </header>

      <div className="space-y-5 px-4 py-4 sm:px-5">
        <Facts j={j} />
        {j.unassigned && <p className="rounded-lg bg-warn-bg p-3 text-sm font-semibold">Next step: Owner Hjalmar arranges a replacement driver. The customer transport remains open; release is not confirmed reassignment.</p>}
        {j.incident?.nextCustomerUpdateAt && !closed && !j.incident.outcome && <p className={`rounded-lg p-3 text-sm ${now >= j.incident.nextCustomerUpdateAt ? 'bg-bad-bg text-bad' : 'bg-card text-muted'}`}>Customer update {now >= j.incident.nextCustomerUpdateAt ? 'overdue' : 'due'} at {hm(j.incident.nextCustomerUpdateAt)} · owner Hjalmar. Log a new update in the playbook.</p>}
        {j.deliveredAt && j.deliveredAt <= now && <section className="rounded-lg bg-card p-3 text-sm"><p className="font-semibold">Customer feedback: {j.customerSatisfied === undefined ? 'not yet collected' : j.customerSatisfied ? 'satisfied' : 'follow-up needed'}</p><div className="mt-2 flex gap-2"><button type="button" onClick={() => onJob({ ...j, customerSatisfied: true }, 'Customer feedback logged: satisfied (demo).')} className={BTN_SM}>Log satisfied</button><button type="button" onClick={() => onJob({ ...j, customerSatisfied: false }, 'Customer feedback logged: follow-up needed (demo).')} className={BTN_SM}>Log follow-up needed</button></div></section>}
        {now > j.deadline && !j.deliveredAt && !closed && !j.incident && j.departedAt !== undefined && j.departedAt <= now ? <p className="rounded-lg bg-warn-bg p-3 text-sm">Delivery is overdue. Owner Hjalmar contacts the driver to confirm the actual status. Use the driver's view to record departure/delivery; a booking is not activation.</p> : incident ? (
          <IncidentWork j={j} now={now} onJob={onJob} focus={focus} />
        ) : s === 'issue' ? (
          <AssistWork j={j} now={now} onJob={onJob} />
        ) : closed ? (
          <Resolution j={j} now={now} onJob={onJob} />
        ) : (
          <PrePickupCheck j={j} now={now} onJob={onJob} />
        )}
      </div>
    </article>
  );
}

function Facts({ j }: { j: Job }) {
  const main: [string, ReactNode][] = [
    ['Agreed pickup', <span className="num">{hm(j.pickupAt)}</span>],
    ['Delivery deadline', <span className="num">{hm(j.deadline)}</span>],
    [
      'Distance',
      <span className="num">
        {j.km} km · {j.driveMin} min
      </span>,
    ],
    ['Keys', j.keyLocation],
  ];
  const more: [string, ReactNode][] = [
    ['Customer', `${j.customer}${j.pilot ? ' (pilot)' : ''}`],
    [
      'Pickup contact',
      <span>
        {j.contact.role} <span className="num block whitespace-nowrap text-muted">{j.contact.phone}</span>
      </span>,
    ],
    [
      'Backup contact',
      <span>
        {j.backup.role} <span className="num block whitespace-nowrap text-muted">{j.backup.phone}</span>
      </span>,
    ],
    [
      'Price · reward',
      <span className="num">
        {j.price} · {j.reward} SEK
      </span>,
    ],
  ];
  const grid = (rows: [string, ReactNode][]) => (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="break-words font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div>
      {grid(main)}
      <details className="group mt-1.5">
        <summary className="cursor-pointer list-none text-xs font-semibold text-indigo hover:text-navy [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
          <span className="group-open:hidden">Customer, contacts and price</span>
          <span className="hidden group-open:inline">Hide details</span>
        </summary>
        <div className="mt-2">{grid(more)}</div>
      </details>
    </div>
  );
}

// ---------- An incident with a person: owner, time pressure, the step to do now ----------

function IncidentWork({ j, now, onJob, focus }: { j: Job; now: number; onJob: Props['onJob']; focus: Props['focus'] }) {
  const c = incidentClock(j, now);
  const steps = j.incident?.steps ?? {};
  const next = j.pilot && j.incident?.steps.customer && !j.incident.accountOwnerAt && !j.incident.outcome ? PLAYBOOK.find(s => s.key === 'customer')! : currentStep(j, now);
  const nextKey = next?.key ?? null;
  // null follows the step to do now; 'none' means the presenter folded it away.
  const [openKey, setOpenKey] = useState<StepKey | 'none' | null>(null);
  const shown = openKey === null ? nextKey : openKey === 'none' ? null : openKey;
  const act: Props['onJob'] = (job, message) => {
    setOpenKey(job.incident?.rebooking?.status === 'open' && job.incident.outcome ? 'decide' : null);
    onJob(job, message);
  };
  const e = escalation(j, now);
  const alert = jobAlert(j, now)!;
  const tried = assistantLog(j, now);

  return (
    <>
      <p className="text-sm">
        <span className="text-muted">Owner:</span> <strong className="font-semibold">You, in ops</strong>{' '}
        <span className="text-muted">
          since <span className="num">{hm(alert.at)}</span> · {e ? (e.why === 'phoned' ? `${firstName(j)} called ops` : ESCALATION_LABEL[e.why]) : alert.text}
        </span>
      </p>

      <p className="rounded-lg bg-lavender/50 px-3 py-2 text-sm font-semibold">Next step: {j.incident?.rebooking?.status === 'open' ? 'Log the customer-agreed pickup and delivery time' : next ? ({ keep_driver: 'Call driver', own_error: 'Check booking details', escalate: 'Call pickup contact, then backup', customer: 'Update customer and pilot account owner', decide: 'Record the customer’s decision', close: 'Close the loop' } as const)[next.key] : 'Incident complete'}</p>
      <TimeBar j={j} now={now} />

      {tried.length > 0 && !j.incident?.outcome && (
        <CollapsibleSection title="Already tried by the assistant" summary={`${tried.length} steps`}>
          <TimeList entries={tried} />
        </CollapsibleSection>
      )}

      <section id="playbook" data-demo-target="playbook" aria-label="Playbook" className="scroll-mt-[calc(var(--present-top,0px)+1rem)]">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Playbook <Proposed title="My proposed playbook, not given in the case: to agree with the team." />
        </h3>
        <ol className="divide-y divide-lavender rounded-xl border border-lavender">
          {PLAYBOOK.map((s, i) => {
            const doneAt = s.key === 'decide' ? (j.incident?.outcome?.at ?? steps.decide) : steps[s.key];
            const open = shown === s.key;
            const isNext = s.key === nextKey;
            return (
              <li key={s.key} data-playbook-step={s.key}>
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? 'none' : s.key)}
                  aria-expanded={open}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm ${isNext ? 'bg-lavender/40' : 'hover:bg-card/40'}`}
                >
                  <span
                    aria-hidden data-playbook-number
                    className={`num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${doneAt ? 'bg-ok text-white' : isNext ? 'bg-indigo text-white' : 'bg-card text-muted'}`}
                  >
                    {doneAt ? <Check size={14} /> : i + 1}
                  </span>
                  <span className={`min-w-0 flex-1 ${isNext ? 'font-bold' : doneAt ? 'font-medium' : 'text-muted'}`}>{s.title}</span>
                  <span className={`num shrink-0 text-xs ${doneAt ? 'text-ok' : isNext ? 'font-semibold text-indigo' : 'text-muted'}`}>
                    {doneAt ? `done ${hm(doneAt)}` : isNext ? 'now' : s.key === 'decide' ? `by ${hm(c.decideBy)}` : ''}
                  </span>
                </button>
                {open && (
                  <div className="space-y-3 px-3 pb-3 pl-12 text-sm">
                    <p className="text-muted">{s.what}</p>
                    <StepDetail key={s.key} step={s.key} j={j} now={now} onJob={act} done={!!doneAt} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {j.asInCase && <CasePrevention key={focus ?? 'closed'} j={j} open={focus === 'playbook'} />}

      <CollapsibleSection title="Incident log" summary={`${j.incident?.log.length ?? 0} entries`}>
        {j.incident?.log.length ? <TimeList entries={j.incident.log} /> : <p className="text-sm text-muted">Nothing logged yet. Each step you mark done is logged with the time.</p>}
      </CollapsibleSection>
    </>
  );
}

function Now({ label, children, strong, tone }: { label: ReactNode; children: ReactNode; strong?: boolean; tone?: 'bad' }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${strong ? 'bg-indigo text-white' : 'bg-card'}`}>
      <div className={`flex items-center gap-1.5 text-xs ${strong ? 'text-white/75' : 'text-muted'}`}>{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${tone === 'bad' ? 'text-bad' : ''} ${strong ? '[&_.text-muted]:text-white/75' : ''}`}>{children}</div>
    </div>
  );
}

/** The time pressure on one line: agreed pickup → now → decide by → last departure → deadline. */
function TimeBar({ j, now }: { j: Job; now: number }) {
  const c = incidentClock(j, now);
  const start = c.pickupAt;
  const span = Math.max(1, c.deadline - start);
  const at = (t: number) => `${Math.min(100, Math.max(0, ((t - start) / span) * 100))}%`;
  const marks = [
    { t: c.pickupAt, label: 'Pickup', align: 'left' },
    { t: c.decideBy, label: 'Decide by', align: 'center' },
    { t: c.lastDeparture, label: 'Est. latest departure', align: 'center' },
    { t: c.deadline, label: 'Deadline', align: 'right' },
  ] as const;
  return (
    <div>
      <p className="mb-1.5 flex flex-wrap items-center gap-1 text-sm">
        {j.incident?.outcome ? (
          <>
            Customer decided at <strong className="num">{hm(j.incident.outcome.at)}</strong>: {OUTCOME_LABEL[j.incident.outcome.type].toLowerCase()}
          </>
        ) : (
          <>
            Customer decides by <strong className={`num ${now >= c.decideBy ? 'text-bad' : ''}`}>{hm(c.decideBy)}</strong>
            <Proposed title="My proposed cut-off, not given in the case: 35 minutes before the last departure that still makes the 12:00 deadline." />
            <span className="text-muted">
              {now < c.decideBy ? `in ${formatDuration(c.decideBy - now)}` : 'passed'} · so the car can still leave by <span className="num">{hm(c.lastDeparture)}</span>
            </span>
          </>
        )}
        <InfoTip label="How the clock is counted">
          <p>Planning estimate: deadline minus assumed drive time, 15 min handover and 5 min margin. Validate traffic and handover time; five minutes is not a guaranteed traffic buffer.</p>
          <p>Decide by = 35 minutes before the last departure, so there is time to act on what the customer picks.</p>
        </InfoTip>
      </p>
      <div className="relative h-2 rounded-full bg-card" role="img" aria-label={`Now ${hm(now)}. Decide by ${hm(c.decideBy)}, last departure ${hm(c.lastDeparture)}, deadline ${hm(c.deadline)}.`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-warn/50" style={{ width: at(now) }} />
        {marks.map((m) => (
          <div key={m.label} className="absolute -top-0.5 -bottom-0.5 w-px bg-muted/60" style={{ left: at(m.t) }} />
        ))}
        <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-navy" style={{ left: at(now) }} title={`Now ${hm(now)}`} />
      </div>
      <div className="relative mt-1 h-8 text-xs">
        {marks.map((m) => (
          <span
            key={m.label}
            className={`absolute whitespace-nowrap leading-tight ${m.align === 'center' ? '-translate-x-1/2 text-center' : m.align === 'right' ? '-translate-x-full text-right' : ''}`}
            style={{ left: at(m.t) }}
          >
            <span className="num block font-semibold">{hm(m.t)}</span>
            <span className="text-muted">{m.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TimeList({ entries }: { entries: { at: number; text: string }[] }) {
  return (
    <ol className="space-y-1 text-sm">
      {entries.map((e, i) => (
        <li key={i} className="flex gap-3">
          <span className="num w-12 shrink-0 pt-0.5 text-xs text-muted">{hm(e.at)}</span>
          <span>{e.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** The case had no pre-pickup check. This is when it would have caught the missing keys. */
function CasePrevention({ j, open }: { j: Job; open?: boolean }) {
  const t24 = j.pickupAt - CHECK_24_MS;
  const t60 = j.pickupAt - CHECK_60_MS;
  return (
    <CollapsibleSection title="Prevention (proposed): how a pre-pickup check would have caught this" summary="4 touchpoints" open={open}>
      <ol className="space-y-1.5 text-sm">
        <li>
          <strong>1 · At booking.</strong> A named contact, a backup and the exact key location, or no dispatch.
        </li>
        <li>
          <strong>
            2 · Yesterday <span className="num">{hm(t24)}</span>.
          </strong>{' '}
          Text the {j.contact.role.toLowerCase()}: time, keys, who is on site. No reply by{' '}
          <span className="num">{hm(t24 + REPLY_WAIT_24_MS)}</span>: call the contact.
        </li>
        <li>
          <strong>
            3 · Today <span className="num">{hm(t60)}</span>.
          </strong>{' '}
          Reconfirm. No reply by <span className="num">{hm(t60 + REPLY_WAIT_60_MS)}</span>: call the contact.
        </li>
        <li>
          <strong>4 · On arrival.</strong> {firstName(j)} taps "I'm here". No keys after {NO_KEYS_ASSIST_MS / 60_000} minutes: the issue is visible to ops; the assistant asks what is wrong and offers a fixed contact message, and a person takes over {ASSIST_MS / 60_000} minutes later, at the latest {ESCALATE_BEFORE_DECIDE_MS / 60_000} minutes before the customer must decide. Ops knows at once, not after 25 minutes.
        </li>
      </ol>
    </CollapsibleSection>
  );
}

// ---------- The assistant's first minutes ----------

const DEMO_REPLY = 'The keys are at reception today, ask for the car by its job number.';

function AssistWork({ j, now, onJob }: { j: Job; now: number; onJob: Props['onJob'] }) {
  const a = assisting(j, now)!;
  const sent = (j.texts ?? []).find((t) => t.at <= now);
  const contact = j.contact.role.toLowerCase();
  return (
    <>
      <div data-guide-section="assist-status" className="grid gap-2 sm:grid-cols-3">
        <Now label="Owner">
          <span className="inline-flex items-center gap-1">
            <Bot size={14} aria-hidden /> The assistant
          </span>
          <span className="block text-xs font-normal text-muted">gathers facts only, and says it is an AI</span>
        </Now>
        <Now label="Waiting for" strong>
          {sent && !j.contactReply ? `The ${contact} to reply` : `${firstName(j)} to say what is wrong`}
          <span className="block text-xs font-normal text-muted">{sent ? `Texted ${hm(sent.at)}` : 'Nothing sent to the customer yet'}</span>
        </Now>
        <Now label="A person takes over">
          <span className="num">{hm(a.until)}</span> <span className="font-normal text-muted">{a.until > now ? `in ${formatDuration(a.until - now)}` : ''}</span>
          <span className="block text-xs font-normal text-muted">unless the keys are found first</span>
        </Now>
      </div>
      <CollapsibleSection title="Contact message and activity" summary={`${assistantLog(j, now).length} events`}>
        <TimeList entries={assistantLog(j, now)} />
        {sent && <blockquote className="mt-2 rounded-lg border border-lavender bg-card/50 px-3 py-2 text-xs leading-relaxed"><span className="font-semibold">Sent {hm(sent.at)}:</span> {sent.body}</blockquote>}
      </CollapsibleSection>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onJob(escalate(j, 'ops', now), `${j.id}: you took over from the assistant.`)} className={BTN}>
          Take over now
        </button>
        {sent && !j.contactReply && (
          <button
            type="button"
            onClick={() => onJob(contactReplies(j, DEMO_REPLY, now), `${j.id}: the ${contact} replied, and the assistant passed it on to ${firstName(j)}.`)}
            className="rounded-lg border border-dashed border-lavender px-3 py-1.5 text-xs font-semibold text-muted hover:border-indigo hover:text-indigo"
          >
            Demo: the {contact} replies
          </button>
        )}
      </div>
      <p className="text-xs text-muted">Waiting longer, a new time or cancelling is decided by a person, with the customer. Never by the assistant.</p>
    </>
  );
}

// ---------- A closed incident: what happened, and what we learn ----------

function Resolution({ j, now, onJob }: { j: Job; now: number; onJob: Props['onJob'] }) {
  const i = j.incident!;
  const rows: [string, string][] = [
    ['Decision', i.by === 'assistant' ? 'Keys found while the assistant had it' : i.outcome ? OUTCOME_LABEL[i.outcome.type] : '–'],
    ['Cause', i.cause ? CAUSE_LABEL[i.cause] + (i.causeNote ? `: ${i.causeNote}` : '') : '–'],
    ['Waiting time', `${Math.round(incidentClock(j, now).waitedMs / 60000)} min · ${i.waitPaid ? 'compensation confirmed by ops (demo)' : 'not confirmed'}`],
    ...(i.cancelPay ? ([['Drive cancelled', `${i.cancelPay} SEK to the driver`]] as [string, string][]) : []),
    ['Incident fee', i.feeWaived ? 'Waiver approved (proposed policy)' : 'No waiver logged'],
    ['Follow-up', i.reviewAt ? `15 min · ${formatDateTime(i.reviewAt)} · ${i.reviewOwner}` : `Cause logged; owner ${i.reviewOwner ?? 'Hjalmar'} reviews asynchronously`],
  ];
  return (
    <>
      <div className="flex items-center gap-2 rounded-xl bg-ok-bg px-3 py-2.5 text-sm font-semibold text-ok">
        <CircleCheck size={16} aria-hidden /> Closed at <span className="num">{hm(i.closedAt!)}</span> and logged
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {i.rebooking && <ReplacementForm j={j} now={now} onJob={onJob} />}
      {i.outcome?.type === 'keys_found' && !j.deliveredAt && <p className="rounded-lg bg-card p-3 text-sm font-semibold">Incident resolved; transport is still open. Track departure and delivery in the driver's view.</p>}
      <p className="text-xs text-muted">The cause feeds the weekly report: the same cause twice is a prevention task, not bad luck.</p>
      <CollapsibleSection title="Incident log" summary={`${i.log.length} entries`}>
        <TimeList entries={i.log} />
      </CollapsibleSection>
    </>
  );
}

function ReplacementForm({ j, now, onJob }: { j: Job; now: number; onJob: Props['onJob'] }) {
  const initial = now + (j.incident?.outcome?.type === 'new_date' ? 24 : 2) * 3600000;
  const [pickup, setPickup] = useState(localInputTime(initial));
  const [delivery, setDelivery] = useState(localInputTime(initial + (j.deadline - j.pickupAt)));
  const [sameDriver, setSameDriver] = useState(false);
  const task = j.incident?.rebooking;
  if (!task) return null;
  const agreement = { deadline: new Date(delivery).getTime(), driverConfirmed: sameDriver };
  const updated = bookReplacement(j, new Date(pickup).getTime(), now, agreement);
  return <section data-guide="replacement" data-demo-target="replacement" className="space-y-2 rounded-lg bg-warn-bg p-3 text-sm">
    <p className="font-semibold">{task.status === 'booked' ? task.driverConfirmed ? 'New time logged · same driver confirmed' : 'New time logged · Needs driver' : 'Customer chose a new time'}</p>
    <p className="text-xs">Owner {task.owner} · {task.status === 'open' ? `follow up by ${formatDateTime(task.dueAt)}` : `${formatDateTime(task.pickupAt!)} → delivery by ${formatDateTime(task.deadline!)}`}</p>
    {task.status === 'open' && <>
      <label className="block text-xs">Agreed pickup<input aria-label="Replacement pickup time" type="datetime-local" value={pickup} onChange={e => { setPickup(e.target.value); const at = new Date(e.target.value).getTime(); if (Number.isFinite(at)) setDelivery(localInputTime(at + j.deadline - j.pickupAt)); }} className="mt-1 block w-full rounded border bg-white p-2" /></label>
      <label className="block text-xs">Agreed delivery deadline<input aria-label="Replacement delivery deadline" type="datetime-local" value={delivery} onChange={e => setDelivery(e.target.value)} className="mt-1 block w-full rounded border bg-white p-2" /></label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={sameDriver} onChange={e => setSameDriver(e.target.checked)} />Same driver confirmed available (optional)</label>
      <p className="text-xs text-muted">Confirm these times with the customer. Leave the box unticked to log the time and retain a replacement-driver task.</p>
      <button type="button" disabled={updated === j} onClick={() => onJob(updated, sameDriver ? 'Agreed new time logged; same driver confirmed.' : 'Agreed new time logged; replacement needs a driver.')} className={BTN}>Log agreed new time</button>
    </>}
  </section>;
}

// ---------- A routine pickup: the pre-pickup check, touchpoint by touchpoint ----------

const CHECK_TEXT: Record<PickupCheck['state'], { text: string; cls: string }> = {
  scheduled: { text: 'Scheduled', cls: 'text-muted' },
  waiting: { text: 'Sent, waiting for a reply', cls: 'text-warn' },
  confirmed: { text: 'Confirmed by the contact', cls: 'text-ok' },
  by_phone: { text: 'Confirmed by phone', cls: 'text-ok' },
  no_reply: { text: 'No reply: call the contact', cls: 'text-bad' },
};

function PrePickupCheck({ j, now, onJob }: { j: Job; now: number; onJob: Props['onJob'] }) {
  const checks = pickupChecks(j, now);
  const status = driverStatus(j, now);
  const call = needsConfirmation(j, now);
  const arrived = j.arrivedAt !== undefined && j.arrivedAt <= now;
  const keys = j.keysAt !== undefined && j.keysAt <= now;
  const rows: { when: string; what: string; state: ReactNode; action?: ReactNode; done: boolean }[] = [
    { when: 'At booking', what: 'Contact, backup and key location required before dispatch', state: <span className={pickupReadinessErrors(j).length ? 'text-bad' : 'text-ok'}>{pickupReadinessErrors(j).length ? `Dispatch blocked: ${pickupReadinessErrors(j).join(', ')}` : 'Booking ready'}</span>, done: pickupReadinessErrors(j).length === 0 },
    ...checks.map((c) => ({
      when: `${c.label} · ${hm(c.sentAt)}`,
      what: c.key === '24h' ? 'Text the contact: time, keys, who is on site' : 'Reconfirm the pickup',
      state: <span className={CHECK_TEXT[c.state].cls}>{CHECK_TEXT[c.state].text}</span>,
      done: c.state === 'confirmed' || c.state === 'by_phone',
      action:
        call && c.state === 'no_reply' ? (
          <button type="button" onClick={() => onJob(confirmByPhone(j, now, c.key), `${j.id}: pickup confirmed by phone with the ${j.contact.role.toLowerCase()}.`)} className={BTN_SM}>
            <PhoneCall size={13} aria-hidden /> Log this check confirmed by phone
          </button>
        ) : undefined,
    })),
    {
      when: 'On arrival',
      what: `${firstName(j)} taps "I'm here", then "Got the keys"`,
      state: keys ? <span className="text-ok">Keys {hm(j.keysAt!)}</span> : arrived ? <span className="text-navy">Checked in {hm(j.arrivedAt!)}</span> : <span className="text-muted">Not yet</span>,
      done: keys || status === 'driving' || status === 'delivered',
    },
  ];
  const current = rows.findIndex((r) => !r.done);
  return (
    <section data-demo-target="confirmations" aria-label="Pre-pickup check">
      <h3 className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        Pre-pickup check <Proposed title="My proposed routine, not given in the case: to agree with the team." />
        <InfoTip label="About the pre-pickup check">
          <p>Each touchpoint has an owner. No reply in 2 hours (or 20 minutes) gives ops a task: call the contact, then the backup if needed.</p>
          <p className="text-muted">Reply windows (2 h / 20 min) are proposed; late bookings use one immediate confirmation. Call on missing replies, do not assume dispatch is safe.</p>
        </InfoTip>
      </h3>
      <ol className="divide-y divide-lavender rounded-xl border border-lavender">
        {rows.map((r, i) => (
          <li key={r.when} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm ${i === current ? 'bg-lavender/40' : ''}`}>
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${r.done ? 'bg-ok text-white' : i === current ? 'bg-indigo text-white' : 'bg-card text-muted'}`}
            >
              {r.done ? <Check size={14} /> : i + 1}
            </span>
            <span className="min-w-0 flex-1 basis-48">
              <span className="num block text-xs text-muted">{r.when}</span>
              <span className={i === current ? 'font-semibold' : ''}>{r.what}</span>
            </span>
            <span className="text-xs font-semibold">{r.state}</span>
            {r.action}
          </li>
        ))}
      </ol>
      {call && <button type="button" onClick={() => onJob({ ...j, customerWarnedAt: now }, 'Early warning to customer logged (demo).')} className="mt-2 text-sm font-semibold text-indigo">{j.customerWarnedAt ? `Customer warning logged ${hm(j.customerWarnedAt)}` : 'Log early warning to customer'}</button>}
      {status === 'delivered' && j.deliveredAt && <p className="mt-2 text-xs text-muted">Delivered at {hm(j.deliveredAt)}.</p>}
    </section>
  );
}

// ---------- The step details ----------

const BTN = 'inline-flex items-center gap-1.5 rounded-lg bg-indigo px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy disabled:bg-lavender disabled:text-muted';
const BTN_SM = 'inline-flex items-center gap-1.5 rounded-md border border-indigo px-2.5 py-1 text-xs font-semibold text-indigo hover:bg-indigo hover:text-white';

function StepDetail({ step, j, now, onJob, done }: { step: StepKey; j: Job; now: number; onJob: Props['onJob']; done: boolean }) {
  const [copied, setCopied] = useState(false);
  const [waitPaid, setWaitPaid] = useState(false);
  const [feeWaived, setFeeWaived] = useState(false);
  const [reviewBooked, setReviewBooked] = useState(false);
  const [reviewAt, setReviewAt] = useState(localInputTime(now + 24 * 3600000));
  const [correction, setCorrection] = useState('');
  const [correctedFrom, setCorrectedFrom] = useState(j.from);
  const [correctedContact, setCorrectedContact] = useState(j.contact.phone);
  const [newDeadline, setNewDeadline] = useState('');
  // The likely cause from what the driver reported; ops confirms or changes it.
  const [cause, setCause] = useState<IncidentCause>(causeFromReason(j.problemReason));
  const [causeNote, setCauseNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const first = firstName(j);
  const mark = (label: string) => onJob(markStep(j, step, now), `${j.id}: ${label}.`);

  switch (step) {
    case 'keep_driver':
      return (
        <button data-guide="call-driver" type="button" disabled={done} onClick={() => mark(`called ${first}`)} className={BTN}>
          <PhoneCall size={14} aria-hidden /> Called {first}
        </button>
      );
    case 'own_error': {
      const checks = pickupChecks(j, now);
      return (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted">Address</dt>
            <dd>{j.from}</dd>
            <dt className="text-muted">Agreed time</dt>
            <dd className="num">{hm(j.pickupAt)}</dd>
            <dt className="text-muted">Keys</dt>
            <dd>{j.keyLocation}</dd>
            <dt className="text-muted">Confirmations</dt>
            <dd>{j.asInCase ? <span className="text-muted">None: no pre-pickup check was in place</span> : checks.map((c) => `${c.label}: ${CHECK_TEXT[c.state].text.toLowerCase()}`).join(' · ')}</dd>
          </dl>
          <button data-guide="booking-correct" type="button" disabled={done} onClick={() => onJob(recordOwnError(j, false, '', now), 'Booking details checked and correct.')} className={BTN}>
            <Check size={14} aria-hidden /> Log checked: our details are right
          </button>
          <details className="text-sm"><summary className="cursor-pointer font-semibold text-indigo">Details are incorrect — record a correction</summary><div data-guide="booking-error" className="mt-2 space-y-2">
          <label className="block text-xs">Corrected pickup address<input aria-label="Corrected pickup address" value={correctedFrom} onChange={e => setCorrectedFrom(e.target.value)} maxLength={150} className="block w-full rounded border p-2" /></label><label className="block text-xs">Corrected contact phone<input aria-label="Corrected contact phone" value={correctedContact} onChange={e => setCorrectedContact(e.target.value)} maxLength={30} className="block w-full rounded border p-2" /></label>
          <label className="block text-xs">Or record an error and what was corrected<input aria-label="Booking correction" value={correction} onChange={e => setCorrection(e.target.value)} maxLength={300} className="mt-1 block w-full rounded border p-2 text-sm" /></label>
          <button data-guide="booking-correction-save" type="button" disabled={!correction.trim()} onClick={() => onJob(recordOwnError({ ...j, from: correctedFrom.trim(), contact: { ...j.contact, phone: correctedContact.trim() } }, true, correction, now), 'Our booking error and correction logged. Call the booker with the corrected details.')} className={BTN}>Log error found and corrected</button>
          </div></details>
        </>
      );
    }
    case 'escalate': {
      const texted = (j.texts ?? []).filter((t) => t.at <= now);
      const replied = j.contactReply && j.contactReply.at <= now;
      const state = (phone: string) => {
        const t = texted.find((x) => x.phone === phone);
        return t ? `texted ${hm(t.at)}${replied ? ', replied' : ', no reply'}` : 'not texted';
      };
      return (
        <>
          <ul className="space-y-1 text-xs">
            <li>
              <span className="font-semibold">{j.contact.role}</span> <span className="num text-muted">{j.contact.phone}</span> · {state(j.contact.phone)} · call first
            </li>
            <li>
              <span className="font-semibold">{j.backup.role}</span> <span className="num text-muted">{j.backup.phone}</span> · {state(j.backup.phone)} · then the backup
            </li>
            <li>{first} asks reception, the workshop and checks the key box again.</li>
          </ul>
          <button data-guide="call-contacts" type="button" disabled={done} onClick={() => mark('called the contact and the backup')} className={BTN}>
            <PhoneCall size={14} aria-hidden /> Called both
          </button>
        </>
      );
    }
    case 'customer': {
      const text = customerUpdate(j, now);
      return (
        <>
          <p className="rounded-lg border border-lavender bg-card/50 p-2.5 text-xs leading-relaxed">{text}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(text).catch(() => undefined);
                setCopied(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-lavender px-3 py-1.5 text-sm font-semibold hover:border-indigo hover:text-indigo"
            >
              <Copy size={14} aria-hidden /> {copied ? 'Copied' : 'Copy'}
            </button>
            <button data-guide="customer-update" type="button" onClick={() => mark('customer update logged')} className={BTN}>
              <Check size={14} aria-hidden /> Log customer update sent
            </button>
          </div>
          <p className="text-xs text-muted">A template filled from the job, not AI. You send it yourself.</p>
          {j.pilot && (
            <label data-guide="account-owner" className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={j.incident?.accountOwnerAt !== undefined}
                disabled={j.incident?.accountOwnerAt !== undefined}
                onChange={() => onJob(tellAccountOwner(j, now), `${j.id}: account owner told.`)}
                className="h-4 w-4 accent-indigo"
              />
              Pilot customer: tell the account owner on our side now, not on Monday
            </label>
          )}
        </>
      );
    }
    case 'decide': {
      const chosen = j.incident?.outcome?.type;
      const options: Outcome[] = ['keys_found', 'later_today', 'new_date', 'cancelled', 'ops_stopped'];
      return (
        <>
          <div data-guide="customer-outcomes" className="flex flex-wrap gap-2">
            {options.map((o) => (
              <button
                key={o}
                type="button"
                disabled={!!chosen || (o === 'keys_found' && now > incidentClock(j, now).lastDeparture) || (o === 'ops_stopped' && now < incidentClock(j, now).decideBy)}
                title={o === 'ops_stopped' && now < incidentClock(j, now).decideBy ? `Available from the decision point, ${hm(incidentClock(j, now).decideBy)}` : undefined}
                onClick={() => onJob(setOutcome(j, o, now), `${j.id}: ${OUTCOME_LABEL[o].toLowerCase()}.`)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                  chosen === o ? 'border-ok bg-ok-bg text-ok' : 'border-lavender hover:border-indigo hover:text-indigo disabled:opacity-50 disabled:hover:border-lavender disabled:hover:text-navy'
                }`}
              >
                {OUTCOME_LABEL[o]}
              </button>
            ))}
          </div>
          {now > incidentClock(j, now).lastDeparture && !chosen && <div className="space-y-2 rounded-lg bg-bad-bg p-3"><p className="text-sm font-semibold text-bad">Original departure cut-off passed. Agree a feasible new delivery deadline or rebook/cancel.</p><label className="text-xs">Customer-agreed delivery deadline<input type="datetime-local" value={newDeadline} onChange={e => setNewDeadline(e.target.value)} className="block rounded border p-1" /></label><button type="button" disabled={!newDeadline || new Date(newDeadline).getTime() < now + j.driveMin * 60000 + 20 * 60000} onClick={() => onJob(agreeDeliveryDeadline(j, new Date(newDeadline).getTime(), now), 'Revised delivery deadline agreed with customer and logged (demo).')} className={BTN}>Log customer agreement to new deadline</button></div>}
          {chosen && j.incident?.rebooking && <ReplacementForm j={j} now={now} onJob={onJob} />}
          <p className="text-xs text-muted">Recommend a feasible option, then log the customer's confirmed choice. No decision by the decision point? The drive is cancelled by default; tell the customer, who can rebook. Replacements remain open work until driver and delivery time are confirmed.</p>
        </>
      );
    }
    case 'close': {
      const remaining = [
        !j.incident?.outcome && 'Record the decision',
        j.pilot && !j.incident?.accountOwnerAt && 'Confirm the internal pilot account owner was updated',
        !waitPaid && 'Confirm waiting-time compensation',
        j.pilot && (!reviewBooked || !reviewAt || new Date(reviewAt).getTime() <= now) && 'Book the 15-minute follow-up with the customer at a future time',
        cause === 'other' && !causeNote.trim() && 'Describe the cause',
      ].filter(Boolean);
      return (
        <>
          {j.pilot && <label className="flex items-center gap-2"><input data-guide="close-account-owner" type="checkbox" checked={j.incident?.accountOwnerAt !== undefined} disabled={j.incident?.accountOwnerAt !== undefined} onChange={() => onJob(tellAccountOwner(j, now), `${j.id}: internal pilot account owner updated.`)} className="h-4 w-4 accent-indigo" />Internal pilot account owner updated</label>}
          <label className="flex items-center gap-2">
            <input data-guide="wait-paid" type="checkbox" checked={waitPaid} onChange={(e) => setWaitPaid(e.target.checked)} className="h-4 w-4 accent-indigo" />
            <span>
              {first}'s waiting-time compensation is confirmed by ops (demo), from {hm(Math.max(j.pickupAt, j.arrivedAt ?? j.pickupAt))}
              {cancelPayFor(j) > 0 ? `, plus ${cancelPayFor(j)} SEK (proposed half-reward cancellation pay)` : ''}
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input data-guide="review-booked" type="checkbox" checked={reviewBooked} onChange={(e) => setReviewBooked(e.target.checked)} className="h-4 w-4 accent-indigo" />
            {j.pilot ? 'Pilot: book a 15-minute follow-up with the customer on what went wrong' : 'Optional: book a follow-up with the customer if the issue warrants it'}
          </label>
          <label className="block text-xs">Follow-up owner Hjalmar · meeting time if scheduled<input aria-label="Booker review time" type="datetime-local" value={reviewAt} onChange={e => setReviewAt(e.target.value)} className="mt-1 block rounded border p-1 text-sm" /></label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={feeWaived} onChange={(e) => setFeeWaived(e.target.checked)} className="h-4 w-4 accent-indigo" />
            Incident fee waiver approved (proposed policy; not the full transport price)
          </label>
          <label className="flex flex-wrap items-center gap-2">
            Cause
            <select value={cause} onChange={(e) => setCause(e.target.value as IncidentCause)} className="block w-full max-w-full rounded-md border border-lavender bg-white px-2 py-1 text-sm">
              {(Object.keys(CAUSE_LABEL) as IncidentCause[]).map((c) => (
                <option key={c} value={c}>
                  {CAUSE_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          {cause === 'other' && (
            <label className="block">
              <span className="text-xs font-semibold">What happened (required for "Other")</span>
              <textarea
                data-guide="cause-note" value={causeNote}
                onChange={(e) => setCauseNote(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="e.g. the gate code in the booking was wrong"
                className="mt-1 w-full rounded-md border border-lavender px-2 py-1.5 text-sm"
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => {
              const r = closeIncident(j, { waitPaid, feeWaived, cause, note: causeNote, reviewBooked, reviewAt: reviewAt ? new Date(reviewAt).getTime() : undefined }, now);
              if (!r.ok) return setError(r.error);
              setError(null);
              onJob(r.job, `${j.id}: incident closed and logged.`);
            }}
            data-guide="close-incident" disabled={remaining.length > 0}
            className={BTN}
          >
            Close the incident
          </button>
          {remaining.length > 0 && <p className="text-xs text-muted">Still required: {remaining.join('; ')}.</p>}
          {error && (
            <p role="alert" className="flex items-center gap-1 text-xs text-bad">
              <TriangleAlert size={12} aria-hidden /> {error}
            </p>
          )}
        </>
      );
    }
  }
}
