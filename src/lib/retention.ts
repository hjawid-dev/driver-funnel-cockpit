import type { Applicant } from './types';
import { deriveStage } from './stage';
import { DAY } from './time';

/**
 * Storage limitation (GDPR art. 5.1 e). Starting proposal, to be set with a DPO:
 * - incomplete applications: deleted 6 months after registration
 * - rejected or closed: deleted 2 years after the decision (discrimination claims must be
 *   brought within two years)
 * - open files and active drivers: kept while the relationship lasts; payment records follow
 *   the bookkeeping rules (7 years) in the payroll system, not here
 */
export const INCOMPLETE_RETENTION_DAYS = 183;
export const REJECTED_RETENTION_DAYS = 730;

export interface Retention {
  deleteAt: number | null;
  label: string;
}

export function retention(a: Applicant): Retention {
  const stage = deriveStage(a);
  if (stage === 'rejected') {
    return { deleteAt: a.decision!.at + REJECTED_RETENTION_DAYS * DAY, label: 'Deleted 2 years after the decision' };
  }
  if (stage === 'registered') {
    return { deleteAt: a.registeredAt + INCOMPLETE_RETENTION_DAYS * DAY, label: 'Deleted 6 months after registration if still incomplete' };
  }
  if (stage === 'active') return { deleteAt: null, label: 'Kept while driving with us' };
  return { deleteAt: null, label: 'Kept while the application is open' };
}
