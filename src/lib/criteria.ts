import type { Applicant, DecisionType, RejectReason } from './types';
import { deriveStage } from './stage';
import { isNoResponse } from './nudges';

/**
 * Written review criteria, three tiers.
 * Thresholds are a starting proposal, to be set with the team.
 *
 * Privacy by design:
 * - No criminal-record or traffic-offence data is stored (GDPR art. 10). The applicant shows
 *   the extract in a short call; the reviewer ticks "shown" and records nothing from it.
 * - Reason codes are generic, so a rejection never reveals an offence.
 * - The system supports the decision; a human always makes it and can explain it.
 */
export const MIN_LICENCE_YEARS = 2;
export const BORDERLINE_LICENCE_YEARS = 1;

export type CheckResult = 'pass' | 'fail' | 'borderline' | 'manual';

export interface MustHave {
  key: 'licence' | 'id' | 'extract' | 'photo';
  label: string;
  result: CheckResult;
  detail: string;
}

export type BorderlineKey = 'licence_1_2' | 'limited_availability';

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
  /** Pre-selected reason when a must-have fails. */
  suggestedReject?: RejectReason;
}

/** Objective photo standard, the same for everyone. */
export const PHOTO_STANDARD = 'Face clearly visible, recent, no sunglasses. Head coverings are fine.';

export function evaluate(a: Applicant): Evaluation {
  const y = a.licenceYears;
  const licence: MustHave = {
    key: 'licence',
    label: `Valid B licence, held ≥ ${MIN_LICENCE_YEARS} years`,
    ...(a.docs.licence === 'failed'
      ? { result: 'fail', detail: 'No valid B licence' }
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
      : { result: 'fail', detail: a.docs.id === 'missing' ? 'ID not submitted' : 'ID could not be verified with BankID' }),
  };

  const extract: MustHave = {
    key: 'extract',
    label: 'Criminal-record extract shown',
    ...(a.docs.extract !== 'ready'
      ? { result: 'fail', detail: a.docs.extract === 'pending' ? 'Ordered, not yet ready to show' : 'Not ordered yet' }
      : a.extractShown
        ? { result: 'pass', detail: 'Shown in a call. Nothing from it is stored.' }
        : { result: 'manual', detail: 'Applicant shows it in a short call. Tick when seen; record nothing from it.' }),
  };

  const photo: MustHave = {
    key: 'photo',
    label: 'Profile photo meets the standard',
    ...(a.docs.photo === 'missing' || a.docs.photo === 'pending'
      ? { result: 'fail', detail: 'Photo not submitted' }
      : a.photoApproved
        ? { result: 'pass', detail: 'Checked against the standard' }
        : a.docs.photo === 'remark'
          ? { result: 'manual', detail: a.docNote?.photo ?? `Check: ${PHOTO_STANDARD}` }
          : { result: 'manual', detail: PHOTO_STANDARD }),
  };

  const borderline: BorderlineRule[] = [];
  if (y >= BORDERLINE_LICENCE_YEARS && y < MIN_LICENCE_YEARS) {
    borderline.push({
      key: 'licence_1_2',
      chip: `Licence ${fmtYears(y)}`,
      rule: 'Licence held 1–2 years → accept for simple drives first',
    });
  }
  if (a.availability === 'limited') {
    borderline.push({
      key: 'limited_availability',
      chip: 'Limited availability',
      rule: 'Limited availability → accept, flag for activation follow-up',
    });
  }

  const mustHaves = [licence, id, extract, photo];
  const acceptBlockedBy = mustHaves
    .filter((m) => m.result === 'fail' || m.result === 'manual')
    .map((m) => (m.result === 'manual' ? `${m.label}: not checked yet` : `${m.label}: ${m.detail}`));

  const has = (k: BorderlineKey) => borderline.some((b) => b.key === k);
  const acceptType = has('licence_1_2') ? 'accepted_simple' : has('limited_availability') ? 'accepted_flagged' : 'accepted';

  let suggestedReject: RejectReason | undefined;
  if (licence.result === 'fail' && a.docs.licence !== 'missing') suggestedReject = 'no_valid_licence';
  else if (id.result === 'fail' && a.docs.id !== 'missing') suggestedReject = 'id_unverified';

  return { mustHaves, borderline, acceptType, acceptBlockedBy, suggestedReject };
}

/** Reasons that need a second reviewer before the rejection is saved. */
export const NEEDS_SECOND_REVIEWER: RejectReason[] = ['requirements_not_met'];

/**
 * Words that suggest a note contains offence details. Notes are a free-text field, so this
 * guard stops the most likely mistake: writing down what the extract said.
 */
const SENSITIVE_NOTE =
  /(dömd|domd|dom för|brott|belastning|straff|fängelse|böter|boter|fortkörning|rattfyll|stöld|bedrägeri|convict|criminal|offen[cs]e|felony|prison|speeding|theft|fraud|dui|record extract)/i;

export function noteLooksSensitive(note: string | undefined): boolean {
  return !!note && SENSITIVE_NOTE.test(note);
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

  if (noteLooksSensitive(input.note)) {
    return 'Notes must not contain offence details or anything from the extract. Use the generic reason code.';
  }

  if (input.type === 'rejected') {
    if (!input.reason) return 'Pick a reason code to reject.';
    if (input.reason === 'other' && !input.note?.trim()) return '"Other" needs a note.';
    if (input.reason === 'no_response_14d') {
      if (stage !== 'registered' || !isNoResponse(a, now)) return 'Only incomplete files older than 14 days can be closed as no response.';
      return null;
    }
    if (stage !== 'review') return 'Only applicants under review can be decided.';
    if (NEEDS_SECOND_REVIEWER.includes(input.reason) && !input.secondReviewer?.trim()) {
      return 'A suitability rejection needs a second reviewer to confirm.';
    }
    return null;
  }

  if (stage !== 'review') return 'Only applicants under review can be decided.';
  const ev = evaluate(a);
  if (ev.acceptBlockedBy.length) return `Can't accept: ${ev.acceptBlockedBy[0]}.`;
  if (input.type !== ev.acceptType) return `The written rules call for "${DECISION_LABEL[ev.acceptType]}" here.`;
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
    if (m.key === 'licence') chips.push({ label: a.docs.licence === 'failed' ? 'No valid licence' : `Licence ${fmtYears(a.licenceYears)}`, tone: 'bad' });
    if (m.key === 'id') chips.push({ label: 'ID not verified', tone: 'bad' });
    if (m.key === 'photo') chips.push({ label: 'Photo missing', tone: 'bad' });
  }
  const extract = ev.mustHaves.find((m) => m.key === 'extract')!;
  if (extract.result === 'manual') chips.push({ label: 'Extract call', tone: 'info' });
  const photo = ev.mustHaves.find((m) => m.key === 'photo')!;
  if (photo.result === 'manual') {
    chips.push(a.docs.photo === 'remark' ? { label: 'Photo unclear', tone: 'warn' } : { label: 'Photo unchecked', tone: 'info' });
  }
  return chips;
}

export function fmtYears(y: number): string {
  return `${Number.isInteger(y) ? y : y.toFixed(1)} yrs`;
}
