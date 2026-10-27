import type { Applicant, Gig } from './types';
import type { Job } from './liveOps';
import type { DemoData } from './persist';
import { deriveStage } from './stage';
import { formatDateTime } from './time';
import { activationBucket } from './activation';
import { needsConfirmation } from './liveOps';

export type PresentKey = 'incident' | 'playbook' | 'decision' | 'prevent' | 'onboarding' | 'reminders' | 'queue' | 'criteria' | 'activate' | 'followup' | 'measure';
export interface PresentStep {
  key: PresentKey;
  part: 1 | 2;
  title: string;
  solution: string;
  instruction: string;
  location: string;
}

/** Case problem → existing solution → ordinary app control. No business actions live in the guide. */
export const PRESENT_STEPS: PresentStep[] = [
  { key: 'incident', part: 1, title: '25 minutes waiting: no contact, no keys.', solution: 'One view gives Ops the facts, owner and delivery risk.', instruction: 'Check Julia’s deadline and pickup contacts.', location: 'Julia’s pickup' },
  { key: 'playbook', part: 1, title: 'The driver asks whether to leave.', solution: 'Keep the driver informed; check our booking and escalate.', instruction: 'Log the driver call, booking check and contact attempts.', location: 'Incident playbook' },
  { key: 'decision', part: 1, title: 'The delivery promise is at risk.', solution: 'Recommend a feasible option, update the customer and close the incident with owned follow-up.', instruction: 'Log the update and agreed decision, then close the loop.', location: 'Customer decision' },
  { key: 'prevent', part: 1, title: 'Nobody knew about the transport.', solution: 'Confirm contacts, keys and timing before dispatch; call only on missing replies.', instruction: 'Inspect the confirmation status and the action on no reply.', location: 'Pickup confirmations' },
  { key: 'onboarding', part: 2, title: '30% never finish their documents.', solution: 'A short application shows progress and the next missing item.', instruction: 'Register with demo details and follow the document checklist.', location: 'New application' },
  { key: 'reminders', part: 2, title: 'Unfinished applications get forgotten.', solution: 'Specific reminders help the driver; the owner contacts incomplete applicants before 48 hours.', instruction: 'Read Nora’s reminder, then open the Ops schedule.', location: 'Nora’s AI assistant' },
  { key: 'queue', part: 2, title: 'Six days to decide; the target is 48 hours.', solution: 'Owner and backup work the deadline queue; missing documents and call-time exceptions stay visible.', instruction: 'Find the oldest deadline and read its Next step.', location: 'Decision queue' },
  { key: 'criteria', part: 2, title: 'Unwritten criteria produce inconsistent decisions.', solution: 'Apply the same documented checks. Ahmed’s 1 to <2 licence years means simple drives first.', instruction: 'Complete Ahmed’s checks and record the permitted decision.', location: 'Ahmed’s checks' },
  { key: 'activate', part: 2, title: 'Accepted is not active until the first delivery.', solution: 'The driver self-books a matching job; Ops follows the transport through delivery.', instruction: 'Book on Ahmed’s phone, then follow the same job in Live Ops.', location: 'Ahmed’s first drive' },
  { key: 'followup', part: 2, title: 'No first delivery: act on the actual blocker.', solution: 'No booking: remind at day 7, contact at day 14. Missing checks, no matching work and missed drives need different actions.', instruction: 'Compare Ida’s reminder with Anton’s route-demand blocker.', location: 'Awaiting first gig' },
  { key: 'measure', part: 2, title: 'Improve the process using actual outcomes.', solution: 'Track cohort conversion, documents, mean decision time and completed first drives.', instruction: 'Inspect the four metrics; use the report to choose one weekly improvement.', location: 'Funnel metrics' },
];

