import type { Applicant, Gig } from './types';
import type { Job } from './liveOps';
import type { DemoData } from './persist';
import { applyDecision, bookFirstGig, completeFirstGig, completeOnboarding, logNudge, logWelcomeCall, receiveDocument, setExtractShown, setPhotoApproved } from './actions';
import { checkIn, closeIncident, confirmByPhone, deliver, depart, firstDriveResult, gotKeys, markStep, recordOwnError, setOutcome, syncFirstDrive, tellAccountOwner } from './liveOps';
import { firstGigOffers } from './gigs';
import { deriveStage } from './stage';
import { DAY, MIN, formatDateTime } from './time';

export type PresentKey = 'incident' | 'playbook' | 'prevent' | 'funnel' | 'docs' | 'review' | 'activate' | 'deliver' | 'measure';
export type PresentAction = 'respond' | 'resolve' | 'nudge' | 'review' | 'book' | 'pickup' | 'deliver';
export interface PresentStep {
  key: PresentKey;
  part: 1 | 2;
  kind: 'Problem' | 'Fix' | 'Result';
  title: string;
  say: string;
  do: string;
  proof: string;
}
export const PRESENT_STEPS: PresentStep[] = [
  { key: 'incident', part: 1, kind: 'Problem', title: '09:30: Julia is stuck, delivery is due at 12:00', say: '25 minutes waiting, no keys and no contact. This is a pilot customer; the margin is only 280 SEK.', do: 'Point to the waiting clock, delivery deadline and pilot badge.', proof: 'The driver, delivery and customer relationship need one owner now.' },
  { key: 'playbook', part: 1, kind: 'Fix', title: 'One owner works the incident against a clock', say: 'Keep Julia, check our booking, call the site and tell the customer before they ask.', do: 'Run the simulated response, or log each action in the playbook below.', proof: 'Recorded actions, account-owner update and a customer decision point at 10:15.' },
  { key: 'prevent', part: 1, kind: 'Result', title: 'Close Julia’s incident, then prevent the next one', say: 'In this scenario the keys are found at 09:45. Closing the incident does not mean the car has been delivered.', do: 'Log the simulated outcome and follow-up. Then open the next new-site check.', proof: 'Waiting is compensated, a cause and 15-minute review are logged; contact, backup and keys are checked before the next pickup.' },
  { key: 'funnel', part: 2, kind: 'Problem', title: '120 applications, 25 active drivers', say: 'About 70% submit documents; the average decision takes six days. Acceptance and waiting reasons are not measured in the case.', do: 'Compare the case facts here with the illustrative dashboard below.', proof: '84 submissions minus 25 active is a volume gap of 59; timing, pending cases and rejections still need explaining.' },
  { key: 'docs', part: 2, kind: 'Fix', title: 'Nora gets the exact next action', say: 'Order the extract first, then collect the other documents in parallel. Each reminder names what is missing.', do: 'Log a simulated reminder and open Nora’s phone to see her next step.', proof: 'A concrete missing-document request, scheduled reminders and human follow-up; no real SMS is sent.' },
  { key: 'review', part: 2, kind: 'Fix', title: 'Review Elin using a deadline and written criteria', say: 'Elin is an overdue backlog case. The clock starts at registration and is not reset when documents arrive.', do: 'Run the simulated checks and onboarding decision, or complete them in Elin’s file.', proof: 'A named owner, verified checks and a human decision. The missed 48-hour target stays visible in history.' },
  { key: 'activate', part: 2, kind: 'Fix', title: 'Book Elin’s first drive in the same call', say: 'Acceptance is a handover to a real suitable job, not the end of onboarding.', do: 'Book the first matching job, or choose one in Elin’s file.', proof: 'The same Elin has a reserved job in Live Ops and is still awaiting her first completed drive.' },
  { key: 'deliver', part: 2, kind: 'Result', title: 'Follow the same Elin through her first delivery', say: 'Booking is not activation. A completed delivery and assessed feedback provide the evidence.', do: 'Jump to pickup and log the simulated handover; then jump through the drive and log delivery.', proof: 'The matching job is delivered, Elin becomes active and first-drive quality has explicit customer feedback.' },
  { key: 'measure', part: 2, kind: 'Result', title: 'Measure what changed, and what still needs work', say: 'Review decision time, documents and activation alongside acceptance and first-drive quality.', do: 'Open the weekly report. Explain the populations and follow-up windows.', proof: 'These clicks prove the workflow. Business improvement needs real cohorts after rollout; demo KPI changes are not a forecast.' },
];

