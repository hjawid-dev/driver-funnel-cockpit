import type { Applicant, Gig } from './types';
import type { Job } from './liveOps';
import type { DemoData } from './persist';
import { deriveStage } from './stage';
import { formatDateTime } from './time';

export type PresentKey = 'incident' | 'playbook' | 'decision' | 'prevent' | 'onboarding' | 'reminders' | 'queue' | 'criteria' | 'activate' | 'deliver' | 'measure';
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
  { key: 'prevent', part: 1, title: 'Nobody at the pickup seems to know about the transport.', solution: 'Before dispatch, confirm the contact, backup and key location. Recheck before pickup; call new sites and pilot customers.', instruction: 'Explore Linnea’s upcoming new-site check: see what Ops confirms, when, and the driver’s arrival check.', location: 'Live Ops → Linnea → Pre-pickup check' },
  { key: 'onboarding', part: 2, title: 'About 30% never finish submitting their documents after registering.', solution: 'A simple onboarding flow shows progress, missing documents and the next action. Order the extract early and collect the rest in parallel.', instruction: 'Explore Nora’s application on the phone. Use “View application start” to inspect the sign-up flow, or the completed steps to look back.', location: 'Driver’s phone → Nora’s application' },
  { key: 'reminders', part: 2, title: 'An unfinished application can be forgotten by both the driver and Ops.', solution: 'Specific reminders at 2, 24 and 72 hours explain exactly what is missing. Ops follows up when automation is not enough.', instruction: 'Read Nora’s automatic messages. Then open the reminder schedule to inspect the missing document, message text and manual follow-up.', location: 'Nora → Messages / Ops reminder schedule' },
  { key: 'queue', part: 2, title: 'Registration to decision takes six days on average. The target is 48 hours.', solution: 'A prioritised queue, a named owner and backup, and fixed review slots make the next action clear. The clock starts at registration.', instruction: 'Inspect the deadlines in the review queue. Nora showed document follow-up; next we will use Ahmed’s complete file for the review-to-active flow.', location: 'Driver Funnel → In review' },
  { key: 'criteria', part: 2, title: 'No written criteria: reviewers decide borderline cases differently.', solution: 'Written must-haves and borderline rules standardise the assessment. Ahmed’s 1–2 years with a licence means simple first drives.', instruction: 'Read Ahmed’s criteria, complete the applicable checks and log the onboarding call. Use the normal decision button to accept him for simple drives.', location: 'Ahmed → Criteria and decision' },
  { key: 'activate', part: 2, title: 'Many accepted drivers never complete a first gig.', solution: 'Immediately after acceptance, show short, easy, nearby routes that match the driver. Book the first drive in the same onboarding call.', instruction: 'Keep the same Ahmed. In his phone view, compare the matching routes and choose “Pick this drive”. Booking alone does not make him active.', location: 'Driver’s phone → Ahmed → First-drive offers' },
  { key: 'deliver', part: 2, title: 'Accepted and booked still do not mean active.', solution: 'Follow the same driver and booked job through the first completed delivery, then record quality and customer feedback.', instruction: 'Use Ahmed’s normal pickup, keys, departure and delivery controls. Move demo time only when needed; open the job in Ops to log customer feedback.', location: 'Ahmed’s booked job → Driver’s phone / Live Ops' },
  { key: 'measure', part: 2, title: 'Without follow-up, Ops cannot see which part of the process needs improvement.', solution: 'Track document completion, decision time, first-drive activation and application-to-active conversion, alongside acceptance and quality.', instruction: 'Review the dashboard and weekly report. Each measure follows a process you just explored; demo changes are not measured business improvement.', location: 'Driver Funnel → Dashboard and weekly report' },
];