// The people are deliberately stable: Julia for the incident, Nora for documents, Ahmed from review to delivery.
export const reviewTarget = (apps: Applicant[]) => apps.find(a => a.name === 'Ahmed Hassan') ?? null;
export const activationTarget = (apps: Applicant[], _gigs?: Gig[], _now?: number) => reviewTarget(apps);
export const docsTarget = (apps: Applicant[], _gigs?: Gig[], _now?: number) => apps.find(a => a.name === 'Nora Axelsson') ?? null;
export const incidentTarget = (jobs: Job[], _now?: number) => jobs.find(j => j.asInCase) ?? null;
export const checkTarget = (jobs: Job[], now = Date.now()) => jobs.find(j => !j.asInCase && needsConfirmation(j, now)) ?? jobs.find(j => !j.asInCase && !j.firstDrive) ?? null;
export function followUpTargets(data: DemoData, now: number) {
  const waiting = data.apps.filter(a => deriveStage(a) === 'accepted' && !a.firstGig?.bookedFor);
  return {
    reminder: waiting.find(a => a.name === 'Ida Sjöberg' && activationBucket(a.decision!.at, now) === 'book') ?? waiting.find(a => activationBucket(a.decision!.at, now) === 'book') ?? null,
    call: waiting.find(a => a.name === 'Anton Wallin' && activationBucket(a.decision!.at, now) === 'call') ?? waiting.find(a => activationBucket(a.decision!.at, now) === 'call') ?? null,
  };
}

export interface GuideDestination {
  page: 'live' | 'funnel';
  filter: 'review' | 'missing' | 'awaiting' | 'action';
  applicantId: string | null;
  driverId: string | null;
  liveId: string | null;
  phone: 'steps' | 'chat' | null;
}
/** Resolving a step is read-only. Next/back can never accept, book, deliver or rewrite history. */
export function guideDestination(key: PresentKey, data: DemoData, newApplicantId: string | null = null): GuideDestination {
  const d: GuideDestination = { page: 'funnel', filter: 'action', applicantId: null, driverId: null, liveId: null, phone: null };
  const ahmed = reviewTarget(data.apps), nora = docsTarget(data.apps);
  if (['incident', 'playbook', 'decision', 'prevent'].includes(key)) return { ...d, page: 'live', liveId: (key === 'prevent' ? checkTarget(data.jobs, (incidentTarget(data.jobs)?.pickupAt ?? Date.now()) + 30 * 60000) : incidentTarget(data.jobs))?.id ?? null };
  if (key === 'onboarding') return { ...d, filter: 'missing', driverId: newApplicantId && data.apps.some(a => a.id === newApplicantId) ? newApplicantId : null, phone: 'steps' };
  if (key === 'reminders') return { ...d, filter: 'missing', driverId: nora?.id ?? null, phone: 'chat' };
  if (key === 'queue') return { ...d, filter: 'review' };
  if (key === 'criteria') return { ...d, filter: 'review', applicantId: ahmed?.id ?? null };
  if (key === 'activate') return { ...d, filter: 'awaiting', driverId: ahmed?.id ?? null, phone: 'steps' };
  if (key === 'followup') return { ...d, filter: 'awaiting' };
  return d;
}

export function presentEvidence(key: PresentKey, data: DemoData): string {
  const j = incidentTarget(data.jobs), a = reviewTarget(data.apps);
  if (key === 'decision' && j?.incident?.closedAt) return `Julia’s incident is closed. Transport ${j.deliveredAt ? 'delivered' : 'still open'}; waiting compensation and follow-up are recorded.`;
  if (key === 'criteria' && a?.decision) return `Ahmed: ${deriveStage(a)}. Licence ${a.licenceYears} years; decision ${formatDateTime(a.decision.at)}. Continue with the same driver.`;
  if (key === 'activate' && !a?.decision) return 'Ahmed is still under review. Complete his checks and decision in step 8 to reveal his first-drive offers.';
  if (key === 'activate' && a?.decision?.type === 'rejected') return 'Ahmed was rejected. His decision is preserved; no first-drive booking or activation is created by the guide.';
  if (key === 'activate' && a?.firstGig?.doneAt) return `Ahmed is active: ${a.firstGig.gigId} delivered ${formatDateTime(a.firstGig.doneAt)}. Customer feedback ${a.firstGig.customerSatisfied === undefined ? 'pending' : a.firstGig.customerSatisfied ? 'satisfied' : 'follow-up needed'}.`;
  if (key === 'activate' && a?.firstGig?.bookedFor) return `Ahmed: ${a.firstGig.gigId} booked ${formatDateTime(a.firstGig.bookedFor)}. He remains accepted until delivery.`;
  if (key === 'followup') return 'A booking remains accepted until delivery. This step shows follow-up for drivers without a booking; it does not undo Ahmed’s choice.';
  return '';
}

