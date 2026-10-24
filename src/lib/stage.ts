import type { Applicant, DocStatus, Stage } from './types';
import { DOC_KEYS } from './types';

/** Stage is derived, never stored. */
export function deriveStage(a: Applicant): Stage {
  // Closed because it was never finished: not a decision on the applicant, so it is not counted as a rejection.
  if (a.decision?.type === 'rejected') return a.decision.reason === 'no_response_14d' ? 'closed' : 'rejected';
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

/**
 * Where someone is now. Deliberately not the funnel tiles' words ("Registered", "Accepted"),
 * which count everyone who ever got that far: one word, one meaning.
 */
export const STAGE_LABEL: Record<Stage, string> = {
  registered: 'Missing documents',
  review: 'In review',
  accepted: 'Awaiting first gig',
  active: 'Active',
  rejected: 'Rejected',
  closed: 'Closed, not finished',
};
