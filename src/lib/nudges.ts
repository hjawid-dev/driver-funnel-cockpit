import type { Applicant, DocKey } from './types';
import { DAY, HOUR, MIN, formatDateTime, formatDuration } from './time';
import { nextReviewSlot } from './sla';

/** Automatic reminders after registration: +2 h, +24 h and day 7. Then a person, not more messages. */
export const NUDGE_OFFSETS = [2 * HOUR, 24 * HOUR, 7 * DAY];
export const NO_RESPONSE_MS = 14 * DAY;
/** Reminders are never sent at night: 20:00–09:00 waits until 09:00. */
export const QUIET_FROM = 20;
export const QUIET_TO = 9;
/** At most one reminder in any 12 hours. */
const MIN_GAP = 12 * HOUR;

/** A time inside quiet hours moves to 09:00; any other time is kept. */
export function outsideQuietHours(t: number): number {
  const d = new Date(t);
  const h = d.getHours();
  if (h >= QUIET_TO && h < QUIET_FROM) return t;
  if (h >= QUIET_FROM) d.setDate(d.getDate() + 1);
  d.setHours(QUIET_TO, 0, 0, 0);
  return d.getTime();
}

/**
 * When the scheduled reminders go out for this applicant: 2 h, 24 h and day 7 after registering,
 * never at night, at least 12 h apart, and moved on while the driver is making progress, so nobody
 * is reminded about a file they are working on. Documents sent with the application itself do not count.
 */
export function reminderTimes(a: Applicant): number[] {
  const progress = Object.values(a.docTimes ?? {}).filter((t): t is number => typeof t === 'number' && t > a.registeredAt + 30 * MIN);
  const out: number[] = [];
  let prev = -Infinity;
  NUDGE_OFFSETS.forEach((o, i) => {
    let t = Math.max(a.registeredAt + o, prev + MIN_GAP);
    // Progress restarts the wait: the same interval as the schedule (2 h, then 22 h, then 6 days).
    const last = Math.max(-Infinity, ...progress.filter((p) => p > prev && p < t));
    if (last > -Infinity) t = Math.max(t, last + o - (NUDGE_OFFSETS[i - 1] ?? 0));
    t = outsideQuietHours(t);
    out.push(t);
    prev = t;
  });
  return out;
}

/**
 * If documents are still missing after the second reminder, the owner calls once: in the first
 * review block at least 3 h after it, which leaves time to finish before the 48-hour target.
 */
export function ownerCallAt(a: Applicant): number {
  return nextReviewSlot(reminderTimes(a)[1] + 3 * HOUR).at;
}

/** The owner has called (logged as a manual follow-up after the second reminder). */
export function ownerCalled(a: Applicant): boolean {
  const second = reminderTimes(a)[1];
  return a.nudges.some((t) => t >= second);
}

export interface NudgeState {
  autoSent: number[]; // scheduled nudges that have fired
  manual: number[]; // "Send nudge now"
  total: number;
  nextAt: number | null;
  label: string; // "Next nudge in 5 h" / "All nudges sent"
}

/** Is a scheduled reminder at time t silenced by the driver's own choice in the chat? */
export function reminderSilenced(a: Applicant, t: number): boolean {
  const r = a.reminders;
  if (!r) return false;
  if (r.offAt !== undefined && t >= r.offAt) return true;
  return !!r.snooze && t > r.snooze.at && t < r.snooze.until;
}

export function nudgeState(a: Applicant, now: number): NudgeState {
  // Scheduled nudges stop once the file is complete, or when the driver pauses or stops them.
  const cutoff = Math.min(now, a.firstDocsSubmittedAt ?? a.docsCompleteAt ?? Infinity, a.decision?.at ?? Infinity);
  const scheduled = reminderTimes(a).filter((t) => !reminderSilenced(a, t));
  const snooze = a.reminders?.snooze;
  if (snooze && !reminderSilenced({ ...a, reminders: { offAt: a.reminders?.offAt } }, snooze.until)) scheduled.push(snooze.until);
  scheduled.sort((x, y) => x - y);
  const autoSent = scheduled.filter((t) => t <= cutoff);
  const pending = a.firstDocsSubmittedAt || a.docsCompleteAt || a.decision ? [] : scheduled.filter((t) => t > now);
  const nextAt = pending[0] ?? null;
  const stopped = a.reminders?.offAt !== undefined && a.reminders.offAt <= now;
  const label = stopped
    ? 'Driver stopped reminders in the chat'
    : nextAt
      ? snooze && nextAt === snooze.until
        ? `Driver asked for a reminder ${formatDateTime(nextAt)}`
        : `Next nudge in ${formatDuration(nextAt - now)}`
      : 'All nudges sent';
  return { autoSent, manual: [...a.nudges], total: autoSent.length + a.nudges.length, nextAt, label };
}

/** Registered more than 14 days ago and the file is still incomplete. */
export function isNoResponse(a: Applicant, now: number): boolean {
  return !a.docsCompleteAt && !a.decision && now - a.registeredAt > NO_RESPONSE_MS;
}


/** Items still outstanding, the extract first (slowest to arrive, so it gets asked for first). */
export function outstandingDocs(a: Applicant): DocKey[] {
  const order: DocKey[] = ['extract', 'id', 'licence', 'photo'];
  return order.filter((k) => a.docs[k] === 'missing' || (k !== 'extract' && a.docs[k] === 'pending'));
}

const ASK: Record<DocKey, { missing: string; pending: string }> = {
  extract: {
    missing: 'Order your own extract from the criminal record (belastningsregistret) at polisen.se. Processing can take two weeks plus post, so start early. Show it in the onboarding call if it has arrived, otherwise in a short check before your first drive. Do not wait for it to book your call. We never keep a copy.',
    pending: 'Your extract is on its way. Book your onboarding call now; show the extract before your first drive, without sending a copy; we never keep a copy.',
  },
  id: { missing: 'Verify your ID with BankID or submit ID for manual review.', pending: 'Finish BankID verification or contact Ops about manual ID review.' },
  licence: { missing: 'Upload a photo of the front and back of your driving licence.', pending: 'Finish uploading your driving licence.' },
  photo: { missing: 'Upload a profile photo: face clearly visible, no sunglasses.', pending: 'Finish uploading your profile photo.' },
};

/** What the reminder says. In production it goes out through the driver chat. */
export function nudgeMessage(a: Applicant): string {
  const first = a.name.split(' ')[0];
  const items = outstandingDocs(a);
  if (!items.length) return `Hi ${first}, your file is complete. Your original decision deadline is ${formatDateTime(a.registeredAt + 48 * HOUR)}; completing documents does not restart the clock.`;
  const lines = items.map((k) => `• ${ASK[k][a.docs[k] === 'pending' ? 'pending' : 'missing']}`);
  return [`Hi ${first}, you're almost ready for your first drive. ${items.length === 1 ? 'One thing left' : `${items.length} things left`}:`, ...lines].join('\n');
}

