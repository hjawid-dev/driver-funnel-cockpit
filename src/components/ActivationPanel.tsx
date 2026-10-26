import { useState } from 'react';
import { CalendarCheck, Lock } from 'lucide-react';
import type { Applicant, Gig } from '../lib/types';
import { activationReason, ACTIVATION_REASON_LABEL } from '../lib/activation';
import { bookFirstGig, setActivationReason, OPS_ACTIVATION_LABEL, type ActionResult } from '../lib/actions';
import { firstGigOffers } from '../lib/gigs';
import { needsExtract, markExtractShown, showBy, EXTRACT_STATE_LABEL, extractState } from '../lib/extract';
import { formatDateTime } from '../lib/time';
import { DrawerSection, Proposed } from './ui';
import { ReviewPanel } from './ReviewPanel';

interface Props { a: Applicant; apps: Applicant[]; gigs: Gig[]; now: number; onUpdate: (a: Applicant) => void; onResult: (r: ActionResult, close?: boolean) => void; onViewAsDriver?: (id: string) => void }

export function ActivationPanel({ a, apps, gigs, now, onUpdate, onResult, onViewAsDriver }: Props) {
  const [rebook, setRebook] = useState(false);
  const [review, setReview] = useState(false);
  const offers = firstGigOffers(a, gigs, apps, now).filter(g => g.id !== a.firstGig?.gigId);
  const booked = a.firstGig?.bookedFor;
  const reason = activationReason(a, apps, gigs, now);
  return <>
    <DrawerSection title="Accepted → first drive" aside={<Proposed title="Book in the onboarding call. Without a match, the owner follows up at 7 days and calls at 14 days." />}>
      <p className="text-sm font-semibold">{ACTIVATION_REASON_LABEL[reason]}</p>
      <p className="mt-1 text-xs text-muted">Owner: {a.owner ?? 'Hjalmar'} · backup: {a.backup ?? 'Sofia'}. Book a matching first drive together in this call.</p>
      {!booked && <div className="mt-2 flex flex-wrap gap-1">{(['declined', 'unreachable', 'not_interested'] as const).map(r => <button key={r} type="button" onClick={() => onResult(setActivationReason(a, a.activationReason?.reason === r ? null : r, now))} className="rounded-full border border-lavender px-2 py-1 text-xs">{OPS_ACTIVATION_LABEL[r]}</button>)}</div>}
    </DrawerSection>
    {needsExtract(a) && <DrawerSection title="Before the first drive · pre-drive check">
      <p className="flex items-center gap-1 text-sm font-semibold"><Lock size={14} />{EXTRACT_STATE_LABEL[extractState(a, now)]}</p>
      <p className="mt-1 text-xs text-muted">Accepted with a condition: a person completes the requirements check and sees the extract. No extract content is stored.{showBy(a) ? ` Complete by ${formatDateTime(showBy(a)!)} or the booking is released.` : ''}</p>
      {a.docs.extract === 'ready' && <button type="button" onClick={() => onUpdate(markExtractShown(a, true, now))} className="mt-2 rounded-lg border border-indigo px-3 py-2 text-sm text-indigo">Requirements met; extract shown (log check)</button>}
      <button type="button" onClick={() => setReview(v => !v)} className="mt-2 block text-sm font-semibold text-bad">Pre-drive requirements not met: review decision</button>
      {review && <ReviewPanel a={a} now={now} onUpdate={onUpdate} onResult={onResult} preDrive />}
    </DrawerSection>}
    <DrawerSection title={booked ? 'First drive booked' : 'Book first drive in this call'}>
      {booked && <><p className="text-sm font-semibold">{a.firstGig?.gigId} · {formatDateTime(booked)}</p><p className="mt-1 text-xs text-muted">Booking does not make the driver active. Delivery of this job in Live Ops does.</p>
        {booked > now && <button type="button" onClick={() => setRebook(v => !v)} className="mt-2 text-sm font-semibold text-indigo">{rebook ? 'Keep this booking' : 'Choose another available job'}</button>}
        {onViewAsDriver && <button type="button" onClick={() => onViewAsDriver(a.id)} className="mt-2 block text-sm font-semibold text-indigo">Open booked job in driver's view</button>}
      </>}
      {(!booked || rebook) && <div className="mt-2 space-y-2">{offers.length ? offers.map(g => <button key={g.id} type="button" onClick={() => { const result = bookFirstGig(a, g, now, apps); if (result.ok) setRebook(false); onResult(result); }} className="block w-full rounded-xl border border-lavender p-3 text-left text-sm hover:border-indigo"><span className="flex items-center gap-1 font-semibold"><CalendarCheck size={14} />{g.from} → {g.to}</span><span className="block text-xs text-muted">{formatDateTime(g.at)} · {g.km} km · {g.pay} SEK</span></button>) : <p className="rounded-lg bg-warn-bg p-3 text-sm">No suitable open job. Owner: {a.owner ?? 'Hjalmar'}. Check demand and contact this driver; do not create a placeholder drive. Follow up by {formatDateTime(Math.max(now, a.decision!.at + 7 * 86400000))}.</p>}</div>}
    </DrawerSection>
  </>;
}
