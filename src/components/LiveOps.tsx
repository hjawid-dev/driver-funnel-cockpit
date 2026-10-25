import { useState } from 'react';
import { Bot, Car, Check, CircleCheck, Clock, Copy, KeyRound, MapPin, PhoneCall, TriangleAlert } from 'lucide-react';
import {
  CAUSE_LABEL,
  causeFromReason,
  assisting,
  closeIncident,
  closedIncidents,
  confirmByPhone,
  customerUpdate,
  DRIVER_STATUS_LABEL,
  driverStatus,
  incidentClock,
  jobAlert,
  markStep,
  needsConfirmation,
  OUTCOME_LABEL,
  openIncidents,
  PLAYBOOK,
  callSite,
  cancelPayFor,
  needsSiteCall,
  siteCallDue,
  tellAccountOwner,
  CHECK_60_MS,
  REPLY_WAIT_60_MS,
  pickupChecks,
  setOutcome,
  todaysJobs,
  type Check as PickupCheck,
  type DriverStatus,
  type Job,
  type IncidentCause,
  type Outcome,
  type StepKey,
} from '../lib/liveOps';
import { formatDuration } from '../lib/time';
import { CollapsibleSection, SectionHeader } from './ui';
import { InfoTip } from './InfoTip';

interface Props {
  jobs: Job[];
  now: number;
  onJob: (j: Job, message: string) => void;
}

const hm = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** The pre-pickup check, as the case asks for it: what to confirm, by whom and when. */
const CHECK: { when: string; who: string; what: string }[] = [
  { when: 'At booking', who: 'Ops', what: 'A named contact, a backup contact and the exact key location, or no dispatch.' },
  { when: 'T−24 h', who: 'Ops', what: 'Text the contact: time, key location, who is on site. New site or pilot customer: a person calls instead.' },
  { when: 'T−60 min', who: 'Ops', what: 'Reconfirm. No reply: call the backup. Still nothing: warn the customer early.' },
  { when: 'On arrival', who: 'Driver → Ops', what: 'The driver taps "I\'m here". No keys: ops knows at once, not after 25 minutes.' },
];

