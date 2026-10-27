import type { Applicant } from './types';
import { REVIEWER } from './types';
import { deriveStage, isAccepted } from './stage';
import { DAY, HOUR, formatDateTime } from './time';
import type { ActionResult } from './actions';

/**
 * The criminal-record extract, after a decision with a condition.
 *
 * The extract a driver can get ("kontroll av egna uppgifter") only comes by post and can take up
 * to two weeks, and Polisen advises showing it only after an offer. So we decide within 48 hours
 * without waiting for it, and the driver shows it before the first drive: in the onboarding call
 * if it has already arrived, otherwise in a 5-minute check in the same review slots.
 *
 * Showing it is voluntary. We look at it, hand it back and note only that it was shown
 * (AD 2026 nr 27). Nothing from it is stored.
 */
export const CHECK_MINUTES = 5;
/** Shown at the latest the day before the first drive, or the drive goes to another driver. */
export const SHOW_BY_MS = 24 * HOUR;
/** Before the extract is shown, first drives are offered from 5 days ahead, as a planning floor, not a guarantee of postal arrival. */
export const OFFER_LEAD_MS = 5 * DAY;

export type ExtractState = 'shown' | 'check_booked' | 'ready' | 'ordered' | 'missing';

/** A booked check counts until two hours after its time; after that, unticked, it was missed and the driver books again. */
export const CHECK_GRACE_MS = 2 * HOUR;

export function checkMissed(a: Applicant, now: number): boolean {
  return !a.extractShown && a.extractCheckAt !== undefined && a.extractCheckAt <= now - CHECK_GRACE_MS;
}

export function extractState(a: Applicant, now = -Infinity): ExtractState {
  if (a.extractShown) return 'shown';
  if (a.docs.extract === 'ready') return a.extractCheckAt && !checkMissed(a, now) ? 'check_booked' : 'ready';
  if (a.docs.extract === 'pending') return 'ordered';
  return 'missing';
}

export const EXTRACT_STATE_LABEL: Record<ExtractState, string> = {
  shown: 'Shown',
  check_booked: 'Check booked',
  ready: 'Arrived, check not booked',
  ordered: 'Ordered, not arrived',
  missing: 'Not ordered',
};

/** Accepted, but the extract hasn't been shown yet: the one thing between the driver and a first drive. */
export function needsExtract(a: Applicant): boolean {
  return deriveStage(a) === 'accepted' && isAccepted(a) && !a.extractShown;
}

/** The latest time to show the extract: the day before the booked first drive. */
export function showBy(a: Applicant): number | null {
  return a.firstGig?.bookedFor ? a.firstGig.bookedFor - SHOW_BY_MS : null;
}

/** Earliest start for a first drive this driver can take: soon once the extract is shown, otherwise 5 days ahead. */
export function earliestFirstDrive(a: Applicant, now: number): number {
  return now + (needsExtract(a) ? OFFER_LEAD_MS : 12 * HOUR);
}

const withLog = (a: Applicant, at: number, text: string): Applicant => ({ ...a, log: [...a.log, { at, text }] });

/** The driver books the 5-minute check, once the extract has arrived. */
export function bookExtractCheck(a: Applicant, at: number, now: number): ActionResult {
  if (!needsExtract(a)) return { ok: false, error: 'The extract check is only for accepted drivers who haven\'t shown it yet.' };
  if (a.docs.extract !== 'ready') return { ok: false, error: 'Book the check when the extract has arrived.' };
  const moved = !!a.extractCheckAt;
  return {
    ok: true,
    applicant: withLog({ ...a, extractCheckAt: at }, now, `Extract check ${moved ? 'moved to' : 'booked for'} ${formatDateTime(at)} (5 min, video)`),
    message: `Extract check ${moved ? 'moved to' : 'booked for'} ${formatDateTime(at)}.`,
  };
}

/** Only the fact that the extract was shown is recorded, never what it said. */
export function markExtractShown(a: Applicant, shown: boolean, now: number): Applicant {
  if (!shown) {
    const { extractShownAt: _t, ...rest } = a;
    return withLog({ ...rest, extractShown: false }, now, 'Extract tick removed');
  }
  const where = deriveStage(a) === 'review' ? 'in the onboarding call' : 'in the extract check';
  return withLog({ ...a, extractShown: true, extractShownAt: now }, now, `Extract shown ${where}, seen by ${REVIEWER} (nothing stored)`);
}

/**
 * A booked first drive whose extract wasn't shown by the day before goes back to the pool, so the
 * customer's job still gets a driver. The driver keeps their acceptance and can pick a new drive.
 */
export function releaseIfUnchecked(a: Applicant, now: number): Applicant | null {
  const by = showBy(a);
  if (!needsExtract(a) || by === null || a.firstGig?.doneAt || now < by) return null;
  const { gigId: _g, bookedFor, ...rest } = a.firstGig!;
  return withLog(
    { ...a, events: [...(a.events ?? []), { kind: 'released', at: by, by: 'system', reason: 'pre_drive_check_not_completed' }], firstGig: { ...rest, released: { at: by, bookedFor: bookedFor! } } },
    by,
    `First drive ${formatDateTime(bookedFor!)} released: the extract wasn't shown by the day before`,
  );
}

/** Every applicant whose first drive must be released now. */
export function releaseDue(apps: Applicant[], now: number): Applicant[] {
  return apps.map((a) => releaseIfUnchecked(a, now)).filter((a): a is Applicant => !!a);
}
