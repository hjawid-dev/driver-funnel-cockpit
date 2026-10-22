import type { Applicant, DocStatus, Stage } from './types';
import { DOC_KEYS } from './types';

/** Stage is derived, never stored. */
export function deriveStage(a: Applicant): Stage {
  if (a.decision?.type === 'rejected') return 'rejected';
  if (a.firstGig?.doneAt) return 'active';
  if (a.decision) return 'accepted';
  if (a.docsCompleteAt) return 'review';
  return 'registered';
}

/** A document counts as submitted once it is in our hands, whatever its result. */
export function isSubmitted(s: DocStatus): boolean {
  return s !== 'missing' && s !== 'pending';
}

export function allDocsSubmitted(a: Applicant): boolean {
  return DOC_KEYS.every((k) => isSubmitted(a.docs[k]));
}

export function isAccepted(a: Applicant): boolean {
  return !!a.decision && a.decision.type !== 'rejected';
}

export const STAGE_LABEL: Record<Stage, string> = {
  registered: 'Registered',
  review: 'Under review',
  accepted: 'Accepted',
  active: 'Active',
  rejected: 'Rejected',
};
