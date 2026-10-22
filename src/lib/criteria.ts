import type { Applicant, DecisionType, RejectReason } from './types';
import { deriveStage } from './stage';
import { isNoResponse } from './nudges';

/**
 * Written review criteria, three tiers.
 * Thresholds are a starting proposal, to be set with the team.
 */
export const MIN_LICENCE_YEARS = 2;
export const BORDERLINE_LICENCE_YEARS = 1;

export type CheckResult = 'pass' | 'fail' | 'borderline' | 'manual';

export interface MustHave {
  key: 'licence' | 'id' | 'background' | 'photo';
  label: string;
  result: CheckResult;
  detail: string;
}

export type BorderlineKey = 'licence_1_2' | 'minor_violation' | 'limited_availability';

export interface BorderlineRule {
  key: BorderlineKey;
  chip: string;
  rule: string;
}

export interface Evaluation {
  mustHaves: MustHave[];
  borderline: BorderlineRule[];
  /** The one accept variant the written rules allow for this applicant. */
  acceptType: Exclude<DecisionType, 'rejected'>;
  /** Why accepting is not possible yet. Empty = accept allowed. */
  acceptBlockedBy: string[];
  needsSecondReviewer: boolean;
  /** Pre-selected reason when a must-have fails. */
  suggestedReject?: RejectReason;
}

export function evaluate(a: Applicant): Evaluation {
  const y = a.licenceYears;
  const licence: MustHave = {
    key: 'licence',
    label: `B licence held ≥ ${MIN_LICENCE_YEARS} years`,
    ...(a.docs.licence === 'failed'
      ? { result: 'fail', detail: 'Licence revoked or invalid' }
      : a.docs.licence === 'missing' || a.docs.licence === 'pending'
        ? { result: 'fail', detail: 'Licence not submitted' }
        : y >= MIN_LICENCE_YEARS
          ? { result: 'pass', detail: `${fmtYears(y)} held` }
          : y >= BORDERLINE_LICENCE_YEARS
            ? { result: 'borderline', detail: `${fmtYears(y)} held: borderline rule applies` }
            : { result: 'fail', detail: `${fmtYears(y)} held: under 1 year` }),
  };

  const id: MustHave = {
    key: 'id',
    label: 'ID verified via personnummer (BankID)',
    ...(a.docs.id === 'verified'
      ? { result: 'pass', detail: 'Verified with BankID' }
      : { result: 'fail', detail: a.docs.id === 'missing' ? 'ID not submitted' : 'ID could not be verified' }),
  };

  const background: MustHave = {
    key: 'background',
    label: 'Clean background check',
    ...(a.docs.background === 'verified'
      ? { result: 'pass', detail: 'Extract from Polisen, no remarks' }
      : a.docs.background === 'remark'
        ? { result: 'fail', detail: a.docNote?.background ?? 'Extract has a remark' }
        : a.docs.background === 'failed'
          ? { result: 'fail', detail: 'Background check failed' }
          : { result: 'fail', detail: 'Background check not received' }),
  };

  const photo: MustHave = {
    key: 'photo',
    label: 'Profile photo meets standard',
    ...(a.docs.photo === 'missing' || a.docs.photo === 'pending'
      ? { result: 'fail', detail: 'Photo not submitted' }
      : a.photoApproved
        ? { result: 'pass', detail: 'Checked by reviewer' }
        : a.docs.photo === 'remark'
          ? { result: 'manual', detail: a.docNote?.photo ?? 'Photo has a remark: check before accepting' }
          : { result: 'manual', detail: 'Reviewer must check the photo' }),
  };

  const borderline: BorderlineRule[] = [];
  if (y >= BORDERLINE_LICENCE_YEARS && y < MIN_LICENCE_YEARS) {
    borderline.push({
      key: 'licence_1_2',
      chip: `Licence ${fmtYears(y)}`,
      rule: 'Licence held 1–2 years → accept for simple drives first',
    });
  }
  if (a.violations === 'minor') {
    borderline.push({
      key: 'minor_violation',
      chip: 'Minor violation',
      rule: 'Minor traffic violation → owner + backup decide together',
    });
  }
  if (a.availability === 'limited') {
    borderline.push({
      key: 'limited_availability',
      chip: 'Limited availability',
      rule: 'Limited availability → accept, flag for activation follow-up',
    });
  }

  const mustHaves = [licence, id, background, photo];
  const acceptBlockedBy = mustHaves
    .filter((m) => m.result === 'fail' || m.result === 'manual')
    .map((m) => (m.result === 'manual' ? `${m.label}: not checked yet` : `${m.label}: ${m.detail}`));

  const has = (k: BorderlineKey) => borderline.some((b) => b.key === k);
  const acceptType = has('licence_1_2') ? 'accepted_simple' : has('limited_availability') ? 'accepted_flagged' : 'accepted';

  let suggestedReject: RejectReason | undefined;
  if (background.result === 'fail') suggestedReject = 'background_failed';
  else if (licence.result === 'fail') suggestedReject = 'licence_too_new';
  else if (id.result === 'fail') suggestedReject = 'id_unverified';

  return {
    mustHaves,
    borderline,
    acceptType,
    acceptBlockedBy,
    needsSecondReviewer: has('minor_violation'),
    suggestedReject,
  };
}

