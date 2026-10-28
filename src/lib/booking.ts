import type { Applicant } from './types';
import { reviewHoursOn } from './sla';
import { MIN, atLocal } from './time';

/** Onboarding calls are 15 minutes, inside the fixed review slots (09:00 and 14:00 on weekdays, 10:00 at weekends). Extract checks use the same times. */
export const CALL_MINUTES = 15;
const CALLS_PER_SLOT = 4;

/** Free call times from 30 minutes ahead, over the next two weeks. */
export function callSlots(now: number, apps: Applicant[], limit = 8): number[] {
  const booked = new Set(apps.flatMap((a) => [a.callAt, a.extractCheckAt]).filter(Boolean));
  const out: number[] = [];
  for (let d = 0; d < 14 && out.length < limit; d++) {
    const day = new Date(atLocal(now, d, 12)).getDay();
    for (const h of reviewHoursOn(day)) {
      for (let i = 0; i < CALLS_PER_SLOT; i++) {
        const t = atLocal(now, d, h, i * CALL_MINUTES);
        if (t > now + 30 * MIN && !booked.has(t) && out.length < limit) out.push(t);
      }
    }
  }
  return out;
}