/** Part 1: the stuck pickup gets the playbook (handle it now); every pickup shows its pre-pickup check (prevent it). */
export function LiveOps({ jobs, now, onJob }: Props) {
  const incidents = openIncidents(jobs, now);
  const closed = closedIncidents(jobs, now);
  const today = todaysJobs(jobs, now);
  const caseJob = jobs.find((j) => j.asInCase);

  return (
    <div className="space-y-8">
      <section>
        <SectionHeader title="1 · Handle it now: the playbook" />
        {incidents.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-card p-4 text-sm text-muted">
            <CircleCheck size={18} className="text-ok" aria-hidden /> No open incidents.
          </p>
        ) : (
          incidents.map((j) => <IncidentCard key={j.id} j={j} now={now} onJob={onJob} />)
        )}
        {closed.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Closed:{' '}
            {closed.map((j, i) => (
              <span key={j.id}>
                {i > 0 && ' · '}
                <span className="num">{j.id}</span> {j.driverName.split(' ')[0]}, {j.incident!.by === 'assistant' ? 'keys found' : OUTCOME_LABEL[j.incident!.outcome!.type].toLowerCase()} at{' '}
                <span className="num">{hm(j.incident!.closedAt!)}</span>
              </span>
            ))}
          </p>
        )}
      </section>

      <section>
        <SectionHeader title="2 · Prevent it: the pre-pickup check" />
        <ol className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CHECK.map((c, i) => (
            <li key={c.when} className="rounded-xl bg-card px-3.5 py-3 text-sm">
              <p className="flex items-baseline gap-2">
                <span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo text-[11px] font-semibold text-white">{i + 1}</span>
                <span className="font-semibold">{c.when}</span>
                <span className="text-xs font-semibold text-indigo">{c.who}</span>
              </p>
              <p className="mt-1 text-muted">{c.what}</p>
            </li>
          ))}
        </ol>
        {caseJob && (
          <p className="mb-3 rounded-xl border border-dashed border-lavender px-3.5 py-2.5 text-sm">
            <strong>In the case, none of this was in place.</strong> With it, the {caseJob.contact.role.toLowerCase()} would have been asked yesterday and at{' '}
            <span className="num">{hm(caseJob.pickupAt - CHECK_60_MS)}</span>, and no reply would have told ops to call the {caseJob.backup.role.toLowerCase()} by{' '}
            <span className="num">{hm(caseJob.pickupAt - CHECK_60_MS + REPLY_WAIT_60_MS)}</span>, before {caseJob.driverName.split(' ')[0]} reached the gate.
          </p>
        )}
        <h3 className="mb-1.5 text-sm font-semibold">Today's and tomorrow's pickups · {today.length}</h3>
        {today.length === 0 ? (
          <p className="rounded-xl bg-card p-4 text-sm text-muted">No pickups in the next 24 hours.</p>
        ) : (
          <ul className="divide-y divide-lavender rounded-xl border border-lavender">
            {byProgress(today, now).map((j) => (
              <PickupRow key={j.id} j={j} now={now} onJob={onJob} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PickupRow({ j, now, onJob }: { j: Job; now: number; onJob: Props['onJob'] }) {
  const checks = pickupChecks(j, now);
  const status = driverStatus(j, now);
  const alert = jobAlert(j, now);
  const assist = assisting(j, now);
  const call = needsConfirmation(j, now) && !alert && !assist;
  const siteCall = siteCallDue(j, now) && !alert && !assist;
  const past = status === 'driving' || status === 'delivered';
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm ${alert ? 'bg-bad-bg/30' : status === 'delivered' ? 'bg-card/40 text-muted' : ''}`}>
      <div className="w-14 shrink-0">
        <div className="num font-semibold">{hm(j.pickupAt)}</div>
        <div className="num text-xs text-muted">{j.id}</div>
      </div>
      <div className="min-w-0 flex-1 basis-56">
        <div className="font-semibold">{j.driverName}</div>
        <div className="truncate text-xs text-muted">
          {j.from} → {j.to}
          {j.pilot && <span className="ml-1.5 rounded bg-lavender px-1 py-px text-[11px] font-semibold text-navy">Pilot</span>}
          {j.firstDrive && <span className="ml-1.5 rounded bg-ok-bg px-1 py-px text-[11px] font-semibold text-ok">First drive · ops on standby</span>}
          {j.newSite && <span className="ml-1.5 rounded bg-warn-bg px-1 py-px text-[11px] font-semibold text-warn">New site</span>}
        </div>
      </div>
      <div className="flex gap-1.5">
        {!past && checks.map((c) => <CheckPill key={c.key} c={c} />)}
        {!past && j.asInCase && <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-muted">No check, as in the case</span>}
        {!past && needsSiteCall(j) && j.siteCalledAt !== undefined && <span className="rounded-full bg-ok-bg px-2 py-0.5 text-xs font-semibold text-ok">Site called</span>}
      </div>
      <div className="w-40 text-xs">
        {alert ? (
          <span className="font-semibold text-bad">{alert.kind === 'not_arrived' ? 'Not checked in' : j.incident?.outcome ? 'Decided, not closed' : 'Needs a person'}</span>
        ) : assist ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-lavender px-2 py-0.5 text-xs font-semibold text-indigo">
            <Bot size={12} aria-hidden /> Assistant handling
          </span>
        ) : j.incident?.outcome && j.incident.outcome.type !== 'keys_found' ? (
          <span className="text-muted">{OUTCOME_LABEL[j.incident.outcome.type].replace('Customer chose ', '').replace('Customer cancelled', 'Cancelled')}</span>
        ) : (
          <StatusPill status={status} at={status === 'delivered' ? j.deliveredAt : undefined} />
        )}
      </div>
      <div className="w-40 space-y-1 text-right">
        {siteCall && (
          <button
            type="button"
            title="New address or pilot customer: agree who hands over the keys, and where"
            onClick={() => onJob(callSite(j, now), `${j.id}: site called, the key handover is agreed.`)}
            className="inline-flex items-center gap-1.5 rounded-md border border-indigo px-2.5 py-1 text-xs font-semibold text-indigo hover:bg-indigo hover:text-white"
          >
            <PhoneCall size={13} aria-hidden /> Called the site
          </button>
        )}
        {call && (
          <button
            type="button"
            onClick={() => onJob(confirmByPhone(j, now), `${j.id}: pickup confirmed by phone with the ${j.backup.role.toLowerCase()}.`)}
            className="inline-flex items-center gap-1.5 rounded-md border border-indigo px-2.5 py-1 text-xs font-semibold text-indigo hover:bg-indigo hover:text-white"
          >
            <PhoneCall size={13} aria-hidden /> Confirmed by phone
          </button>
        )}
      </div>
    </li>
  );
}

const STATUS_STYLE: Record<DriverStatus, { cls: string; Icon: typeof Clock }> = {
  scheduled: { cls: 'border border-lavender bg-white text-muted', Icon: Clock },
  due: { cls: 'border border-indigo/50 bg-white text-indigo', Icon: Clock },
  arrived: { cls: 'bg-lavender text-navy', Icon: MapPin },
  keys: { cls: 'bg-lavender text-navy', Icon: KeyRound },
  driving: { cls: 'bg-indigo text-white', Icon: Car },
  delivered: { cls: 'bg-ok-bg text-ok', Icon: CircleCheck },
};

/** One look per stage, so a glance tells waiting, moving and done apart. */
function StatusPill({ status, at }: { status: DriverStatus; at?: number }) {
  const { cls, Icon } = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      <Icon size={12} aria-hidden />
      {DRIVER_STATUS_LABEL[status]}
      {at !== undefined && <span className="num font-normal">{hm(at)}</span>}
    </span>
  );
}

/** Pickups still to happen first, by time; delivered ones last. */
function byProgress(jobs: Job[], now: number): Job[] {
  const done = (j: Job) => (driverStatus(j, now) === 'delivered' ? 1 : 0);
  return [...jobs].sort((a, b) => done(a) - done(b) || a.pickupAt - b.pickupAt);
}

const CHECK_STYLE: Record<PickupCheck['state'], { cls: string; text: string }> = {
  scheduled: { cls: 'bg-card text-muted', text: 'scheduled' },
  waiting: { cls: 'bg-warn-bg text-warn', text: 'sent' },
  confirmed: { cls: 'bg-ok-bg text-ok', text: 'confirmed' },
  by_phone: { cls: 'bg-ok-bg text-ok', text: 'by phone' },
  no_reply: { cls: 'bg-bad-bg text-bad', text: 'no reply' },
};

function CheckPill({ c }: { c: PickupCheck }) {
  const s = CHECK_STYLE[c.state];
  return (
    <span className={`num whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-semibold ${s.cls}`}>
      {c.label} {s.text}
    </span>
  );
}

// ---------- The incident card ----------

function IncidentCard({ j, now, onJob }: { j: Job; now: number; onJob: Props['onJob'] }) {
  const alert = jobAlert(j, now)!;
  const c = incidentClock(j, now);
  const steps = j.incident?.steps ?? {};
  const next = PLAYBOOK.find((s) => !steps[s.key] && !(s.key === 'decide' && j.incident?.outcome))?.key ?? null;
  // null follows the next step to do; 'none' means the visitor folded it away.
  const [openKey, setOpenKey] = useState<StepKey | 'none' | null>(null);
  const shown = openKey === null ? next : openKey === 'none' ? null : openKey;
  const act: Props['onJob'] = (job, message) => {
    setOpenKey(null);
    onJob(job, message);
  };
  const first = j.driverName.split(' ')[0];

  return (
    <article className={`rounded-2xl border bg-white ${j.incident?.outcome ? 'border-lavender' : 'border-bad/40'}`}>
      <header className={`flex flex-wrap items-start gap-3 border-b px-4 py-3 sm:px-5 ${j.incident?.outcome ? 'border-lavender bg-card/60' : 'border-bad/20 bg-bad-bg/40'}`}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {j.incident?.outcome ? (
              <span className="rounded-md bg-ok-bg px-1.5 py-0.5 text-xs font-semibold text-ok">To close</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-bad px-1.5 py-0.5 text-xs font-semibold text-white">
                <TriangleAlert size={12} aria-hidden /> Urgent
              </span>
            )}
            <h3 className="font-bold">
              {j.driverName}: {j.incident?.outcome ? OUTCOME_LABEL[j.incident.outcome.type].toLowerCase() : alert.kind === 'not_arrived' ? 'not checked in' : 'stuck at the pickup'}
            </h3>
            {j.pilot && <span className="rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-navy">Pilot customer</span>}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            <span className="num">{j.id}</span> · {j.from} → {j.to} · {j.km} km · {alert.text} at <span className="num">{hm(alert.at)}</span>
          </p>
        </div>
      </header>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <ClockStrip j={j} now={now} />

        <ol className="divide-y divide-lavender rounded-xl border border-lavender">
          {PLAYBOOK.map((s, i) => {
            const doneAt = s.key === 'decide' ? (j.incident?.outcome?.at ?? steps.decide) : steps[s.key];
            const open = shown === s.key;
            const when = s.key === 'decide' ? `by ${hm(c.decideBy)}` : s.key === 'customer' ? 'before they ask' : i < 3 ? 'now' : 'after';
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? 'none' : s.key)}
                  aria-expanded={open}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm ${open ? 'bg-card/60' : 'hover:bg-card/40'}`}
                >
                  <span
                    aria-hidden
                    className={`num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      doneAt ? 'bg-ok text-white' : s.key === next ? 'bg-indigo text-white' : 'bg-lavender text-navy'
                    }`}
                  >
                    {doneAt ? <Check size={14} /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 font-semibold">{s.title}</span>
                  <span className={`num shrink-0 text-xs ${doneAt ? 'text-ok' : 'text-muted'}`}>
                    {doneAt ? `done ${hm(doneAt)}` : when}
                  </span>
                </button>
                {open && (
                  <div className="space-y-3 px-3 pb-3 pl-12 text-sm">
                    <p className="text-muted">{s.what}</p>
                    <StepDetail key={s.key} step={s.key} j={j} now={now} onJob={act} done={!!doneAt} first={first} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <CollapsibleSection title="Incident log" summary={`${j.incident?.log.length ?? 0} entries`}>
          {j.incident?.log.length ? (
            <ol className="space-y-1 text-sm">
              {j.incident.log.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="num w-12 shrink-0 text-xs text-muted pt-0.5">{hm(e.at)}</span>
                  <span>{e.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">Nothing logged yet. Each step you mark done is logged with the time.</p>
          )}
        </CollapsibleSection>
      </div>
    </article>
  );
}

function ClockStrip({ j, now }: { j: Job; now: number }) {
  const c = incidentClock(j, now);
  const tiles: { label: string; value: string; sub?: string; tone?: 'bad' | 'warn' }[] = [
    { label: 'Agreed pickup', value: hm(c.pickupAt) },
    { label: 'Driver has waited', value: formatDuration(c.waitedMs), tone: c.waitedMs >= 20 * 60_000 ? 'bad' : 'warn' },
    { label: 'Decide by', value: hm(c.decideBy), sub: now < c.decideBy ? `in ${formatDuration(c.decideBy - now)}` : 'passed', tone: now >= c.decideBy ? 'bad' : undefined },
    { label: 'Last departure', value: hm(c.lastDeparture), sub: `${j.driveMin} min drive` },
    { label: 'Deadline', value: hm(c.deadline) },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg bg-card px-3 py-2">
            <div className="text-xs text-muted">{t.label}</div>
            <div className={`num text-lg font-semibold ${t.tone === 'bad' ? 'text-bad' : t.tone === 'warn' ? 'text-warn' : ''}`}>{t.value}</div>
            {t.sub && <div className="text-xs text-muted">{t.sub}</div>}
          </div>
        ))}
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-xs text-muted">
        Margin {c.margin} SEK ({j.price} − {j.reward}){j.pilot ? ': small next to a pilot customer' : ''}
        <InfoTip label="How the clock is counted">
          <p>Last departure = deadline − drive time − 15 min for photos and handover − 5 min margin.</p>
          <p>Decide by = 35 minutes before the last departure, so there is time to act on what the customer picks.</p>
        </InfoTip>
      </p>
    </div>
  );
}

function StepDetail({ step, j, now, onJob, done, first }: { step: StepKey; j: Job; now: number; onJob: Props['onJob']; done: boolean; first: string }) {
  const [copied, setCopied] = useState(false);
  const [waitPaid, setWaitPaid] = useState(false);
  const [feeWaived, setFeeWaived] = useState(j.pilot);
  const [reviewBooked, setReviewBooked] = useState(false);
  // The likely cause from what the driver reported; ops confirms or changes it.
  const [cause, setCause] = useState<IncidentCause>(causeFromReason(j.problemReason));
  const [causeNote, setCauseNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mark = (label: string) => onJob(markStep(j, step, now), `${j.id}: ${label}.`);
  const btn = 'inline-flex items-center gap-1.5 rounded-lg bg-indigo px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy disabled:bg-lavender disabled:text-muted';

  switch (step) {
    case 'keep_driver':
      return (
        <button type="button" disabled={done} onClick={() => mark(`called ${first}`)} className={btn}>
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
            <dd className="flex flex-wrap gap-1.5">
              {j.asInCase ? <span className="text-muted">None: no pre-pickup check was in place</span> : checks.map((c) => <CheckPill key={c.key} c={c} />)}
            </dd>
          </dl>
          {checks.some((c) => c.state === 'no_reply') && (
            <p className="text-xs text-bad">Nobody confirmed the pickup. The tasks to call the backup contact were not done: a gap to fix in the routine.</p>
          )}
          <button type="button" disabled={done} onClick={() => mark('checked our own details')} className={btn}>
            <Check size={14} aria-hidden /> Checked, our details are right
          </button>
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
          <button type="button" disabled={done} onClick={() => mark('called the contact and the backup')} className={btn}>
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
            <button type="button" disabled={done} onClick={() => mark('sent the customer an update')} className={btn}>
              <Check size={14} aria-hidden /> Sent to the customer
            </button>
          </div>
          <p className="text-xs text-muted">A template filled from the job, not AI. You send it yourself.</p>
          {j.pilot && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={j.incident?.accountOwnerAt !== undefined}
                disabled={j.incident?.accountOwnerAt !== undefined}
                onChange={() => onJob(tellAccountOwner(j, now), `${j.id}: account owner told.`)}
                className="h-4 w-4 accent-indigo"
              />
              Pilot customer: the account owner at our side is told now, not on Monday
            </label>
          )}
        </>
      );
    }
    case 'decide': {
      const chosen = j.incident?.outcome?.type;
      const options: Outcome[] = ['keys_found', 'later_today', 'new_date', 'cancelled'];
      return (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              disabled={!!chosen}
              onClick={() => onJob(setOutcome(j, o, now), `${j.id}: ${OUTCOME_LABEL[o].toLowerCase()}.`)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                chosen === o ? 'border-ok bg-ok-bg text-ok' : 'border-lavender hover:border-indigo hover:text-indigo disabled:opacity-50 disabled:hover:border-lavender disabled:hover:text-navy'
              }`}
            >
              {OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
      );
    }
    case 'close':
      return (
        <>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={waitPaid} onChange={(e) => setWaitPaid(e.target.checked)} className="h-4 w-4 accent-indigo" />
            <span>
              {first}'s waiting time is paid from {hm(Math.max(j.pickupAt, j.arrivedAt ?? j.pickupAt))}
              {cancelPayFor(j) > 0 ? `, plus ${cancelPayFor(j)} SEK (half the reward: the drive didn't happen)` : ''}
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={reviewBooked} onChange={(e) => setReviewBooked(e.target.checked)} className="h-4 w-4 accent-indigo" />
            15 minutes booked with the booker: what went wrong on site, and the fix
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={feeWaived} onChange={(e) => setFeeWaived(e.target.checked)} className="h-4 w-4 accent-indigo" />
            Fee waived{j.pilot ? ' (pilot: raise it after the pilot)' : ''}
          </label>
          <label className="flex flex-wrap items-center gap-2">
            Cause
            <select value={cause} onChange={(e) => setCause(e.target.value as IncidentCause)} className="rounded-md border border-lavender bg-white px-2 py-1 text-sm">
              {(Object.keys(CAUSE_LABEL) as IncidentCause[]).map((c) => (
                <option key={c} value={c}>
                  {CAUSE_LABEL[c]}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">feeds the weekly report and prevention</span>
          </label>
          {cause === 'other' && (
            <label className="block">
              <span className="text-xs font-semibold">What happened (required for "Other")</span>
              <textarea
                value={causeNote}
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
              const r = closeIncident(j, { waitPaid, feeWaived, cause, note: causeNote, reviewBooked }, now);
              if (!r.ok) return setError(r.error);
              setError(null);
              onJob(r.job, `${j.id}: incident closed and logged.`);
            }}
            className={btn}
          >
            Close the incident
          </button>
          {error && <p role="alert" className="text-xs text-bad">{error}</p>}
        </>
      );
  }
}
