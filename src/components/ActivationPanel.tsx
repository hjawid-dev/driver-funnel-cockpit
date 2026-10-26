import { useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarCheck, Car, Check, Flag, Lock, PhoneCall } from 'lucide-react';
import { FIRST_GIG_ISSUE_LABEL, type Applicant, type FirstGigIssue, type Gig, type OpsActivationReason } from '../lib/types';
import { ACTIVATION_REASON_LABEL, ACTIVATION_RULE, activationBucket, activationFlags, activationReason, welcomeCallState } from '../lib/activation';
import { bookFirstGig, completeFirstGig, logWelcomeCall, OPS_ACTIVATION_LABEL, setActivationReason, type ActionResult } from '../lib/actions';
import { EXTRACT_STATE_LABEL, extractState, markExtractShown, needsExtract, showBy } from '../lib/extract';
import { DAY, formatDateTime } from '../lib/time';
import { ActivationChip } from './Activation';
import { DrawerSection, Proposed } from './ui';

interface Props {
  a: Applicant;
  apps: Applicant[];
  gigs: Gig[];
  now: number;
  onUpdate: (next: Applicant) => void;
  onResult: (r: ActionResult, close?: boolean) => void;
}

const OPS_REASONS: OpsActivationReason[] = ['declined', 'unreachable', 'not_interested'];

const toInputDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** First gigs start at 09:00 so ops is on standby. */
const fromInputDate = (v: string) => {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d, 9, 0).getTime();
};

