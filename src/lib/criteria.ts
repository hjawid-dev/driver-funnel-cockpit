import type { Applicant, DecisionType, RejectReason } from './types';
import { deriveStage } from './stage';
import { isNoResponse } from './nudges';

/**
 * Written review criteria, three tiers.
 * Thresholds are a starting proposal, to be set with the team.
 *
 * Privacy by design:
 * - No criminal-record or traffic-offence data is stored (GDPR art. 10). The applicant shows
 *   the extract, voluntarily, in a call; the reviewer ticks "shown" and records nothing from it.
 * - The extract comes by post and can take two weeks, so it doesn't block the decision: it must be
 *   shown before the first drive (see extract.ts). Polisen advises showing it only after an offer.
 * - Reason codes are generic, so a rejection never reveals an offence.
 * - The system supports the decision; a human always makes it and can explain it.
 */
export const MIN_LICENCE_YEARS = 2;
export const BORDERLINE_LICENCE_YEARS = 1;

/** 'later': required, but before the first drive, so it doesn't block the decision. */
export type CheckResult = 'pass' | 'fail' | 'borderline' | 'manual' | 'later';

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
        : a.docs.licence !== 'verified'
        ? { result: 'manual', detail: 'Reviewer must verify the licence validity and years held' }
        : y >= MIN_LICENCE_YEARS
          ? { result: 'pass', detail: `${fmtYears(y)} held` }
          : y >= BORDERLINE_LICENCE_YEARS
            ? { result: 'borderline', detail: `${fmtYears(y)} held: borderline rule applies` }
            : { result: 'fail', detail: `${fmtYears(y)} held: under 1 year` }),
  };

  const id: MustHave = {
    key: 'id',
    label: 'ID verified (BankID or manual ID check)',
    ...(a.docs.id === 'verified'
      ? { result: 'pass', detail: a.idMethod === 'manual' ? 'ID verified manually by a reviewer' : 'Verified with BankID' }
      : { result: 'fail', detail: a.docs.id === 'missing' ? 'ID not submitted' : a.idMethod === 'manual' && a.docs.id === 'uploaded' ? 'Manual identity check pending' : 'ID verification not completed' }),
  };

  const extract: MustHave = {
    key: 'extract',
    label: 'Criminal-record extract shown, before the first drive',
    ...(a.extractShown
      ? { result: 'pass', detail: 'Shown. Nothing from it is stored.' }
      : a.docs.extract === 'ready'
        ? { result: 'later', detail: 'Arrived: tick it if shown in this call. Otherwise a 5-minute check before the first drive. Doesn\'t block the decision.' }
        : a.docs.extract === 'pending'
          ? { result: 'later', detail: 'Ordered from Polisen (post, up to 2 weeks). Shown before the first drive; doesn\'t block the decision.' }
          : { result: 'fail', detail: 'Not ordered yet' }),
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
export function validateDecision(a: Applicant, input: DecisionInput, now: number, by = a.owner ?? 'Hjalmar'): string | null {
  const stage = deriveStage(a);
  if (!Number.isFinite(now) || now < a.registeredAt) return 'Decision time cannot be before registration.';
  if (stage === 'review' && a.docsCompleteAt! > now) return 'The complete file is not available at this decision time.';

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
    // A pre-qualifying requirement that isn't met is closed by a person, not automatically.
    if (stage !== 'review' && !(stage === 'registered' && a.prequalIssue) && !(stage === 'accepted' && input.reason === 'requirements_not_met')) return 'Only applicants under review or awaiting a pre-drive check can be decided.';
    if (NEEDS_SECOND_REVIEWER.includes(input.reason) && (!a.secondReview || a.secondReview.reason !== input.reason || a.secondReview.by !== input.secondReviewer?.trim() || a.secondReview.at > now || a.secondReview.by.trim().toLowerCase() === by.trim().toLowerCase())) {
      return 'A suitability rejection needs a second reviewer to confirm.';
    }
    return null;
  }

  if (stage !== 'review') return 'Only applicants under review can be decided.';
  if (a.prequalIssue) return 'Resolve the pre-qualifying requirement first.';
  if (!a.onboardingCompletedAt || a.onboardingCompletedAt < a.registeredAt || a.onboardingCompletedAt > now) return 'Complete and log the onboarding call before deciding.';
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
  // Only what differs from a clean file. Every file still needs the extract shown in the call and the photo checked,
  // so those would be on every row and say nothing; the call time has its own column.
  if (a.docs.photo === 'remark' && !a.photoApproved) chips.push({ label: 'Photo unclear', tone: 'warn' });
  return chips;
}

export function shortTime(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function fmtYears(y: number): string {
  return `${Number.isInteger(y) ? y : y.toFixed(1)} yrs`;
}

/**
 * The onboarding call: a short interview where the extract is one part, not the point. The decision
 * is made in the call, and the first drive is booked in the same call, so no separate welcome call is needed.
 */
export const CALL_AGENDA = [
  'How a job works: pickup, photos, handover',
  'If you get stuck at a pickup: stay, call ops, waiting time is paid',
  'When you can drive',
  'Your extract: shown now if it has arrived, otherwise before your first drive',
  'Your questions, and the decision',
  'Book your first drive together',
] as const;
