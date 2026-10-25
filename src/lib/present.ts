import type { Applicant, Gig } from './types';
import { deriveStage } from './stage';
import { workItems } from './workQueue';
import type { Job } from './liveOps';
import { openIncidents } from './liveOps';

/** Presentation mode: five short steps through the case. The first four are the core; the report is optional. */
export type PresentKey = 'funnel' | 'review' | 'activate' | 'incident' | 'improve';

export interface PresentStep {
  key: PresentKey;
  title: string;
  /** What to say, in one or two short sentences. */
  say: string;
}

export const PRESENT_STEPS: PresentStep[] = [
  {
    key: 'funnel',
    title: 'The funnel problem',
    say: 'The case: 120 applications a month, 25 active. 30% never finish their documents, and a decision takes 6 days against a 48-hour target. The biggest drop-off is marked.',
  },
  {
    key: 'review',
    title: 'Review consistently',
    say: 'Written criteria: must-haves, borderline rules, and every reject with a reason code. A person decides. The extract is shown, never stored.',
  },
  {
    key: 'activate',
    title: 'Close the activation gap',
    say: "Accepted isn't the goal, active is. No first gig booked after 7 days: book one with them. After 14 days: call.",
  },
  {
    key: 'incident',
    title: 'Handle a live incident',
    say: 'Tuesday 09:30: Julia has waited 25 minutes and the keys are missing. Work the current step. The customer decides by 10:15.',
  },
  {
    key: 'improve',
    title: 'Measure and improve',
    say: 'Every click logs a timestamp or a reason code. That feeds four metrics every Monday and shows where to fix the process.',
  },
];

/** The file to open in step 2: Elin if she is still in review, else the most urgent file. */
export function reviewTarget(apps: Applicant[]): Applicant | null {
  const inReview = apps.filter((a) => deriveStage(a) === 'review');
  return inReview.find((a) => a.name === 'Elin Johansson') ?? [...inReview].sort((a, b) => a.docsCompleteAt! - b.docsCompleteAt!)[0] ?? null;
}

/** The driver to open in step 3: the accepted driver who most needs a push to a first gig. */
export function activationTarget(apps: Applicant[], gigs: Gig[], now: number): Applicant | null {
  const waiting = workItems(apps, gigs, now).filter((w) => w.stage === 'accepted');
  return (waiting.find((w) => w.needsAction) ?? waiting[0])?.a ?? null;
}

/** The pickup to open in step 4: the case, or else the most urgent open incident. */
export function incidentTarget(jobs: Job[], now: number): Job | null {
  return jobs.find((j) => j.asInCase) ?? openIncidents(jobs, now)[0] ?? null;
}
