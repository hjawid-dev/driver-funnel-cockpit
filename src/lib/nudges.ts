import type { Applicant, DocKey } from './types';
import { DAY, HOUR, formatDateTime, formatDuration } from './time';

/** Automatic reminders after registration: +2 h, +24 h, +72 h. */
export const NUDGE_OFFSETS = [2 * HOUR, 24 * HOUR, 72 * HOUR];
export const NO_RESPONSE_MS = 14 * DAY;

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
  const cutoff = Math.min(now, a.docsCompleteAt ?? Infinity);
  const scheduled = NUDGE_OFFSETS.map((o) => a.registeredAt + o).filter((t) => !reminderSilenced(a, t));
  const snooze = a.reminders?.snooze;
  if (snooze && !reminderSilenced({ ...a, reminders: { offAt: a.reminders?.offAt } }, snooze.until)) scheduled.push(snooze.until);
  scheduled.sort((x, y) => x - y);
  const autoSent = scheduled.filter((t) => t <= cutoff);
  const pending = a.docsCompleteAt ? [] : scheduled.filter((t) => t > now);
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
  return order.filter((k) => a.docs[k] === 'missing' || a.docs[k] === 'pending');
}

const ASK: Record<DocKey, { missing: string; pending: string }> = {
  extract: {
    missing: 'Order your own extract from the criminal record (belastningsregistret) at polisen.se. It takes a few days, so start today. You will show it to us in the onboarding call; we never keep a copy.',
    pending: 'Your extract is on its way from Polisen. Tell us when it arrives and we book your onboarding call, where you also show it. We never keep a copy.',
  },
  id: { missing: 'Verify your ID with BankID. It takes one minute.', pending: 'Finish your BankID verification.' },
  licence: { missing: 'Upload a photo of the front and back of your driving licence.', pending: 'Finish uploading your driving licence.' },
  photo: { missing: 'Upload a profile photo: face clearly visible, no sunglasses.', pending: 'Finish uploading your profile photo.' },
};

/** What the reminder says. In production it goes out through the driver chat. */
export function nudgeMessage(a: Applicant): string {
  const first = a.name.split(' ')[0];
  const items = outstandingDocs(a);
  if (!items.length) return `Hi ${first}, your file is complete. We'll review it within 48 hours.`;
  const lines = items.map((k) => `• ${ASK[k][a.docs[k] === 'pending' ? 'pending' : 'missing']}`);
  return [`Hi ${first}, you're almost ready for your first drive. ${items.length === 1 ? 'One thing left' : `${items.length} things left`}:`, ...lines].join('\n');
}

