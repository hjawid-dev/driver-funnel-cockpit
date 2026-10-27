import type { Applicant, Gig } from './types';
import type { Job } from './liveOps';
import type { DemoData } from './persist';
import { deriveStage } from './stage';
import { formatDateTime } from './time';
import { activationBucket } from './activation';
import { jobAlert, needsConfirmation } from './liveOps';
import { canStartDrive } from './eligibility';

export type PresentKey = 'incident' | 'assistant' | 'playbook' | 'booking_check' | 'contact' | 'customer' | 'decision' | 'close' | 'prevent' | 'onboarding' | 'reminders' | 'queue' | 'criteria' | 'activate' | 'followup' | 'measure';
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
  { key: 'incident', part: 1, title: 'Report the pickup problem.', solution: 'Original case: the driver called after 25 minutes. This separate solution example starts at arrival, before that wait.', instruction: 'On Julia’s phone: tap “I’m here”, then “Problem at pickup” and “Keys missing”. Watch Live Ops update.', location: 'Driver + Live Ops' },
  { key: 'assistant', part: 1, title: 'AI helps first; Ops stays informed.', solution: 'The driver gets guidance and the contacts receive a fixed message. If unresolved, Ops calls within 10 minutes of the report.', instruction: 'Read the AI conversation. Try “Still waiting” or ask a question. Use demo time to reach the call deadline.', location: 'Julia’s AI assistant' },
  { key: 'playbook', part: 1, title: 'Ops calls the driver.', solution: 'Ops takes ownership, confirms paid waiting and tells Julia what happens next.', instruction: 'Log “Called Julia”. This is the first human playbook action.', location: 'Call driver' },
  { key: 'booking_check', part: 1, title: 'Check our own booking.', solution: 'Check address, time, contact and key location before blaming the pickup site.', instruction: 'Record whether our details are correct, or log a correction.', location: 'Booking check' },
  { key: 'contact', part: 1, title: 'Call the contact and backup.', solution: 'Ops sees what AI already tried and escalates the unanswered contact.', instruction: 'Log the contact and backup call attempts.', location: 'Contact escalation' },
  { key: 'customer', part: 1, title: 'Update the customer before they ask.', solution: 'Explain the risk, next update time and proposed action; keep the pilot account owner informed.', instruction: 'Log the customer update and confirm the account owner was told.', location: 'Customer update' },
  { key: 'decision', part: 1, title: 'Record the agreed next step.', solution: 'Log the customer’s choice. New pickup timing can be agreed before a replacement driver is confirmed.', instruction: 'Choose an outcome. For a new time, confirm pickup and delivery deadline; the same driver is optional.', location: 'Customer decision' },
  { key: 'close', part: 1, title: 'Close the incident; retain unfinished transport work.', solution: 'Record compensation, cause and follow-up. A replacement needing a driver stays visible.', instruction: 'Complete Close the loop. Check any replacement transport still needing a driver.', location: 'Close the loop' },
  { key: 'prevent', part: 1, title: 'Prevent the same pickup failure.', solution: 'Confirm contacts, keys and timing before dispatch; call only on missing replies.', instruction: 'Inspect the confirmation checks and the no-reply action.', location: 'Pickup confirmations' },
  { key: 'onboarding', part: 2, title: '30% never finish their documents.', solution: 'A short application shows progress and the next missing item.', instruction: 'Register with demo details and follow the document checklist.', location: 'New application' },
  { key: 'reminders', part: 2, title: 'Unfinished applications get forgotten.', solution: 'Specific reminders help the driver; the owner contacts incomplete applicants before 48 hours.', instruction: 'Read Nora’s reminder, then open the Ops schedule.', location: 'Nora’s AI assistant' },
  { key: 'queue', part: 2, title: 'Six days to decide; the target is 48 hours.', solution: 'Owner and backup work the deadline queue; missing documents and call-time exceptions stay visible.', instruction: 'Find the oldest deadline and read its Next step.', location: 'Decision queue' },
  { key: 'criteria', part: 2, title: 'Unwritten criteria produce inconsistent decisions.', solution: 'Apply the same documented checks. Ahmed’s 1 to <2 licence years means simple drives first.', instruction: 'Complete Ahmed’s checks and record the permitted decision.', location: 'Ahmed’s checks' },
  { key: 'activate', part: 2, title: 'Accepted is not active until the first delivery.', solution: 'The driver self-books a matching job; Ops follows the transport through delivery.', instruction: 'Book on Ahmed’s phone, then follow the same job in Live Ops.', location: 'Ahmed’s first drive' },
  { key: 'followup', part: 2, title: 'No first delivery: act on the actual blocker.', solution: 'Ready, no booking: remind at day 7, contact at day 14. Missing checks, no matching work and missed drives need different actions.', instruction: 'Compare Ida’s reminder with Anton’s route-demand blocker.', location: 'Awaiting first gig' },
  { key: 'measure', part: 2, title: 'Improve the process using actual outcomes.', solution: 'Track monthly new active/applications (target 35%), documents, decision time and first-drive activation.', instruction: 'Inspect the four metrics; use the report to choose one weekly improvement.', location: 'Funnel metrics' },
];

