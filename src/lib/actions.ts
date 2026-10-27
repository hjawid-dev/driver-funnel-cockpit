import type { Applicant, DocKey, Gig } from './types';
import { DECISION_LABEL, validateDecision, type DecisionInput } from './criteria';
import { cleanNote, FIRST_GIG_ISSUE_LABEL, REJECT_REASONS, REVIEWER, type FirstGigIssue, type OpsActivationReason } from './types';
import { allDocsSubmitted, deriveStage, isSubmitted } from './stage';
import { markExtractShown } from './extract';
import { formatDateTime } from './time';
import { appendEvent, canStartDrive, firstSubmissionAt } from './eligibility';
import { bookingError } from './gigs';

/**
 * Every action is a pure function: old applicant in, new applicant out.
 * Each one writes a log entry, so the timestamps and reason codes the
 * funnel metrics need are created as a by-product of doing the work.
 */

export type ActionResult = { ok: true; applicant: Applicant; message: string } | { ok: false; error: string };

function withLog(a: Applicant, at: number, text: string): Applicant {
  return { ...a, log: [...a.log, { at, text }] };
}

export function applyDecision(a: Applicant, input: DecisionInput, now: number, by = REVIEWER): ActionResult {
  const error = validateDecision(a, input, now, by);
  if (error) return { ok: false, error };

  const decision = {
    type: input.type,
    at: now,
    by,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(input.secondReviewer?.trim() ? { secondReviewer: input.secondReviewer.trim() } : {}),
  };

  let text: string;
  let message: string;
  if (input.type === 'rejected') {
    const label = REJECT_REASONS.find((r) => r.value === input.reason)?.label ?? String(input.reason);
    text = `${input.reason === 'no_response_14d' ? 'Closed incomplete file' : 'Rejected'}: ${label}${decision.note ? ` (${decision.note})` : ''}${decision.secondReviewer ? `, confirmed by ${decision.secondReviewer}` : ''}`;
    message = `${input.reason === 'no_response_14d' ? 'Closed incomplete file' : 'Rejected'}: ${a.name}. Reason: ${label}.`;
  } else {
    // Accepted with a condition when the extract hasn't been shown: it is shown before the first drive.
    const pending = !a.extractShown;
    text = `${DECISION_LABEL[input.type]}${pending ? ', extract to show before the first drive' : ''}${decision.secondReviewer ? `, confirmed by ${decision.secondReviewer}` : ''}`;
    message = `Accepted: ${a.name}. Moved to Awaiting first gig${pending ? '; the extract is shown before the first drive' : ''}.`;
  }

  const next = { ...a, decision, decisionHistory: [...(a.decisionHistory ?? (a.decision ? [a.decision] : [])), decision], ...(input.type === 'rejected' && a.firstGig && !a.firstGig.doneAt ? { firstGig: undefined } : {}) };
  return { ok: true, applicant: appendEvent(withLog(next, now, `${text} · by ${by}`), 'decision', now, by, input.reason ?? input.type), message };
}

export function setPhotoApproved(a: Applicant, approved: boolean, now: number): Applicant {
  return withLog({ ...a, photoApproved: approved }, now, approved ? `Photo approved by ${REVIEWER}` : 'Photo approval removed');
}

/** Only the fact that the extract was shown is recorded, never what it said. */
export function setExtractShown(a: Applicant, shown: boolean, now: number): Applicant {
  return markExtractShown(a, shown, now);
}

/** Sends the applicant back to Missing documents with photo = missing. */
export function requestNewPhoto(a: Applicant, now: number): ActionResult {
  if (deriveStage(a) !== 'review') return { ok: false, error: 'Only applicants under review can be asked for a new photo.' };
  const docs = { ...a.docs, photo: 'missing' as const };
  const docTimes = { ...a.docTimes };
  const next: Applicant = { ...a, docs, docTimes, firstDocsSubmittedAt: firstSubmissionAt(a), photoApproved: false, docsCompleteAt: undefined };
  return {
    ok: true,
    applicant: appendEvent(withLog(next, now, `New photo requested by ${REVIEWER}`), 'documents_requested', now, REVIEWER, 'photo'),
    message: `New photo requested: ${a.name}. Moved to Missing documents.`,
  };
}

export function logNudge(a: Applicant, now: number): ActionResult {
  if (deriveStage(a) !== 'registered') return { ok: false, error: 'Nudges are only for incomplete files.' };
  return {
    ok: true,
    applicant: withLog({ ...a, nudges: [...a.nudges, now] }, now, 'Manual nudge logged (demo, no SMS sent)'),
    message: 'Nudge logged (demo, no SMS sent)',
  };
}

/** A document arrives. When the file becomes complete it is auto-queued for review. */
export function receiveDocument(a: Applicant, key: DocKey, status: Applicant['docs'][DocKey], now: number): Applicant {
  const submitted = isSubmitted(status);
  let next: Applicant = { ...a, docs: { ...a.docs, [key]: status }, ...(submitted ? { docTimes: { ...a.docTimes, [key]: now } } : {}) };
  const text =
    key === 'extract'
      ? status === 'pending'
        ? 'Applicant ordered extract from Polisen'
        : 'Extract ready to show (nothing uploaded)'
      : key === 'id' && status === 'verified'
        ? `ID verified (${a.idMethod === 'manual' ? 'manual review' : 'BankID'})`
        : `Document received: ${key}`;
  next = withLog(next, now, text);
  if (!next.docsCompleteAt && allDocsSubmitted(next)) {
    next = appendEvent(withLog({ ...next, firstDocsSubmittedAt: firstSubmissionAt(next) ?? now, docsCompleteAt: now, owner: a.owner ?? REVIEWER, backup: a.backup ?? 'Sofia' }, now, 'File complete, queued for review'), 'documents_submitted', now, a.source === 'self' ? 'driver' : REVIEWER);
  }
  return next;
}

