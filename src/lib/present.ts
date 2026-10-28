import type { Applicant, Gig } from './types';
import type { Job } from './liveOps';
import type { DemoData } from './persist';
import { deriveStage } from './stage';
import { formatDateTime } from './time';
import { activationBucket } from './activation';
import { jobAlert, needsConfirmation } from './liveOps';
import { canStartDrive } from './eligibility';
import { nudgeState } from './nudges';
import { DAY, HOUR } from './time';

const afterRegistering = (ms: number) => ms < DAY ? `${Math.round(ms / HOUR)} h` : `${Math.round(ms / DAY)} ${Math.round(ms / DAY) === 1 ? 'day' : 'days'}`;

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
  { key: 'assistant', part: 1, title: 'AI helps first; Ops stays informed.', solution: 'In the case Julia waited 25 minutes alone. Here she gets an answer at once and the site gets a fixed text; the assistant only gathers facts and never decides.', instruction: 'Read the AI response, then move demo time forward to the 10-minute call deadline.', location: 'Julia’s AI assistant' },
  { key: 'playbook', part: 1, title: 'Ops calls the driver.', solution: 'From now on one named person owns the incident, so the driver is never left waiting without an answer.', instruction: 'Log “Called Julia”. This is the first human playbook action.', location: 'Call driver' },
  { key: 'booking_check', part: 1, title: 'Check our own booking.', solution: 'Our own booking errors are a common cause. Ruling them out first decides who to call and avoids blaming the customer’s site.', instruction: 'Record whether our details are correct, or log a correction.', location: 'Booking check' },
  { key: 'contact', part: 1, title: 'Call the contact and backup.', solution: 'Calls follow up the unanswered texts, first the contact and then the backup, so nobody repeats what the assistant already tried.', instruction: 'Log the contact and backup call attempts.', location: 'Contact escalation' },
  { key: 'customer', part: 1, title: 'Update the customer before they ask.', solution: 'The customer hears it from us before they ask: the risk, our plan and the next update time. Pilot customers decide the pilot, so their account owner knows at once.', instruction: 'Log the customer update and confirm the account owner was told.', location: 'Customer update' },
  { key: 'decision', part: 1, title: 'Record the agreed next step.', solution: 'The customer decides; Ops records the choice so nothing is agreed only by phone. A new time can be fixed before a replacement driver exists.', instruction: 'Choose an outcome. For a new time, confirm pickup and delivery deadline; the same driver is optional.', location: 'Customer decision' },
  { key: 'close', part: 1, title: 'Close the incident; retain unfinished transport work.', solution: 'Julia is paid for the wait, the cause feeds the weekly report and the pilot customer gets a short review. Closing never hides transport work that still needs a driver.', instruction: 'Complete Close the loop. Check any replacement transport still needing a driver.', location: 'Close the loop' },
  { key: 'prevent', part: 1, title: 'Prevent the same pickup failure.', solution: 'Julia’s problem started before she arrived: nobody had confirmed the keys. Texts 24 hours and 60 minutes before catch it early; Ops only calls when a reply is missing.', instruction: 'Inspect the confirmation checks and the no-reply action.', location: 'Pickup confirmations' },
  { key: 'onboarding', part: 2, title: '30% never finish their documents.', solution: 'Every extra field or unclear step loses applicants. Progress is always visible, the slow police extract never blocks booking the call, and the call is booked in the same flow.', instruction: 'Register with demo details and follow the document checklist.', location: 'New application' },
  { key: 'reminders', part: 2, title: 'Unfinished applications get forgotten.', solution: 'Reminders name the exact missing item, not “complete your application”. When they are not enough, a person takes over.', instruction: 'Read Nora’s reminder, then open the Ops schedule.', location: 'Nora’s AI assistant' },
  { key: 'queue', part: 2, title: 'Six days to decide; the target is 48 hours.', solution: 'One owner and one backup work a queue sorted by deadline, so the oldest case is always on top and nothing waits unseen.', instruction: 'Find the oldest deadline and read its Next step.', location: 'Decision queue' },
  { key: 'criteria', part: 2, title: 'Unwritten criteria produce inconsistent decisions.', solution: 'Unwritten criteria gave different answers for similar drivers; written checks give every reviewer the same decision. The extract is seen before the first drive, not before acceptance: waiting for it (up to two weeks) would make 48 hours impossible. Not the order I would prefer, but the only way to meet 48 hours from application.', instruction: 'Complete Ahmed’s checks and record the permitted decision.', location: 'Ahmed’s checks' },
  { key: 'activate', part: 2, title: 'Accepted is not active until the first delivery.', solution: 'In the case many accepted drivers never drove. A driver only counts as active after a first delivery, so Ops follows that first transport all the way.', instruction: 'Book on Ahmed’s phone, then follow the same job in Live Ops.', location: 'Ahmed’s first drive' },
  { key: 'followup', part: 2, title: 'No first delivery: act on the actual blocker.', solution: 'The rule: ready but unbooked gets a reminder at day 7 and a call at day 14. Other blockers, such as no matching work, need a different action than another reminder.', instruction: 'Compare Ida’s reminder with Anton’s route-demand blocker.', location: 'Awaiting first gig' },
  { key: 'measure', part: 2, title: 'Improve the process using actual outcomes.', solution: 'One weekly report shows whether each fix works, so the team picks one improvement a week based on outcomes, not opinions.', instruction: 'Inspect the four metrics; use the report to choose one weekly improvement.', location: 'Funnel metrics' },
];