// The people are deliberately stable: Julia for the incident, Nora for documents, Ahmed from review to delivery.
export const reviewTarget = (apps: Applicant[]) => apps.find(a => a.name === 'Ahmed Hassan') ?? null;
export const activationTarget = (apps: Applicant[], _gigs?: Gig[], _now?: number) => reviewTarget(apps);
export const docsTarget = (apps: Applicant[], _gigs?: Gig[], _now?: number) => apps.find(a => a.name === 'Nora Axelsson') ?? null;
export const incidentTarget = (jobs: Job[], _now?: number) => jobs.find(j => j.solutionExample) ?? jobs.find(j => j.asInCase) ?? null;
export const checkTarget = (jobs: Job[], now = Date.now()) => jobs.find(j => !j.asInCase && needsConfirmation(j, now)) ?? jobs.find(j => !j.asInCase && !j.firstDrive) ?? null;
export function followUpTargets(data: DemoData, now: number) {
  const waiting = data.apps.filter(a => deriveStage(a) === 'accepted' && !a.firstGig?.bookedFor && canStartDrive(a) === null);
  return {
    reminder: waiting.find(a => a.name === 'Ida Sjöberg') ?? waiting.find(a => activationBucket(a.decision!.at, now) === 'book') ?? null,
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
  if (['incident', 'assistant', 'playbook', 'booking_check', 'contact', 'customer', 'decision', 'close', 'prevent'].includes(key)) {
    const j = key === 'prevent' ? checkTarget(data.jobs, (incidentTarget(data.jobs)?.pickupAt ?? Date.now()) + 30 * 60000) : incidentTarget(data.jobs);
    return { ...d, page: 'live', liveId: j?.id ?? null, driverId: key === 'prevent' ? null : j?.driverId ?? null, phone: key === 'prevent' ? null : key === 'incident' ? 'steps' : 'chat' };
  }
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
  if (key === 'activate' && !a?.decision) return 'Ahmed is still under review. Complete his checks and decision in the review step to reveal his first-drive offers.';
  if (key === 'activate' && a?.decision?.type === 'rejected') return 'Ahmed was rejected. His decision is preserved; no first-drive booking or activation is created by the guide.';
  if (key === 'activate' && a?.firstGig?.doneAt) return `Ahmed is active: ${a.firstGig.gigId} delivered ${formatDateTime(a.firstGig.doneAt)}. Customer feedback ${a.firstGig.customerSatisfied === undefined ? 'pending' : a.firstGig.customerSatisfied ? 'satisfied' : 'follow-up needed'}.`;
  if (key === 'activate' && a?.firstGig?.bookedFor) return `Ahmed: ${a.firstGig.gigId} booked ${formatDateTime(a.firstGig.bookedFor)}. He remains accepted until delivery.`;
  if (key === 'followup') return 'A booking remains accepted until delivery. This step shows follow-up for drivers without a booking; it does not undo Ahmed’s choice.';
  return '';
}

export interface GuideStatus { kind: 'explore' | 'pending' | 'complete'; text: string }
export function guideStatus(key: PresentKey, data: DemoData, newApplicantId: string | null = null, now = Date.now()): GuideStatus {
  const j = incidentTarget(data.jobs), a = reviewTarget(data.apps);
  const complete = (text: string): GuideStatus => ({ kind: 'complete', text: `Complete: ${text}` });
  const pending = (text: string): GuideStatus => ({ kind: 'pending', text: `To continue: ${text}` });
  if (key === 'incident') return j?.problemAt ? complete('Problem reported; Live Ops has the same record.') : pending('On the phone, check in and report Keys missing.');
  if (key === 'assistant') return j && (j.incident?.steps.keep_driver || jobAlert(j, now)?.kind === 'escalated') ? complete('Ops has taken over.') : { kind: 'explore', text: '' };
  const stageChecks = { playbook: ['keep_driver', 'Log the call to Julia.'], booking_check: ['own_error', 'Record the booking check.'], contact: ['escalate', 'Log the contact and backup attempts.'], customer: ['customer', 'Log the customer update and tell the pilot account owner.'] } as const;
  if (key in stageChecks) {
    const [step, instruction] = stageChecks[key as keyof typeof stageChecks];
    const done = !!j?.incident?.steps[step] && (key !== 'customer' || !j?.pilot || !!j.incident.accountOwnerAt);
    return done ? complete('Recorded. Continue to the next action.') : pending(instruction);
  }
  if (key === 'decision') {
    const task = j?.incident?.rebooking;
    return j?.incident?.outcome && (!task || task.status === 'booked') ? complete(task && !task.driverConfirmed ? 'New time logged; replacement still needs a driver.' : 'Decision recorded.') : pending(j?.incident?.outcome && task ? 'Confirm the new pickup and delivery deadline; same-driver confirmation is optional.' : 'Choose the customer’s outcome in Decision point.');
  }
  if (key === 'close') return j?.incident?.closedAt ? complete('Incident closed. Any unassigned replacement remains open work.') : pending('Complete compensation, cause and pilot follow-up, then close the incident.');
  if (key === 'onboarding') return newApplicantId && data.apps.some(x => x.id === newApplicantId) ? complete('Registration tried; documents are not complete yet. Explore the checklist, then see Nora’s reminder example.') : pending('Start application, enter your demo details and press Continue.');
  if (key === 'criteria') return a?.decision ? complete(a.decision.type === 'rejected' ? 'Decision recorded: rejected. The first-drive step will explain why booking is unavailable.' : 'Ahmed accepted. Continue to his first drive.') : pending('Read the criteria, complete the required checks and record the decision.');
  if (key === 'activate') return a?.firstGig?.doneAt ? complete('Ahmed delivered the first drive and is active.') : a?.firstGig?.bookedFor ? pending('Booking recorded, not active yet. Open the job in Live Ops; use demo time and the driver’s normal controls through delivery.') : a?.decision?.type === 'rejected' ? pending('Ahmed was rejected; no offers can be booked. You can continue to the follow-up examples.') : !a?.decision ? pending('Complete Ahmed’s review decision before choosing a drive.') : pending('Choose a matching route using Pick this drive on Ahmed’s phone.');
  return { kind: 'explore', text: '' };
}
