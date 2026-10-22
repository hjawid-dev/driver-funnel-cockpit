import type { Applicant } from './types';
import { DAY, HOUR, formatDuration } from './time';

export type ActivationBucket = 'on_track' | 'book' | 'call' | 'dormant';

export const ACTIVATION_LABEL: Record<ActivationBucket, string> = {
  on_track: 'On track',
  book: 'Book first gig',
  call: 'Call driver',
  dormant: 'Dormant',
};

/** Accepted, no first gig yet: 0–7 d on track · 7–14 d book · 14–30 d call · > 30 d dormant. */
export function activationBucket(acceptedAt: number, now: number): ActivationBucket {
  const d = (now - acceptedAt) / DAY;
  if (d < 7) return 'on_track';
  if (d < 14) return 'book';
  if (d < 30) return 'call';
  return 'dormant';
}

export interface ActivationFlags {
  simpleDrivesFirst: boolean;
  activationFollowUp: boolean;
}

export function activationFlags(a: Applicant): ActivationFlags {
  return {
    simpleDrivesFirst: a.decision?.type === 'accepted_simple',
    activationFollowUp: a.decision?.type === 'accepted_flagged' || (!!a.decision && a.availability === 'limited'),
  };
}

/** Welcome call within 24 h of acceptance. */
export type WelcomeCall = { state: 'done'; at: number } | { state: 'due'; label: string } | { state: 'overdue'; label: string };

export function welcomeCallState(a: Applicant, now: number): WelcomeCall {
  if (a.welcomeCallAt) return { state: 'done', at: a.welcomeCallAt };
  const due = a.decision!.at + 24 * HOUR;
  return due > now ? { state: 'due', label: `Due in ${formatDuration(due - now)}` } : { state: 'overdue', label: `Overdue ${formatDuration(now - due)}` };
}

const PRIORITY: Record<ActivationBucket, number> = { call: 0, book: 1, on_track: 2, dormant: 3 };

/** Work order: call first, then book, then on track; dormant last. Oldest acceptance first within each. */
export function byActivationPriority(now: number) {
  return (a: Applicant, b: Applicant) => {
    const pa = PRIORITY[activationBucket(a.decision!.at, now)];
    const pb = PRIORITY[activationBucket(b.decision!.at, now)];
    return pa - pb || a.decision!.at - b.decision!.at;
  };
}

export const ACTIVATION_RULE: Record<ActivationBucket, string> = {
  on_track: 'Accepted under 7 days ago. Target: first gig within 7 days.',
  book: '7–14 days since acceptance. Book a curated first gig now.',
  call: 'No gig in 14 days. Call the driver: still interested, what is in the way?',
  dormant: 'Over 30 days without a first gig. Marked dormant; re-engage in a monthly batch.',
};
