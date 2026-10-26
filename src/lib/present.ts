import type { Applicant, Gig } from './types';
import { deriveStage } from './stage';
import { workItems } from './workQueue';
import type { Job } from './liveOps';
import { needsConfirmation, needsSiteCall, openIncidents, siteCallDue } from './liveOps';

/**
 * Presentation mode: the case in its own order, Part 1 first. Each part shows the problem, then the
 * fixes, one screen each: the playbook and the checks that prevent it; then documents, review,
 * criteria and activation.
 */
export type PresentKey = 'incident' | 'playbook' | 'prevent' | 'sitecall' | 'funnel' | 'docs' | 'queue' | 'review' | 'activate';

export interface PresentStep {
  key: PresentKey;
  part: 1 | 2;
  /** Problem or fix: the label above the title. */
  kind: 'Problem' | 'Fix';
  title: string;
  /** What to say, in one short sentence. */
  say: string;
}

export const PRESENT_STEPS: PresentStep[] = [
  { key: 'incident', part: 1, kind: 'Problem', title: 'A driver is stuck at the pickup', say: 'Delivery by 12:00, for a pilot customer.' },
  { key: 'playbook', part: 1, kind: 'Fix', title: 'Work the playbook', say: 'Fixed steps, a clock, and the customer decides by 10:15 (proposed).' },
  { key: 'prevent', part: 1, kind: 'Fix', title: 'Check every pickup in advance', say: 'A text the day before and an hour before. No reply: call the backup.' },
  { key: 'sitecall', part: 1, kind: 'Fix', title: 'Call new sites and pilots the day before', say: 'Who hands over the keys, and where.' },
  { key: 'funnel', part: 2, kind: 'Problem', title: '120 applications, 25 active drivers', say: '30% never finish their documents. A decision takes 6 days, not 48 h.' },
  { key: 'docs', part: 2, kind: 'Fix', title: 'Three reminders, then a person', say: 'Each says exactly what is missing.' },
  { key: 'queue', part: 2, kind: 'Fix', title: 'Decide within 48 hours', say: 'Two fixed review slots a day. Every file shows its time left.' },
  { key: 'review', part: 2, kind: 'Fix', title: 'The same written criteria for everyone', say: 'Only decisions the rules allow. A person decides.' },
  { key: 'activate', part: 2, kind: 'Fix', title: 'From accepted to active', say: 'Proposed: book a first gig at 7 days, call at 14.' },
];

/** The file to open in the review step: Elin if she is still in review, else the most urgent file. */
export function reviewTarget(apps: Applicant[]): Applicant | null {
  const inReview = apps.filter((a) => deriveStage(a) === 'review');
  return inReview.find((a) => a.name === 'Elin Johansson') ?? [...inReview].sort((a, b) => a.docsCompleteAt! - b.docsCompleteAt!)[0] ?? null;
}

/** The driver to open in the activation step: the accepted driver who most needs a push to a first gig. */
export function activationTarget(apps: Applicant[], gigs: Gig[], now: number): Applicant | null {
  const waiting = workItems(apps, gigs, now).filter((w) => w.stage === 'accepted');
  return (waiting.find((w) => w.needsAction) ?? waiting[0])?.a ?? null;
}

/** The pickup to open in Part 1: the case, or else the most urgent open incident. */
export function incidentTarget(jobs: Job[], now: number): Job | null {
  return jobs.find((j) => j.asInCase) ?? openIncidents(jobs, now)[0] ?? null;
}

/** The pickup for the check step: one where nobody answered the text, so ops calls the backup. */
export function checkTarget(jobs: Job[], now: number): Job | null {
  return jobs.find((j) => needsConfirmation(j, now) && !needsSiteCall(j)) ?? jobs.find((j) => needsConfirmation(j, now)) ?? null;
}

/** The pickup for the site-call step: a new address or a pilot customer, due a call today. */
export function siteCallTarget(jobs: Job[], now: number): Job | null {
  return jobs.find((j) => siteCallDue(j, now)) ?? null;
}

/** The file for the documents step: Nora if she still has documents missing, else the most urgent incomplete file. */
export function docsTarget(apps: Applicant[], gigs: Gig[], now: number): Applicant | null {
  const missing = workItems(apps, gigs, now).filter((w) => w.stage === 'registered');
  return (missing.find((w) => w.a.name === 'Nora Axelsson') ?? missing.find((w) => w.needsAction) ?? missing[0])?.a ?? null;
}
