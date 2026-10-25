import { useState } from 'react';
import { CalendarCheck, Car, Flag, PhoneCall } from 'lucide-react';
import { FIRST_GIG_ISSUE_LABEL, type Applicant, type FirstGigIssue } from '../lib/types';
import { ACTIVATION_RULE, activationBucket, activationFlags, welcomeCallState } from '../lib/activation';
import { bookFirstGig, completeFirstGig, logWelcomeCall, type ActionResult } from '../lib/actions';
import { DAY, formatDateTime } from '../lib/time';
import { ActivationChip } from './Activation';
import { DrawerSection } from './ui';

interface Props {
  a: Applicant;
  now: number;
  onResult: (r: ActionResult, close?: boolean) => void;
}

const toInputDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** First gigs start at 09:00 so ops is on standby. */
const fromInputDate = (v: string) => {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d, 9, 0).getTime();
};

export function ActivationPanel({ a, now, onResult }: Props) {
  const bucket = activationBucket(a.decision!.at, now);
  const flags = activationFlags(a);
  const call = welcomeCallState(a, now);
  const days = Math.floor((now - a.decision!.at) / DAY);

  const [date, setDate] = useState(toInputDate(a.firstGig?.bookedFor ?? now + DAY));
  const [onTime, setOnTime] = useState(false);
  const [ok, setOk] = useState(false);
  const [cause, setCause] = useState<FirstGigIssue>('customer_keys');
  const [note, setNote] = useState('');

  const outcome = onTime && ok ? 'on time, no incident' : [!onTime && 'late', !ok && 'incident or unhappy customer'].filter(Boolean).join(' + ');

  return (
    <>
      <DrawerSection title="Activation">
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

      <DrawerSection title="1 · Welcome call" aside={<span className="text-xs text-muted">within 24 h of acceptance</span>}>
        {call.state === 'done' ? (
          <p className="text-sm text-ok font-medium">Logged {formatDateTime(call.at)}</p>
        ) : call.state === 'not_needed' ? (
          <p className="text-sm text-muted">Not needed: the first drive is booked.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onResult(logWelcomeCall(a, now))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo px-3 py-2 text-sm font-semibold text-white hover:bg-navy"
            >
              <PhoneCall size={15} aria-hidden /> Log welcome call
            </button>
            <span className={`text-xs font-semibold ${call.state === 'overdue' ? 'text-bad' : call.state === 'missed' ? 'text-muted' : 'text-warn'}`}>{call.label}</span>
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="2 · Book first gig" aside={<span className="text-xs text-muted">book within 7 days</span>}>
        {a.firstGig?.bookedFor && (
          <p className="mb-2 text-sm font-medium">
            Booked for <span className="num">{formatDateTime(a.firstGig.bookedFor)}</span>
          </p>
        )}
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
            onClick={() => onResult(bookFirstGig(a, fromInputDate(date), now))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo px-3 py-2 text-sm font-semibold text-indigo hover:bg-indigo hover:text-white disabled:opacity-50"
          >
            <CalendarCheck size={15} aria-hidden /> {a.firstGig?.bookedFor ? 'Rebook' : 'Book first gig'}
          </button>
        </div>
      </DrawerSection>

      <DrawerSection title="3 · First gig completed" aside={<span className="text-xs text-muted">feeds first-gig quality</span>}>
        <div className="rounded-lg border border-lavender p-3 space-y-2 text-sm">
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
      </DrawerSection>
    </>
  );
}