export function closeNoResponse(a: Applicant, now: number): ActionResult {
  return applyDecision(a, { type: 'rejected', reason: 'no_response_14d' }, now);
}

function requireAccepted(a: Applicant): string | null {
  return deriveStage(a) === 'accepted' ? null : 'Only accepted drivers without a first gig.';
}

export function logWelcomeCall(a: Applicant, now: number): ActionResult {
  const error = requireAccepted(a);
  if (error) return { ok: false, error };
  return {
    ok: true,
    applicant: withLog({ ...a, welcomeCallAt: now }, now, `Welcome call logged by ${REVIEWER}`),
    message: `Welcome call logged: ${a.name}.`,
  };
}

export function bookFirstGig(a: Applicant, gig: Gig | number, now: number, apps: Applicant[] = [a]): ActionResult {
  if (typeof gig === 'number') return { ok: false, error: 'Choose an available job, not a free date.' };
  const error = bookingError(a, gig, apps, now);
  if (error) return { ok: false, error };
  const { activationReason: _reason, ...rest } = a;
  const next = { ...rest, firstGig: { gigId: gig.id, bookedAt: now, bookedFor: gig.at } };
  return { ok: true, applicant: appendEvent(withLog(next, now, `First gig booked: ${gig.id}, ${formatDateTime(gig.at)}`), 'booked', now, REVIEWER, gig.id), message: `First gig booked: ${a.name}, ${formatDateTime(gig.at)}.` };
}

export function completeFirstGig(a: Applicant, result: { onTime: boolean; ok: boolean; customerSatisfied?: boolean; delivery?: { jobId: string; at: number }; issue?: { cause: FirstGigIssue; note: string } }, now: number): ActionResult {
  const error = requireAccepted(a);
  if (error) return { ok: false, error };
  const readiness = canStartDrive(a);
  if (readiness) return { ok: false, error: readiness };
  const gig = a.firstGig;
  if (!gig?.gigId || !gig.bookedFor || !Number.isFinite(gig.bookedFor) || gig.bookedFor > now) return { ok: false, error: 'A booked first drive must have started before it can be completed.' };
  if (!result.delivery || result.delivery.jobId !== gig.gigId || !Number.isFinite(result.delivery.at) || result.delivery.at < gig.bookedFor || result.delivery.at > now) return { ok: false, error: 'Record delivery on the booked job in Live Ops first.' };
  // An incident needs a cause and a few words on what happened: that is what anyone reading it later can act on.
  const note = result.issue ? cleanNote(result.issue.note) : '';
  if (!result.ok && (!result.issue || !note)) return { ok: false, error: 'Say what happened: pick a cause and write a short note about the drive.' };
  const issue = !result.ok && result.issue ? { cause: result.issue.cause, note } : undefined;
  const quality = result.onTime && result.ok ? 'on time, no incident' : [!result.onTime && 'late', issue && `incident: ${FIRST_GIG_ISSUE_LABEL[issue.cause].toLowerCase()}, "${issue.note}"`].filter(Boolean).join(', ');
  return {
    ok: true,
    applicant: appendEvent(withLog({ ...a, firstGig: { ...a.firstGig, doneAt: result.delivery.at, onTime: result.onTime, ok: result.ok, customerSatisfied: result.customerSatisfied, ...(issue ? { issue } : {}) } }, now, `First gig completed (${quality})`), 'completed', result.delivery.at, REVIEWER, result.delivery.jobId),
    message: `${a.name} is now an active driver.`,
  };
}

export const OPS_ACTIVATION_LABEL: Record<OpsActivationReason, string> = {
  declined: 'Declined the drives offered',
  unreachable: "Can't reach them",
  not_interested: 'No longer interested',
};

/** What ops learned on the call: why this driver hasn't driven. Clearing it lets the data speak again. */
export function setActivationReason(a: Applicant, reason: OpsActivationReason | null, now: number): ActionResult {
  const error = requireAccepted(a);
  if (error) return { ok: false, error };
  if (!reason) {
    const { activationReason: _r, ...rest } = a;
    return { ok: true, applicant: withLog(rest, now, `Activation reason cleared by ${REVIEWER}`), message: `Reason cleared: ${a.name}.` };
  }
  return {
    ok: true,
    applicant: withLog({ ...a, activationReason: { reason, at: now } }, now, `Why no first drive yet: ${OPS_ACTIVATION_LABEL[reason].toLowerCase()} (${REVIEWER}, ${formatDateTime(now)})`),
    message: `Noted for ${a.name}: ${OPS_ACTIVATION_LABEL[reason].toLowerCase()}.`,
  };
}

export function completeOnboarding(a: Applicant, now: number): Applicant {
  if (deriveStage(a) !== 'review') return a;
  return withLog({ ...a, onboardingCompletedAt: now, owner: a.owner ?? REVIEWER, backup: a.backup ?? 'Sofia' }, now, `Onboarding call completed by ${REVIEWER}`);
}

export function confirmSecondReview(a: Applicant, reason: NonNullable<Applicant['decision']>['reason'], by: string, now: number): Applicant {
  const identity = (name: string) => name.replace(/\([^)]*\)/g, '').trim().toLowerCase();
  if (!reason || !by.trim() || identity(by) === identity(a.owner ?? REVIEWER)) return a;
  return withLog({ ...a, secondReview: { by: by.trim(), at: now, reason } }, now, `Second review confirmed by ${by.trim()}: ${reason}`);
}