export const reviewTarget = (apps: Applicant[]) => apps.find(a => a.name === 'Elin Johansson') ?? null;
export const activationTarget = (apps: Applicant[], _gigs?: Gig[], _now?: number) => reviewTarget(apps);
export const docsTarget = (apps: Applicant[], _gigs?: Gig[], _now?: number) => apps.find(a => a.name === 'Nora Axelsson') ?? null;
export const incidentTarget = (jobs: Job[], _now?: number) => jobs.find(j => j.asInCase) ?? null;
export const siteCallTarget = (jobs: Job[], _now?: number) => jobs.find(j => j.newSite && !j.asInCase) ?? jobs.find(j => j.pilot && !j.asInCase) ?? null;
export const checkTarget = siteCallTarget;
const start = (d: DemoData) => (incidentTarget(d.jobs)?.pickupAt ?? 0) + 30 * MIN;
const requireValue = <T,>(v: T | null | undefined, message: string): T => { if (v == null) throw new Error(message); return v; };
const applicantResult = (r: ReturnType<typeof applyDecision>): Applicant => { if (!r.ok) throw new Error(r.error); return r.applicant; };
const replaceApplicant = (d: DemoData, a: Applicant): DemoData => ({ ...d, apps: d.apps.map(x => x.id === a.id ? a : x), jobs: syncFirstDrive(d.jobs, a, d.gigs) });
const replaceJob = (d: DemoData, j: Job): DemoData => ({ ...d, jobs: d.jobs.map(x => x.id === j.id ? j : x) });

export function presentDone(action: PresentAction, d: DemoData): boolean {
  const j = incidentTarget(d.jobs), a = reviewTarget(d.apps);
  switch (action) {
    case 'respond': return !!j?.incident?.steps.customer && !!j.incident.steps.escalate && !!j.incident.steps.own_error && !!j.incident.steps.keep_driver && (!j.pilot || !!j.incident.accountOwnerAt);
    case 'resolve': return !!j?.incident?.closedAt;
    case 'nudge': return !!docsTarget(d.apps)?.nudges.some(t => t >= start(d));
    case 'review': return !!a?.decision;
    case 'book': return !!a?.firstGig?.gigId;
    case 'pickup': return !!d.jobs.find(x => x.firstDrive && x.driverId === a?.id)?.departedAt;
    case 'deliver': return !!a?.firstGig?.doneAt;
  }
}

export function presentPrerequisite(action: PresentAction, d: DemoData): PresentAction | null {
  if (action === 'resolve' && !presentDone('respond', d)) return 'respond';
  if (action === 'book' && !presentDone('review', d)) return 'review';
  if (action === 'pickup' && !presentDone('book', d)) return 'book';
  if (action === 'deliver' && !presentDone('pickup', d)) return 'pickup';
  return null;
}

/** Explicit demo buttons run the same domain actions as normal controls. Navigation never mutates data. */
export function runPresentAction(action: PresentAction, d: DemoData, now: number): { data: DemoData; now: number } {
  if (presentDone(action, d)) return { data: d, now };
  if (presentPrerequisite(action, d)) throw new Error('Prepare the earlier demo actions first.');
  let next = d;
  if (action === 'respond') {
    let j = requireValue(incidentTarget(d.jobs), 'Julia’s case is missing. Restart the presentation.');
    const at = Math.max(now, start(d));
    if (!j.incident?.steps.keep_driver) j = markStep(j, 'keep_driver', at);
    if (!j.incident?.steps.own_error) j = recordOwnError(j, false, '', at + 2 * MIN);
    if (!j.incident?.steps.escalate) j = markStep(j, 'escalate', at + 5 * MIN);
    if (!j.incident?.steps.customer) j = markStep(j, 'customer', at + 10 * MIN);
    if (j.pilot && !j.incident?.accountOwnerAt) j = tellAccountOwner(j, at + 10 * MIN);
    next = replaceJob(d, j); now = at + 10 * MIN;
  } else if (action === 'resolve') {
    let j = requireValue(incidentTarget(d.jobs), 'Julia’s case is missing.');
    now = Math.max(now, start(d) + 15 * MIN);
    if (!j.incident?.outcome) j = setOutcome(j, 'keys_found', now);
    if (!j.incident?.outcome) throw new Error('The departure cut-off passed. Use the customer’s revised deadline, rebooking or cancellation controls below.');
    const r = closeIncident(j, { waitPaid: true, feeWaived: false, cause: 'customer_keys', reviewBooked: true, reviewAt: now + DAY }, now);
    if (!r.ok) throw new Error(r.error);
    next = replaceJob(d, r.job);
  } else if (action === 'nudge') {
    next = replaceApplicant(d, applicantResult(logNudge(requireValue(docsTarget(d.apps), 'Nora’s file is missing.'), now)));
  } else if (action === 'review') {
    let a = requireValue(reviewTarget(d.apps), 'Elin’s file is missing.');
    a = receiveDocument(a, 'licence', 'verified', now);
    a = receiveDocument(a, 'id', 'verified', now);
    a = setPhotoApproved(a, true, now);
    if (a.docs.extract !== 'ready') throw new Error('Show the extract when it has arrived; never bypass a missing pre-drive check.');
    a = setExtractShown(a, true, now);
    a = completeOnboarding(a, now);
    a = applicantResult(applyDecision(a, { type: 'accepted' }, now));
    next = replaceApplicant(d, applicantResult(logWelcomeCall(a, now)));
  } else if (action === 'book') {
    const a = requireValue(reviewTarget(d.apps), 'Elin’s file is missing.');
    const gig = requireValue(firstGigOffers(a, d.gigs, d.apps, now)[0], 'No matching job remains. Restart the presentation or choose a suitable job manually.');
    next = replaceApplicant(d, applicantResult(bookFirstGig(a, gig, now, d.apps)));
  } else {
    let a = requireValue(reviewTarget(d.apps), 'Elin’s file is missing.');
    let j = requireValue(d.jobs.find(x => x.firstDrive && x.driverId === a.id), 'Elin needs a booked first drive.');
    if (action === 'pickup') {
      now = Math.max(now, j.pickupAt);
      j = confirmByPhone(j, Math.max(j.bookedAt ?? start(d), j.pickupAt - DAY), '24h');
      j = confirmByPhone(j, Math.max(j.bookedAt ?? start(d), j.pickupAt - 60 * MIN), '60min');
      j = checkIn(j, now); j = gotKeys(j, now); j = depart(j, now);
      if (!j.departedAt) throw new Error('Elin’s pre-drive checks must pass before departure.');
      next = replaceJob(d, j);
    } else {
      now = Math.max(now, requireValue(j.departedAt, 'Log departure before delivery.') + j.driveMin * MIN);
      j = { ...deliver(j, now), customerSatisfied: true };
      if (!j.deliveredAt) throw new Error('The drive has not reached the delivery time.');
      a = applicantResult(completeFirstGig(a, { ...firstDriveResult(j), delivery: { jobId: j.id, at: j.deliveredAt } }, now));
      next = replaceApplicant(replaceJob(d, j), a);
    }
  }
  return { data: next, now };
}