export function ActivationPanel({ a, apps, gigs, now, onUpdate, onResult }: Props) {
  const bucket = activationBucket(a.decision!.at, now);
  const flags = activationFlags(a);
  const call = welcomeCallState(a, now);
  const days = Math.floor((now - a.decision!.at) / DAY);

  const [date, setDate] = useState(toInputDate(a.firstGig?.bookedFor ?? now + DAY));
  const [onTime, setOnTime] = useState(false);
  const [ok, setOk] = useState(false);
  const [cause, setCause] = useState<FirstGigIssue>('customer_keys');
  const [note, setNote] = useState('');
  const [rebook, setRebook] = useState(false);
  // The step to do now: the only one shown open, like the playbook in Live Ops.
  const current: 1 | 2 | 3 = a.firstGig?.bookedFor ? 3 : call.state === 'due' || call.state === 'overdue' ? 1 : 2;

  const reason = activationReason(a, apps, gigs, now);
  const extract = extractState(a, now);
  const by = showBy(a);
  const outcome = onTime && ok ? 'on time, no incident' : [!onTime && 'late', !ok && 'incident or unhappy customer'].filter(Boolean).join(' + ');

  return (
    <>
      <DrawerSection title="Activation" aside={<Proposed title="My proposed follow-up, not given in the case: welcome call within 24 h, book a first gig at 7 days, call at 14, dormant after 30." />}>
        <div className="rounded-lg border border-lavender p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">
              Accepted <strong className="num">{days}</strong> {days === 1 ? 'day' : 'days'} ago
            </span>
            <ActivationChip bucket={bucket} />
          </div>
          <p className="mt-1 text-xs text-muted">{ACTIVATION_RULE[bucket]}</p>
        </div>

        {(flags.simpleDrivesFirst || flags.activationFollowUp) && (
          <ul className="mt-2 space-y-1.5">
            {flags.simpleDrivesFirst && (
              <li className="flex gap-2 rounded-md bg-warn-bg px-3 py-2 text-sm">
                <Flag size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                <span>
                  <strong>Simple drives first.</strong> Curate an easy first gig: short distance, standard car, ops on standby.
                </span>
              </li>
            )}
            {flags.activationFollowUp && (
              <li className="flex gap-2 rounded-md bg-warn-bg px-3 py-2 text-sm">
                <Flag size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                <span>
                  <strong>Activation follow-up.</strong> Limited availability{a.availabilityNote ? ` (${a.availabilityNote.toLowerCase()})` : ''}: agree a fixed first slot on the welcome call.
                </span>
              </li>
            )}
          </ul>
        )}
      </DrawerSection>

      <DrawerSection title="Why no first drive yet" aside={<span className="text-xs text-muted">one reason, so the list adds up</span>}>
        <p className="text-sm font-semibold">{ACTIVATION_REASON_LABEL[reason]}</p>
        <p className="mt-0.5 text-xs text-muted">
          {reason === 'no_fit'
            ? 'No easy job in their part of Stockholm at a time they can drive: a demand gap, not the driver.'
            : a.activationReason
              ? 'Noted by ops after a call. Clear it when it changes.'
              : 'Worked out from the data. After a call, note what you learned:'}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {OPS_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={a.activationReason?.reason === r}
              onClick={() => onResult(setActivationReason(a, a.activationReason?.reason === r ? null : r, now))}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${a.activationReason?.reason === r ? 'border-indigo bg-indigo text-white' : 'border-lavender hover:border-indigo hover:text-indigo'}`}
            >
              {OPS_ACTIVATION_LABEL[r]}
            </button>
          ))}
        </div>
      </DrawerSection>

      {needsExtract(a) && (
        <DrawerSection title="Before the first drive · extract" aside={<span className="text-xs text-muted">voluntary, nothing stored</span>}>
          <div className="rounded-lg border border-lavender p-3 text-sm">
            <p className="flex items-center gap-1.5 font-semibold">
              <Lock size={15} aria-hidden /> {EXTRACT_STATE_LABEL[extract]}
              {extract === 'check_booked' && <span className="num font-normal">· {formatDateTime(a.extractCheckAt!)}</span>}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Accepted before the extract arrived. It is shown in a 5-minute video check{by ? `, by ${formatDateTime(by)} (the day before the drive), or the drive goes to another driver` : ', at the latest the day before the first drive'}.
            </p>
            {a.docs.extract === 'ready' && (
              <button
                type="button"
                onClick={() => onUpdate(markExtractShown(a, true, now))}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo px-3 py-1.5 text-sm font-semibold text-indigo hover:bg-indigo hover:text-white"
              >
                Extract shown (nothing stored)
              </button>
            )}
          </div>
        </DrawerSection>
      )}

      <section aria-label="Activation steps">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Steps to a first drive</h3>
        <ol className="divide-y divide-lavender rounded-xl border border-lavender">
          <Step n={1} title="Welcome call" when="within 24 h of acceptance" current={current === 1} done={call.state === 'done' || call.state === 'not_needed'}
            summary={call.state === 'done' ? `Logged ${formatDateTime(call.at)}` : call.state === 'not_needed' ? 'Not needed: the first drive is booked' : call.state === 'missed' ? 'Missed' : call.label}>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onResult(logWelcomeCall(a, now))}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo px-3 py-2 text-sm font-semibold text-white hover:bg-navy"
              >
                <PhoneCall size={15} aria-hidden /> Log welcome call
              </button>
              <span className={`text-xs font-semibold ${call.state === 'overdue' ? 'text-bad' : call.state === 'missed' ? 'text-muted' : 'text-warn'}`}>{'label' in call ? call.label : ''}</span>
            </div>
          </Step>

          <Step n={2} title="Book first gig" when="within 7 days" current={current === 2 || rebook} done={!!a.firstGig?.bookedFor && !rebook}
            summary={a.firstGig?.bookedFor ? `Booked for ${formatDateTime(a.firstGig.bookedFor)}` : 'Not booked yet'}
            action={a.firstGig?.bookedFor && !rebook ? <button type="button" onClick={() => setRebook(true)} className="text-xs font-semibold text-indigo hover:underline">Rebook</button> : undefined}>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs">
                <span className="block text-muted mb-1">Date (starts 09:00, ops on standby)</span>
                <input
                  type="date"
                  value={date}
                  min={toInputDate(now)}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-md border border-lavender px-2 py-1.5 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={!date}
                onClick={() => {
                  setRebook(false);
                  onResult(bookFirstGig(a, fromInputDate(date), now));
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo px-3 py-2 text-sm font-semibold text-indigo hover:bg-indigo hover:text-white disabled:opacity-50"
              >
                <CalendarCheck size={15} aria-hidden /> {a.firstGig?.bookedFor ? 'Rebook' : 'Book first gig'}
              </button>
            </div>
          </Step>

          <Step n={3} title="First gig completed" when="feeds first-gig quality" current={current === 3 && !rebook} done={false} summary="After the first gig is booked">
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={onTime} onChange={(e) => setOnTime(e.target.checked)} className="h-4 w-4 accent-indigo" />
                On time
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="h-4 w-4 accent-indigo" />
                No incident, customer happy
              </label>
              {!ok && (
                <div className="space-y-1.5 rounded-md bg-card/60 p-2">
                  <label className="flex flex-wrap items-center gap-2">
                    What went wrong
                    <select value={cause} onChange={(e) => setCause(e.target.value as FirstGigIssue)} className="rounded-md border border-lavender bg-white px-2 py-1 text-sm">
                      {(Object.keys(FIRST_GIG_ISSUE_LABEL) as FirstGigIssue[]).map((c) => (
                        <option key={c} value={c}>
                          {FIRST_GIG_ISSUE_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="sr-only">What happened</span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={300}
                      rows={2}
                      placeholder="What happened on the drive, e.g. the keys weren't at reception and the customer moved the time."
                      className="w-full rounded-md border border-lavender px-2 py-1.5 text-sm"
                    />
                  </label>
                  <p className="text-xs text-muted">Describe the drive, not the person. Required for an incident.</p>
                </div>
              )}
              <p className="text-xs text-muted">
                Will log: <span className={onTime && ok ? 'text-ok font-semibold' : 'text-bad font-semibold'}>{outcome}</span>
              </p>
              <button
                type="button"
                onClick={() => onResult(completeFirstGig(a, { onTime, ok, ...(ok ? {} : { issue: { cause, note } }) }, now), true)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo px-3 py-2.5 text-sm font-semibold text-white hover:bg-navy"
              >
                <Car size={16} aria-hidden /> Mark first gig completed
              </button>
            </div>
          </Step>
        </ol>
      </section>
    </>
  );
}


/** One step to a first drive: a line when it is done or later, the controls when it is the step to do now. */
function Step({ n, title, when, current, done, summary, action, children }: { n: number; title: string; when: string; current: boolean; done: boolean; summary: string; action?: ReactNode; children: ReactNode }) {
  return (
    <li className={`px-3 py-2.5 text-sm ${current ? 'bg-lavender/40' : ''}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden className={`num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-ok text-white' : current ? 'bg-indigo text-white' : 'bg-card text-muted'}`}>
          {done ? <Check size={14} /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className={current ? 'font-bold' : done ? 'font-medium' : 'text-muted'}>{title}</span>
          <span className="block text-xs text-muted">{current ? when : summary}</span>
        </span>
        {action}
      </div>
      {current && <div className="mt-2.5 pl-9">{children}</div>}
    </li>
  );
}