/** Chapters describe the process; the existing steps and business actions stay intact. */
export const PRESENT_CHAPTERS: { part: 1 | 2; label: string; keys: PresentKey[] }[] = [
  { part: 1, label: 'Report & AI', keys: ['incident', 'assistant'] },
  { part: 1, label: 'Ops takes over', keys: ['playbook', 'booking_check', 'contact', 'customer'] },
  { part: 1, label: 'Decision & closure', keys: ['decision', 'close'] },
  { part: 1, label: 'Prevention', keys: ['prevent'] },
  { part: 2, label: 'Documents', keys: ['onboarding', 'reminders'] },
  { part: 2, label: 'Decision within 48h', keys: ['queue', 'criteria'] },
  { part: 2, label: 'First drive', keys: ['activate'] },
  { part: 2, label: 'Follow-up', keys: ['followup'] },
  { part: 2, label: 'Measure', keys: ['measure'] },
];

export function guideIntro(key: PresentKey, data: DemoData, viewedName: string | null = null) {
  const j = incidentTarget(data.jobs), a = reviewTarget(data.apps);
  const intros: Record<PresentKey, { role: string; title: string; context: string }> = {
    incident: { role: 'Driver · Julia', title: 'Report missing keys', context: 'Delivery is due at 12:00. Report the pickup problem on Julia’s phone so Ops sees it immediately.' },
    assistant: { role: 'Driver · Julia → AI', title: 'Get help immediately', context: 'Read the assistant’s reply. If nothing is solved within 10 minutes, a person takes over: move demo time to that deadline.' },
    playbook: { role: 'Ops · Julia’s pickup', title: 'Call Julia and take ownership', context: 'The problem is unresolved. Confirm paid waiting and explain what happens next.' },
    booking_check: { role: 'Ops · Julia’s pickup', title: 'Check our booking first', context: 'Verify the pickup details before escalating to the site. Record a correction only if something is wrong.' },
    contact: { role: 'Ops · Julia’s pickup', title: 'Call the contact and backup', context: 'Use the same incident record to see what AI tried, then log the human contact attempts.' },
    customer: { role: 'Ops · Julia’s pickup', title: 'Keep the customer informed', context: 'Send the prepared customer update, then confirm the account owner was told.' },
    decision: { role: 'Ops · Customer’s decision', title: 'Record the agreed outcome', context: 'Choose the customer’s outcome. A new time needs pickup and delivery deadlines; the same driver is optional.' },
    close: { role: 'Ops · Julia’s incident', title: 'Close the incident responsibly', context: 'Tick each item in Close the loop, then close the incident.' },
    prevent: { role: 'Ops · Separate pickup example', title: 'Catch the problem before arrival', context: 'Omar’s pickup tomorrow got no reply to its 24-hour text. Log the phone confirmation with the backup contact.' },
    onboarding: { role: 'Driver · Your new application', title: 'Make documents easy to finish', context: 'About 30% never finish their documents. The fix: a few-minute application, one missing item at a time, and automatic reminders. Try it on the phone.' },
    reminders: { role: 'Driver → Ops · Separate example: Nora', title: 'Recover an unfinished application', context: 'Nora is missing her licence. Read her automatic reminders, then log the owner’s follow-up in Ops; in the demo that stands for Ops having called her.' },
    queue: { role: 'Ops · Decision queue', title: 'Prioritise the 48-hour deadline', context: 'Decisions take about six days in the case; the target is 48 hours. Open the oldest deadline and act on its Next step.' },
    criteria: { role: 'Ops · Ahmed’s application', title: 'Apply the same written checks', context: 'Unlike Erik, Ahmed qualifies. Tick the extract, photo and onboarding-call checks, then accept. 1.5 licence years means simple drives first.' },
    activate: { role: 'Driver · Ahmed → Live Ops', title: 'Turn acceptance into a first delivery', context: a?.firstGig?.doneAt ? 'Ahmed has delivered and is active. Next, explore separate examples of drivers who have not booked.' : a?.firstGig?.bookedFor ? 'First drive booked — not active yet. Open the same job in Live Ops and follow it through delivery.' : a?.decision?.type === 'rejected' ? 'Ahmed was rejected, so booking is unavailable. Revisit his checks or continue to the separate follow-up examples.' : !a?.decision ? 'Ahmed needs a review decision before offers are available. Open his checks to continue.' : 'Ahmed chooses a suitable first drive himself. Book on his phone, then follow the same transport through delivery.' },
    followup: { role: viewedName === 'Ida Sjöberg' ? 'Separate example · Ida · Driver' : viewedName === 'Anton Wallin' ? 'Separate example · Anton · Ops' : 'Ops · Separate follow-up examples', title: 'Act on the actual blocker', context: viewedName === 'Ida Sjöberg' ? 'Read Ida’s earlier day-7 reminder in her messages. Ready drivers still unbooked at day 14 get Ops contact; document reminders are separate.' : viewedName === 'Anton Wallin' ? 'Anton has no matching drive. The owner checks route demand and availability; another reminder will not solve that blocker.' : 'Compare Ida’s day-7 reminder with Anton’s missing route match. Ahmed’s booking and delivery stay unchanged.' },
    measure: { role: 'Ops manager · Process review', title: 'Measure whether the process improves', context: 'Documents → completion. Reviews → decision time. First drives → activation. Application-to-active, the north star, has the 35% target.' },
  };
  const intro = intros[key];
  if (key === 'reminders') {
    const nora = docsTarget(data.apps);
    const sent = nora ? nudgeState(nora, Date.now() + 365 * DAY).autoSent.map(t => t - nora.registeredAt) : [];
    if (sent.length) return { ...intro, context: `${intro.context} Reminders came ${sent.map(afterRegistering).join(' · ')} after she registered.` };
  }
  if (key === 'prevent' && j?.incident?.outcome?.type === 'keys_found' && !j.incident.steps.keep_driver) return { ...intro, context: 'The pickup was solved before human takeover, so escalation was unnecessary. Omar’s separate example shows prevention.' };
  return intro;
}