/** UI-only focus: expand a named section and bring the existing control into view. */
export function focusGuideStep(key: PresentKey) {
  document.querySelectorAll('[data-demo-focus]').forEach(el => el.removeAttribute('data-demo-focus'));
  const byTarget = (name: string) => document.querySelector<HTMLElement>(`[data-demo-target="${name}"]`);
  let target: HTMLElement | null = null;
  if (key === 'incident') target = byTarget('job-detail');
  if (key === 'playbook' || key === 'decision') {
    const playbook = document.getElementById('playbook');
    if (key === 'decision') {
      const customer = [...(playbook?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(b => b.textContent?.trim().startsWith('Customer hears'));
      if (customer?.getAttribute('aria-expanded') === 'false') customer.click();
    }
    target = playbook?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.closest('li') ?? playbook;
    if (!target) target = byTarget('job-detail');
  }
  if (key === 'prevent') target = byTarget('confirmations');
  if (key === 'onboarding' || key === 'reminders' || key === 'activate') target = byTarget('driver') ?? byTarget('job-detail');
  if (key === 'reminders') target = byTarget('nudges') ?? target;
  if (key === 'criteria') {
    const criteria = byTarget('criteria');
    const unchecked = criteria?.querySelector<HTMLInputElement>('input:not(:checked)');
    const onboarding = byTarget('candidate')?.querySelector<HTMLInputElement>('label input[type="checkbox"]:not(:checked)');
    target = unchecked?.closest('li') ?? onboarding?.closest('label') ?? byTarget('decision') ?? criteria;
  }
  if (key === 'queue' || key === 'followup') target = document.getElementById('queue');
  if (key === 'measure') target = byTarget('metrics');
  if (target) { target.setAttribute('data-demo-focus', 'true'); target.scrollIntoView({ behavior: 'smooth', block: target.matches('[data-demo-target="driver"]') ? 'nearest' : 'start' }); }
}

export interface GuideStatus { kind: 'explore' | 'pending' | 'complete'; text: string }
export function guideStatus(key: PresentKey, data: DemoData, newApplicantId: string | null = null): GuideStatus {
  const j = incidentTarget(data.jobs), a = reviewTarget(data.apps);
  const complete = (text: string): GuideStatus => ({ kind: 'complete', text: `Complete: ${text}` });
  const pending = (text: string): GuideStatus => ({ kind: 'pending', text: `To continue: ${text}` });
  if (key === 'playbook') {
    const steps = j?.incident?.steps;
    if (!steps?.keep_driver) return pending('Call driver and log the call in the playbook.');
    if (!steps.own_error) return pending('Check and record the booking details.');
    if (!steps.escalate) return pending('Call the pickup contact and backup; log the result.');
    return complete('Driver call, booking check and escalation recorded.');
  }
  if (key === 'decision') return j?.incident?.closedAt ? complete('Incident closed with compensation and follow-up recorded.') : pending('Record the customer update and decision, then complete Close the loop.');
  if (key === 'onboarding') return newApplicantId && data.apps.some(x => x.id === newApplicantId) ? complete('Registration tried; documents are not complete yet. Explore the checklist, then see Nora’s reminder example.') : pending('Start application, enter your demo details and press Continue.');
  if (key === 'criteria') return a?.decision ? complete(a.decision.type === 'rejected' ? 'Decision recorded: rejected. Step 9 will explain why booking is unavailable.' : 'Ahmed accepted. Continue to his first drive.') : pending('Read the criteria, complete the required checks and record the decision.');
  if (key === 'activate') return a?.firstGig?.doneAt ? complete('Ahmed delivered the first drive and is active.') : a?.firstGig?.bookedFor ? pending('Booking recorded, not active yet. Open the job in Live Ops; use demo time and the driver’s normal controls through delivery.') : a?.decision?.type === 'rejected' ? pending('Ahmed was rejected; no offers can be booked. You can continue to the follow-up examples.') : !a?.decision ? pending('Complete Ahmed’s decision in step 8 before choosing a drive.') : pending('Choose a matching route using Pick this drive on Ahmed’s phone.');
  return { kind: 'explore', text: '' };
}
