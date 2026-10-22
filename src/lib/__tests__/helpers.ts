import type { Applicant } from '../types';
import { DAY } from '../time';

export const NOW = new Date('2026-10-22T10:00:00').getTime();

export function mk(over: Partial<Applicant> = {}): Applicant {
  return {
    id: 'DRV-0001',
    name: 'Test Person',
    area: 'Solna',
    licenceYears: 5,
    availability: 'full',
    registeredAt: NOW - 3 * DAY,
    docs: { licence: 'verified', id: 'verified', extract: 'ready', photo: 'uploaded' },
    nudges: [],
    log: [],
    ...over,
  };
}

/** Under review with a complete file, photo approved and extract shown: a clean accept. */
export function inReview(over: Partial<Applicant> = {}): Applicant {
  return mk({ docsCompleteAt: NOW - 3 * 3_600_000, photoApproved: true, extractShown: true, ...over });
}