export interface DecisionInput {
  type: DecisionType;
  reason?: RejectReason;
  note?: string;
  secondReviewer?: string;
}

/** Returns an error message, or null when the decision is allowed. */
export function validateDecision(a: Applicant, input: DecisionInput, now: number): string | null {
  const stage = deriveStage(a);

  if (input.type === 'rejected') {
    if (!input.reason) return 'Pick a reason code to reject.';
    if (input.reason === 'other' && !input.note?.trim()) return '"Other" needs a note.';
    if (input.reason === 'no_response_14d') {
      if (stage !== 'registered' || !isNoResponse(a, now)) return 'Only incomplete files older than 14 days can be closed as no response.';
      return null;
    }
    if (stage !== 'review') return 'Only applicants under review can be decided.';
    return null;
  }

  if (stage !== 'review') return 'Only applicants under review can be decided.';
  const ev = evaluate(a);
  if (ev.acceptBlockedBy.length) return `Can't accept: ${ev.acceptBlockedBy[0]}.`;
  if (input.type !== ev.acceptType) return `The written rules call for "${DECISION_LABEL[ev.acceptType]}" here.`;
  if (ev.needsSecondReviewer && !input.secondReviewer?.trim()) return 'Minor violation: a second reviewer must confirm.';
  return null;
}

export const DECISION_LABEL: Record<DecisionType, string> = {
  accepted: 'Accept',
  accepted_simple: 'Accept: simple drives first',
  accepted_flagged: 'Accept + flag activation',
  rejected: 'Reject',
};

/** Chips for the review queue row. */
export interface Chip {
  label: string;
  tone: 'info' | 'warn' | 'bad';
}

export function reviewChips(a: Applicant): Chip[] {
  const ev = evaluate(a);
  const chips: Chip[] = ev.borderline.map((b) => ({ label: b.chip, tone: 'warn' as const }));
  for (const m of ev.mustHaves) {
    if (m.result !== 'fail') continue;
    if (m.key === 'licence') chips.push({ label: `Licence ${fmtYears(a.licenceYears)}`, tone: 'bad' });
    if (m.key === 'background') chips.push({ label: a.docs.background === 'remark' ? 'Background remark' : 'Background failed', tone: 'bad' });
    if (m.key === 'id') chips.push({ label: 'ID not verified', tone: 'bad' });
    if (m.key === 'photo') chips.push({ label: 'Photo missing', tone: 'bad' });
  }
  const photo = ev.mustHaves.find((m) => m.key === 'photo')!;
  if (photo.result === 'manual') {
    chips.push(a.docs.photo === 'remark' ? { label: 'Photo unclear', tone: 'warn' } : { label: 'Photo unchecked', tone: 'info' });
  }
  return chips;
}

export function fmtYears(y: number): string {
  return `${Number.isInteger(y) ? y : y.toFixed(1)} yrs`;
}