// The people are deliberately stable: Julia for the incident, Nora for documents, Ahmed from review to delivery.
export const reviewTarget = (apps: Applicant[]) => apps.find(a => a.name === 'Ahmed Hassan') ?? null;
/** The oldest deadline in the review queue: a hard reject on the licence rule. */
export const queueTarget = (apps: Applicant[]) => apps.find(a => a.name === 'Erik Svensson') ?? null;
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
  if (key === 'onboarding') {
    const own = data.apps.find(x => x.id === newApplicantId);
    return own?.docsCompleteAt && own.callAt ? complete(`Onboarding call booked · ${formatDateTime(own.callAt)}. Continue when ready.`) : own ? pending('Registration saved — continue with the document checklist.') : pending('Start application and enter demo details.');
  }
  if (key === 'queue') { const erik = queueTarget(data.apps); return erik?.decision ? complete('Erik rejected with the flagged reason.') : pending('Open the oldest deadline and act on its Next step.'); }
  if (key === 'criteria') return a?.decision ? complete(a.decision.type === 'rejected' ? 'Decision recorded: rejected. The first-drive step will explain why booking is unavailable.' : 'Ahmed accepted. Continue to his first drive.') : pending('Read the criteria, complete the required checks and record the decision.');
  if (key === 'activate') return a?.firstGig?.doneAt ? complete('Ahmed delivered the first drive and is active.') : a?.firstGig?.bookedFor ? pending('Booking recorded, not active yet. Open the job in Live Ops; use demo time and the driver’s normal controls through delivery.') : a?.decision?.type === 'rejected' ? pending('Ahmed was rejected; no offers can be booked. You can continue to the follow-up examples.') : !a?.decision ? pending('Complete Ahmed’s review decision before choosing a drive.') : pending('Choose a matching route using Pick this drive on Ahmed’s phone.');
  return { kind: 'explore', text: '' };
}
