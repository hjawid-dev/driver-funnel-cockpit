import type { Applicant } from './types';
import { HOUR, formatHours } from './time';

export const SLA_HOURS = 48;

export type SlaBucket = 'ok' | 'warn' | 'overdue';

export interface Sla {
  bucket: SlaBucket;
  elapsedMs: number;
  remainingMs: number; // negative when overdue
  label: string; // "31 h left" / "Overdue 3 h"
}

/** Total decision SLA: 48 calendar hours from registration to decision. < 24 h green, 24–48 h amber, > 48 h red. */
export function slaStatus(docsCompleteAt: number, now: number): Sla {
  const elapsedMs = Math.max(0, now - docsCompleteAt);
  const remainingMs = SLA_HOURS * HOUR - elapsedMs;
  const bucket: SlaBucket = elapsedMs < 24 * HOUR ? 'ok' : remainingMs >= 0 ? 'warn' : 'overdue';
  const label = remainingMs >= 0 ? `${formatHours(remainingMs)} left` : `Overdue ${formatHours(-remainingMs)}`;
  return { bucket, elapsedMs, remainingMs, label };
}

/** Review queue order: most urgent (least time left) first. */
export function byUrgency(a: Applicant, b: Applicant): number {
  return a.registeredAt - b.registeredAt;
}

/** Two fixed review slots a day. */
export const REVIEW_SLOTS = [9, 14];

/** Next review slot from now: { at, label: "14:00 today" | "09:00 tomorrow" }. */
export function nextReviewSlot(now: number): { at: number; time: string; day: 'today' | 'tomorrow'; label: string } {
  const d = new Date(now);
  for (const h of REVIEW_SLOTS) {
    const slot = new Date(d);
    slot.setHours(h, 0, 0, 0);
    if (slot.getTime() > now) return { at: slot.getTime(), time: `${pad(h)}:00`, day: 'today', label: `${pad(h)}:00 today` };
  }
  const slot = new Date(d);
  slot.setDate(slot.getDate() + 1);
  slot.setHours(REVIEW_SLOTS[0], 0, 0, 0);
  return { at: slot.getTime(), time: `${pad(REVIEW_SLOTS[0])}:00`, day: 'tomorrow', label: `${pad(REVIEW_SLOTS[0])}:00 tomorrow` };
}

const pad = (n: number) => String(n).padStart(2, '0');
