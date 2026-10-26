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
  { key: 'incident', part: 1, title: 'The driver has waited 25 minutes. No contact, no keys.', solution: 'Bring the driver, pickup details and delivery deadline into one view so Ops can assess the risk immediately.', instruction: 'Open Julia’s pickup. Check the 12:00 deadline, contact details and pilot-customer status.', location: 'Live Ops → Julia’s pickup' },
  { key: 'playbook', part: 1, title: 'The driver asks whether to leave. The contact is not answering.', solution: 'One owner keeps the driver, checks our booking and escalates to the contact and backup in a clear order.', instruction: 'Use the first three playbook sections below. Record the calls and booking check using their normal controls.', location: 'Julia → Playbook' },
  { key: 'decision', part: 1, title: 'The customer expects an on-time delivery, but the pickup is unresolved.', solution: 'Update the customer early, agree the next action by the decision point, then record compensation, cause and follow-up.', instruction: 'Open “Customer hears it from us”, then the decision and closing sections. Choose an outcome; the guide does not choose for you.', location: 'Julia → Customer update, decision and close' },
  { key: 'prevent', part: 1, title: 'Nobody at the pickup seems to know about the transport.', solution: 'Confirm the pickup 24 hours before and again one hour before. Ops calls only when a confirmation is missing.', instruction: 'Inspect the two confirmation checks. A missing reply creates a call task; a confirmed pickup needs no routine call.', location: 'Live Ops → Pickup confirmations' },
  { key: 'onboarding', part: 2, title: 'About 30% never finish submitting their documents after registering.', solution: 'A simple application shows progress, missing documents and the next step.', instruction: 'Start a new application and enter your own demo details. After registration, explore the document checklist. Next shows a separate unfinished-application example.', location: 'Driver’s phone → Your new application' },
  { key: 'reminders', part: 2, title: 'An unfinished application can be forgotten by both the driver and Ops.', solution: 'Specific reminders at 2, 24 and 72 hours explain exactly what is missing. Ops follows up when automation is not enough.', instruction: 'Example: Nora left her application unfinished. Read her automatic reminders in AI assistant, then inspect the Ops reminder schedule.', location: 'Nora → AI assistant / Ops reminder schedule' },
  { key: 'queue', part: 2, title: 'Registration to decision takes six days on average. The target is 48 hours.', solution: 'A prioritised queue, a named owner and backup, and fixed review slots make the next action clear. The clock starts at registration.', instruction: 'Inspect the deadlines in the review queue. Nora showed document follow-up; next we will use Ahmed’s complete file for the review-to-active flow.', location: 'Driver Funnel → In review' },
  { key: 'criteria', part: 2, title: 'No written criteria: reviewers decide borderline cases differently.', solution: 'Written must-haves and borderline rules standardise the assessment. Ahmed’s 1–2 years with a licence means simple first drives.', instruction: 'Read Ahmed’s criteria, complete the applicable checks and log the onboarding call. Use the normal decision button to accept him for simple drives.', location: 'Ahmed → Criteria and decision' },
  { key: 'activate', part: 2, title: 'Many accepted drivers never complete a first gig.', solution: 'Immediately after acceptance, the driver sees short, easy, nearby routes and books independently in the app.', instruction: 'Keep the same Ahmed. Compare the matching routes on his phone and choose “Pick this drive”. Ops does not need to book it in the onboarding call.', location: 'Driver’s phone → Ahmed → First-drive offers' },
  { key: 'followup', part: 2, title: 'No first booking? Remind first, then follow up personally.', solution: 'After 7 days without a booking, send a reminder. After 14 days, Ops calls to understand what is blocking the first drive.', instruction: 'These are separate waiting-driver examples. Compare Ida’s reminder stage with Anton’s call task. Ahmed’s booking remains unchanged.', location: 'Driver Funnel → Awaiting first gig' },
  { key: 'measure', part: 2, title: 'Without follow-up, Ops cannot see which part of the process needs improvement.', solution: 'Track document completion, decision time, first-drive activation and application-to-active conversion, alongside acceptance and quality.', instruction: 'Review the dashboard and weekly report. Each measure follows a process you just explored; demo changes are not measured business improvement.', location: 'Driver Funnel → Dashboard and weekly report' },
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
  const find = (label: string) => [...document.querySelectorAll<HTMLElement>('button, h2, h3')].find(e => e.textContent?.trim().replace(/^\d+\s*/, '').startsWith(label));
  let target: HTMLElement | null | undefined;
  if (key === 'decision') {
    target = find('Customer hears it from us');
    if (target?.getAttribute('aria-expanded') === 'false') target.click();
  } else if (key === 'playbook') target = document.getElementById('playbook');
  else if (key === 'queue') target = document.getElementById('queue');
  else if (key === 'criteria') target = find('Criteria');
  else if (key === 'measure') target = document.getElementById('kpi-title');
  // Fixed phone/drawer views already occupy their own viewport. Only scroll their own content or the page.
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export interface GuideStatus { kind: 'explore' | 'pending' | 'complete'; text: string }
export function guideStatus(key: PresentKey, data: DemoData, newApplicantId: string | null = null): GuideStatus {
  const j = incidentTarget(data.jobs), a = reviewTarget(data.apps);
  const complete = (text: string): GuideStatus => ({ kind: 'complete', text: `Step complete: ${text} Continue with Next.` });
  const pending = (text: string): GuideStatus => ({ kind: 'pending', text: `To continue: ${text}` });
  if (key === 'playbook') {
    const steps = j?.incident?.steps;
    if (!steps?.keep_driver) return pending('Call driver and log the call in the playbook.');
    if (!steps.own_error) return pending('Check and record the booking details.');
    if (!steps.escalate) return pending('Call the pickup contact and backup; log the result.');
    return complete('Driver call, booking check and escalation recorded.');
  }
  if (key === 'decision') return j?.incident?.closedAt ? complete('Incident closed with compensation and follow-up recorded.') : pending('Record the customer update and decision, then complete Close the loop.');
  if (key === 'onboarding') return newApplicantId && data.apps.some(x => x.id === newApplicantId) ? complete('Your application is registered. You can explore the checklist or continue to the reminder example.') : pending('Start application, enter your demo details and press Continue.');
  if (key === 'criteria') return a?.decision ? complete('Ahmed’s decision is recorded.') : pending('Read the criteria, complete the required checks and record the decision.');
  if (key === 'activate') return a?.firstGig?.bookedFor ? complete('Ahmed chose a first drive in the app.') : a?.decision?.type === 'rejected' ? pending('Ahmed was rejected; no offers can be booked. You can continue to the follow-up examples.') : !a?.decision ? pending('Complete Ahmed’s decision in step 8 before choosing a drive.') : pending('Choose a matching route using Pick this drive on Ahmed’s phone.');
  return { kind: 'explore', text: 'Explore this view, then choose Next when ready. No record needs to be changed in this step.' };
}
