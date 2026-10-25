import type { Applicant, Gig, OpsActivationReason } from './types';
import { DAY, HOUR, formatDuration } from './time';
import { deriveStage } from './stage';
import { needsExtract } from './extract';
import { firstGigOffers } from './gigs';

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

/** Welcome call within 24 h of acceptance, only when no first drive was booked in the onboarding call. */
export type WelcomeCall =
  | { state: 'done'; at: number }
  | { state: 'not_needed'; label: string }
  | { state: 'due'; label: string }
  | { state: 'overdue'; label: string }
  | { state: 'missed'; label: string };

export function welcomeCallState(a: Applicant, now: number): WelcomeCall {
  if (a.welcomeCallAt) return { state: 'done', at: a.welcomeCallAt };
  // The first drive was booked (in the call or by the driver): nothing to chase.
  if (a.firstGig?.bookedFor) return { state: 'not_needed', label: 'Not needed' };
  // Dormant: the welcome call is no longer the next step; the monthly re-engagement batch is.
  if (activationBucket(a.decision!.at, now) === 'dormant') return { state: 'missed', label: 'Missed' };
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
  on_track: 'Accepted under 7 days ago. Target: first gig within 14 days.',
  book: '7–14 days since acceptance. Book a curated first gig now.',
  call: 'No gig in 14 days. Call the driver: still interested, what is in the way?',
  dormant: 'Over 30 days without a first gig. Marked dormant; re-engage in a monthly batch.',
};

// ---------- Why an accepted driver hasn't driven yet ----------

/**
 * One reason per accepted driver without a first drive, so the activation gap can be read:
 * is it the driver (declined, unreachable, not interested) or the demand (no job that fits)?
 * What ops learned on a call comes first; the rest is worked out from the data.
 */
export type ActivationReason = OpsActivationReason | 'booked' | 'extract' | 'no_fit' | 'not_picked';

export const ACTIVATION_REASON_LABEL: Record<ActivationReason, string> = {
  booked: 'First drive booked',
  extract: 'Extract not shown yet',
  no_fit: 'No job that fits',
  not_picked: 'Offered, none picked yet',
  declined: 'Declined the drives offered',
  unreachable: "Can't reach them",
  not_interested: 'No longer interested',
};

/** Shown in this order, so the demand reason and the driver reasons are easy to tell apart. */
export const ACTIVATION_REASON_ORDER: ActivationReason[] = ['booked', 'extract', 'no_fit', 'not_picked', 'declined', 'unreachable', 'not_interested'];

export function activationReason(a: Applicant, apps: Applicant[], gigs: Gig[], now: number): ActivationReason {
  if (a.activationReason) return a.activationReason.reason;
  if (a.firstGig?.bookedFor) return needsExtract(a) ? 'extract' : 'booked';
  if (!firstGigOffers(a, gigs, apps, now).length) return 'no_fit';
  if (needsExtract(a)) return 'extract';
  return 'not_picked';
}

export interface ReasonCount {
  reason: ActivationReason;
  label: string;
  count: number;
  ids: string[];
}

/** Every waiting driver in exactly one group, so the groups add up to the list. */
export function activationReasons(waiting: Applicant[], apps: Applicant[], gigs: Gig[], now: number): ReasonCount[] {
  const by = new Map<ActivationReason, string[]>();
  for (const a of waiting) {
    const r = activationReason(a, apps, gigs, now);
    by.set(r, [...(by.get(r) ?? []), a.id]);
  }
  return ACTIVATION_REASON_ORDER.filter((r) => by.has(r)).map((r) => ({ reason: r, label: ACTIVATION_REASON_LABEL[r], count: by.get(r)!.length, ids: by.get(r)! }));
}

// ---------- Supply and demand ----------

/** Assumption to set with the team: how many jobs one driver takes in 14 days. */
export const JOBS_PER_DRIVER_14D = 4;
export const DEMAND_WINDOW_MS = 14 * DAY;

export interface SupplyDemand {
  openJobs: number;
  driversNeeded: number;
  active: number;
  waiting: number;
  /** More drivers than the open jobs keep busy: the activation gap is partly demand, so recruit to demand. */
  oversupplied: boolean;
}

/** Open jobs in the next 14 days against the drivers we have: recruit to demand, not to a number. */
export function supplyDemand(apps: Applicant[], gigs: Gig[], now: number): SupplyDemand {
  const openJobs = gigs.filter((g) => g.at > now && g.at <= now + DEMAND_WINDOW_MS).length;
  const driversNeeded = Math.ceil(openJobs / JOBS_PER_DRIVER_14D);
  const stages = apps.map(deriveStage);
  const active = stages.filter((s) => s === 'active').length;
  const waiting = stages.filter((s) => s === 'accepted').length;
  return { openJobs, driversNeeded, active, waiting, oversupplied: active + waiting > driversNeeded };
}