/** Loading a checkpoint is explicit and only fills missing prerequisites; it never resets the session. */
export function preparePresentAction(action: PresentAction, d: DemoData, now: number): { data: DemoData; now: number } {
  const prior = presentPrerequisite(action, d);
  if (!prior) return { data: d, now };
  const prepared = preparePresentAction(prior, d, now);
  return runPresentAction(prior, prepared.data, prepared.now);
}

export function presentActionFor(key: PresentKey, d: DemoData): PresentAction | null {
  return key === 'playbook' ? 'respond' : key === 'prevent' ? 'resolve' : key === 'docs' ? 'nudge' : key === 'review' ? 'review' : key === 'activate' ? 'book' : key === 'deliver' ? presentDone('pickup', d) ? 'deliver' : 'pickup' : null;
}
export const PRESENT_ACTION_LABEL: Record<PresentAction, string> = {
  respond: 'Simulate calls and customer update · +10 min', resolve: 'Simulate keys found and close incident · 09:45 or later', nudge: 'Log Nora’s reminder · simulated SMS', review: 'Simulate checks, onboarding and accept Elin', book: 'Book Elin’s first matching job · demo', pickup: 'Jump to pickup, confirm contacts and depart · demo', deliver: 'Jump through drive, deliver and log satisfied · demo',
};
export function presentEvidence(key: PresentKey, d: DemoData): string {
  const j = incidentTarget(d.jobs), a = reviewTarget(d.apps);
  if (key === 'prevent' && j?.incident?.closedAt) return `Julia: incident closed; transport ${j.deliveredAt ? 'delivered' : 'not delivered'}. Waiting compensated; cause logged; booker review ${formatDateTime(j.incident.reviewAt!)}.`;
  if (key === 'playbook' && presentDone('respond', d)) return 'Julia: driver called, booking checked, site escalated, customer and pilot account owner updated. Actions are in the incident log.';
  if (key === 'docs' && presentDone('nudge', d)) return 'Nora: reminder recorded. Her existing documents and application history are preserved. No real SMS was sent.';
  if (key === 'review' && a?.decision) return `Elin: ${deriveStage(a)}. Decision ${formatDateTime(a.decision.at)}; registration ${formatDateTime(a.registeredAt)}. The original deadline is preserved.`;
  if ((key === 'activate' || key === 'deliver') && a?.firstGig?.doneAt) return `Elin: active. ${a.firstGig.gigId} delivered ${formatDateTime(a.firstGig.doneAt)}; on time ${a.firstGig.onTime ? 'yes' : 'no'}; customer feedback ${a.firstGig.customerSatisfied === undefined ? 'pending' : a.firstGig.customerSatisfied ? 'satisfied' : 'follow-up needed'}.`;
  if ((key === 'activate' || key === 'deliver') && a?.firstGig?.bookedFor) return `Elin: ${deriveStage(a)}, ${a.firstGig.gigId} booked ${formatDateTime(a.firstGig.bookedFor)}. ${presentDone('pickup', d) ? 'Departed; delivery still required.' : 'Not active until delivery.'}`;
  return '';
}