// The people are deliberately stable: Julia for the incident, Nora for documents, Ahmed from review to delivery.
export const reviewTarget = (apps: Applicant[]) => apps.find(a => a.name === 'Ahmed Hassan') ?? null;
export const activationTarget = (apps: Applicant[], _gigs?: Gig[], _now?: number) => reviewTarget(apps);
export const docsTarget = (apps: Applicant[], _gigs?: Gig[], _now?: number) => apps.find(a => a.name === 'Nora Axelsson') ?? null;
export const incidentTarget = (jobs: Job[], _now?: number) => jobs.find(j => j.asInCase) ?? null;
export const siteCallTarget = (jobs: Job[], _now?: number) => jobs.find(j => j.newSite && !j.asInCase) ?? jobs.find(j => j.pilot && !j.asInCase) ?? null;
export const checkTarget = siteCallTarget;

export interface GuideDestination {
  page: 'live' | 'funnel';
  filter: 'review' | 'missing' | 'awaiting' | 'action';
  applicantId: string | null;
  driverId: string | null;
  liveId: string | null;
  phone: 'steps' | 'chat' | null;
}
/** Resolving a step is read-only. Next/back can never accept, book, deliver or rewrite history. */
export function guideDestination(key: PresentKey, data: DemoData): GuideDestination {
  const d: GuideDestination = { page: 'funnel', filter: 'action', applicantId: null, driverId: null, liveId: null, phone: null };
  const ahmed = reviewTarget(data.apps), nora = docsTarget(data.apps);
  if (['incident', 'playbook', 'decision', 'prevent'].includes(key)) return { ...d, page: 'live', liveId: (key === 'prevent' ? siteCallTarget(data.jobs) : incidentTarget(data.jobs))?.id ?? null };
  if (key === 'onboarding' || key === 'reminders') return { ...d, filter: 'missing', driverId: nora?.id ?? null, phone: key === 'reminders' ? 'chat' : 'steps' };
  if (key === 'queue') return { ...d, filter: 'review' };
  if (key === 'criteria') return { ...d, filter: 'review', applicantId: ahmed?.id ?? null };
  if (key === 'activate') return { ...d, filter: 'awaiting', driverId: ahmed?.id ?? null, phone: 'steps' };
  if (key === 'deliver') return { ...d, page: 'live', driverId: ahmed?.id ?? null, liveId: data.jobs.find(j => j.firstDrive && j.driverId === ahmed?.id)?.id ?? null, phone: 'steps' };
  return d;
}

export function presentEvidence(key: PresentKey, data: DemoData): string {
  const j = incidentTarget(data.jobs), a = reviewTarget(data.apps);
  if (key === 'decision' && j?.incident?.closedAt) return `Julia’s incident is closed. Transport ${j.deliveredAt ? 'delivered' : 'still open'}; waiting compensation and follow-up are recorded.`;
  if (key === 'criteria' && a?.decision) return `Ahmed: ${deriveStage(a)}. Licence ${a.licenceYears} years; decision ${formatDateTime(a.decision.at)}. Continue with the same driver.`;
  if (key === 'activate' && !a?.decision) return 'Ahmed is still under review. Complete his checks and decision in step 8 to reveal his first-drive offers.';
  if ((key === 'activate' || key === 'deliver') && a?.decision?.type === 'rejected') return 'Ahmed was rejected. His decision is preserved; no first-drive booking or activation is created by the guide.';
  if ((key === 'activate' || key === 'deliver') && a?.firstGig?.doneAt) return `Ahmed is active: ${a.firstGig.gigId} delivered ${formatDateTime(a.firstGig.doneAt)}. Customer feedback ${a.firstGig.customerSatisfied === undefined ? 'pending' : a.firstGig.customerSatisfied ? 'satisfied' : 'follow-up needed'}.`;
  if ((key === 'activate' || key === 'deliver') && a?.firstGig?.bookedFor) return `Ahmed: ${a.firstGig.gigId} booked ${formatDateTime(a.firstGig.bookedFor)}. He remains accepted until delivery.`;
  if (key === 'deliver') return 'Book Ahmed’s first drive in step 9 before exploring pickup and delivery. The guide never creates a placeholder job.';
  return '';
}

/** UI-only focus: expand a named section and bring the existing control into view. */
export function focusGuideStep(key: PresentKey) {
  const find = (label: string) => [...document.querySelectorAll<HTMLElement>('button, h2, h3')].find(e => e.textContent?.trim().startsWith(label));
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
