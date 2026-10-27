import { incidentClock, pickupReadinessErrors, assisting, driverStatus, jobAlert, needsConfirmation, PLAYBOOK, type Job, type PlaybookStep } from './liveOps';

/**
 * One operational state per pickup, so the list can put exceptions first:
 * a person needed, a decision to close, the assistant on it, a check to make; then routine; then done.
 */
export type OpsState = 'needs_person' | 'to_close' | 'issue' | 'check_due' | 'upcoming' | 'at_pickup' | 'on_the_way' | 'resolved' | 'delivered';

export const OPS_STATE_LABEL: Record<OpsState, string> = {
  needs_person: 'Needs a person',
  to_close: 'Decided · close it',
  issue: 'Issue reported',
  check_due: 'Check needed',
  upcoming: 'Upcoming',
  at_pickup: 'At pickup',
  on_the_way: 'On the way',
  resolved: 'Resolved',
  delivered: 'Delivered',
};

export type OpsGroup = 'attention' | 'routine' | 'done';

export const OPS_GROUP: Record<OpsState, OpsGroup> = {
  needs_person: 'attention',
  to_close: 'attention',
  issue: 'attention',
  check_due: 'attention',
  upcoming: 'routine',
  at_pickup: 'routine',
  on_the_way: 'routine',
  resolved: 'done',
  delivered: 'done',
};

const RANK: Record<OpsState, number> = { needs_person: 0, to_close: 1, issue: 2, check_due: 3, at_pickup: 4, on_the_way: 5, upcoming: 6, resolved: 7, delivered: 8 };

export function opsState(j: Job, now: number): OpsState {
  if (j.incident?.rebooking?.status === 'open' && j.incident.closedAt !== undefined && j.incident.closedAt <= now) return 'check_due';
  if (pickupReadinessErrors(j).length) return 'check_due';
  if (now > j.deadline && !j.deliveredAt && !(j.incident?.closedAt && j.incident.outcome?.type !== 'keys_found')) return 'needs_person';
  const alert = jobAlert(j, now);
  if (alert) return j.incident?.outcome ? 'to_close' : 'needs_person';
  if (assisting(j, now)) return 'issue';
  const s = driverStatus(j, now);
  if (s === 'delivered') return 'delivered';
  if (j.incident?.closedAt !== undefined && j.incident.closedAt <= now && j.incident.outcome?.type !== 'keys_found') return 'resolved';
  if (s === 'driving') return 'on_the_way';
  if (s === 'arrived' || s === 'keys') return 'at_pickup';
  if (needsConfirmation(j, now)) return 'check_due';
  return 'upcoming';
}

/** Exceptions first, then by pickup time. */
export function byOpsPriority(jobs: Job[], now: number): Job[] {
  return [...jobs].sort((a, b) => RANK[opsState(a, now)] - RANK[opsState(b, now)] || a.pickupAt - b.pickupAt);
}

/** The playbook step to do now on an open incident: the first one not done. Null when only closing is left, or nothing. */
export function currentStep(j: Job, now?: number): PlaybookStep | null {
  if (j.incident?.outcome) return j.incident.closedAt !== undefined ? null : PLAYBOOK.find(s => s.key === (j.incident?.rebooking?.status === 'open' ? 'decide' : 'close'))!;
  if (now !== undefined && !j.incident?.outcome && now >= incidentClock(j, now).decideBy) return PLAYBOOK.find(s => s.key === 'decide')!;
  const steps = j.incident?.steps ?? {};
  return PLAYBOOK.find((s) => !steps[s.key] && !(s.key === 'decide' && j.incident?.outcome)) ?? null;
}

/** The pickup to open first: the most urgent one. */
export function firstToOpen(jobs: Job[], now: number): Job | null {
  return byOpsPriority(jobs, now)[0] ?? null;
}
