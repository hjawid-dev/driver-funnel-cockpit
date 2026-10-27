import { useState } from 'react';
import { Lock } from 'lucide-react';
import type { Applicant, Gig, OpsActivationReason } from '../lib/types';
import { activationReason, ACTIVATION_REASON_LABEL, type ActivationReason } from '../lib/activation';
import { setActivationReason, OPS_ACTIVATION_LABEL, type ActionResult } from '../lib/actions';
import { firstGigOffers } from '../lib/gigs';
import { needsExtract, markExtractShown, showBy, EXTRACT_STATE_LABEL, extractState } from '../lib/extract';
import { formatDateTime } from '../lib/time';
import { CollapsibleSection, DrawerSection } from './ui';
import { ReviewPanel } from './ReviewPanel';

interface Props { a: Applicant; apps: Applicant[]; gigs: Gig[]; now: number; onUpdate: (a: Applicant) => void; onResult: (r: ActionResult, close?: boolean) => void; onViewAsDriver?: (id: string) => void }
const STATUS_HINT: Partial<Record<ActivationReason, string>> = {
  not_interested: 'Follow-up closed.',
  unreachable: 'Attempt logged · proposed retry after 3 days.',
  declined: 'Driver can choose another drive.',
  extract: 'Pre-drive check required.',
  booked: 'Track in Live Ops.',
  no_fit: 'Check demand and availability.',
};

export function ActivationPanel({ a, apps, gigs, now, onUpdate, onResult, onViewAsDriver }: Props) {
  const [review, setReview] = useState(false);
  const [outcome, setOutcome] = useState<OpsActivationReason | ''>(a.activationReason?.reason ?? '');
  const offers = firstGigOffers(a, gigs, apps, now).filter(g => g.id !== a.firstGig?.gigId);
  const booked = a.firstGig?.bookedFor;
  const overdue = !!booked && now > booked + 3 * 3600000 && !a.firstGig?.doneAt;
  const reason = activationReason(a, apps, gigs, now);
  const explanation = reason === 'not_interested'
          ? 'Logged after follow-up. No further booking action is needed. Clear the outcome if the driver wants to return.'
          : reason === 'unreachable'
            ? 'Contact attempt logged. Proposed retry after 3 days; update the outcome when you hear back.'
            : reason === 'declined'
              ? 'The offered drives did not suit the driver. They can choose another matching drive in the app.'
              : reason === 'extract'
                ? 'The extract must be shown before the first drive. Complete the pre-drive check below.'
                : booked
                ? 'The driver has booked in the app. Follow the drive in Live Ops.'
                : offers.length
                  ? `${offers.length} matching ${offers.length === 1 ? 'drive is' : 'drives are'} available. The driver chooses and books in the app.`
                  : 'No matching drive is available right now. Check route demand and the driver’s area and availability.';
  return <>
    <DrawerSection title="First-drive status" info={<>
      <p>{explanation}</p>
      {a.activationReason && !booked && <p>Follow-up logged {formatDateTime(a.activationReason.at)}.</p>}
    </>}>
      <div className="rounded-xl border border-lavender bg-card/50 p-3">
        <p className="text-sm font-semibold">{overdue ? 'First drive needs follow-up' : ACTIVATION_REASON_LABEL[reason]}</p>
        <p className="mt-1 text-xs text-muted">{overdue ? 'Resolve delivery or replacement in Live Ops.' : reason === 'not_picked' ? `${offers.length} matching ${offers.length === 1 ? 'drive' : 'drives'} · driver books in app.` : STATUS_HINT[reason]}</p>
      </div>
      {!booked && !a.activationReason && onViewAsDriver && offers.length > 0 && <button type="button" onClick={() => onViewAsDriver(a.id)} className="mt-2 rounded-lg border border-lavender px-3 py-2 text-sm font-semibold text-indigo hover:border-indigo">View offers in driver’s app</button>}
      {!booked && <div className="mt-4"><CollapsibleSection title="Log follow-up outcome" summary={a.activationReason ? 'Outcome recorded' : 'After contacting the driver'}>
        <form className="space-y-2 rounded-xl border border-lavender p-3" onSubmit={e => { e.preventDefault(); if (outcome) onResult(setActivationReason(a, outcome, now)); }}>
          <label htmlFor="activation-outcome" className="block text-xs font-semibold">What did you learn from the follow-up?</label>
          <select id="activation-outcome" value={outcome} onChange={e => setOutcome(e.target.value as OpsActivationReason | '')} className="w-full rounded-lg border border-lavender bg-white px-2 py-2 text-sm">
            <option value="">Choose an outcome…</option>
            {(['declined', 'unreachable', 'not_interested'] as const).map(r => <option key={r} value={r}>{OPS_ACTIVATION_LABEL[r]}</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!outcome || outcome === a.activationReason?.reason} className="rounded-lg bg-indigo px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-lavender disabled:text-muted">Save outcome</button>
            {a.activationReason && <button type="button" onClick={() => { onResult(setActivationReason(a, null, now)); setOutcome(''); }} className="text-sm font-semibold text-indigo">Clear logged outcome</button>}
          </div>
        </form>
      </CollapsibleSection></div>}
    </DrawerSection>
    {needsExtract(a) && <DrawerSection title="Pre-drive check" info={<p>A person completes the requirements check and sees the extract before the first drive. No copy or notes about its content are stored.</p>}>
      <p className="flex items-center gap-1 text-sm font-semibold"><Lock size={14} />{EXTRACT_STATE_LABEL[extractState(a, now)]}</p>
      <p className="mt-1 text-xs text-muted">Show the extract before driving. Nothing from it is stored.</p>
      {showBy(a) && <p className="mt-1 text-xs font-semibold text-warn">Show by {formatDateTime(showBy(a)!)} or the booking is released.</p>}
      {a.docs.extract === 'ready' && <button type="button" onClick={() => onUpdate(markExtractShown(a, true, now))} className="mt-2 rounded-lg border border-indigo px-3 py-2 text-sm text-indigo">Log extract shown</button>}
      <button type="button" onClick={() => setReview(v => !v)} className="mt-2 block text-sm font-semibold text-bad">Pre-drive requirements not met: review decision</button>
      {review && <ReviewPanel a={a} now={now} onUpdate={onUpdate} onResult={onResult} preDrive />}
    </DrawerSection>}
    {booked && <DrawerSection title={overdue ? "Delivery not recorded" : "First drive booked"} info={<p>Booking does not make the driver active. Delivery of this job in Live Ops does.</p>}>
      <p className="text-sm font-semibold">{a.firstGig?.gigId} · {formatDateTime(booked)}</p>
        {onViewAsDriver && <button type="button" onClick={() => onViewAsDriver(a.id)} className="mt-2 block text-sm font-semibold text-indigo">Open booked job in driver's view</button>}
    </DrawerSection>}
  </>;
}
