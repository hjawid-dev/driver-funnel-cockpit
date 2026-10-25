import type { Applicant, DocKey } from './types';
import { DECISION_LABEL, validateDecision, type DecisionInput } from './criteria';
import { cleanNote, FIRST_GIG_ISSUE_LABEL, REJECT_REASONS, REVIEWER, type FirstGigIssue, type OpsActivationReason } from './types';
import { allDocsSubmitted, deriveStage, isSubmitted } from './stage';
import { markExtractShown, needsExtract, SHOW_BY_MS } from './extract';
import { formatDateTime } from './time';

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
  const error = validateDecision(a, input, now);
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
    text = `Rejected: ${label}${decision.note ? ` (${decision.note})` : ''}${decision.secondReviewer ? `, confirmed by ${decision.secondReviewer}` : ''}`;
    message = `Rejected: ${a.name}. Reason: ${label}.`;
  } else {
    // Accepted with a condition when the extract hasn't been shown: it is shown before the first drive.
    const pending = !a.extractShown;
    text = `${DECISION_LABEL[input.type]}${pending ? ', extract to show before the first drive' : ''}${decision.secondReviewer ? `, confirmed by ${decision.secondReviewer}` : ''}`;
    message = `Accepted: ${a.name}. Moved to Awaiting first gig${pending ? '; the extract is shown before the first drive' : ''}.`;
  }

  return { ok: true, applicant: withLog({ ...a, decision }, now, `${text} · by ${by}`), message };
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
  delete docTimes.photo;
  const next: Applicant = { ...a, docs, docTimes, photoApproved: false, docsCompleteAt: undefined };
  return {
    ok: true,
    applicant: withLog(next, now, `New photo requested by ${REVIEWER}`),
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
        ? 'ID verified with BankID'
        : `Document received: ${key}`;
  next = withLog(next, now, text);
  if (!next.docsCompleteAt && allDocsSubmitted(next)) {
    next = withLog({ ...next, docsCompleteAt: now }, now, 'File complete, queued for review');
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

export function bookFirstGig(a: Applicant, bookedFor: number, now: number): ActionResult {
  const error = requireAccepted(a);
  if (error) return { ok: false, error };
  if (needsExtract(a) && bookedFor - SHOW_BY_MS <= now) return { ok: false, error: 'The extract must be shown the day before the first drive. Pick a later date, or tick the extract first.' };
  const date = new Date(bookedFor).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return {
    ok: true,
    applicant: withLog({ ...a, firstGig: { ...a.firstGig, bookedFor } }, now, `First gig booked for ${date}`),
    message: `First gig booked: ${a.name}, ${date}.`,
  };
}

export function completeFirstGig(a: Applicant, result: { onTime: boolean; ok: boolean; issue?: { cause: FirstGigIssue; note: string } }, now: number): ActionResult {
  const error = requireAccepted(a);
  if (error) return { ok: false, error };
  if (needsExtract(a)) return { ok: false, error: 'The extract must be shown before the first drive.' };
  // An incident needs a cause and a few words on what happened: that is what anyone reading it later can act on.
  const note = result.issue ? cleanNote(result.issue.note) : '';
  if (!result.ok && (!result.issue || !note)) return { ok: false, error: 'Say what happened: pick a cause and write a short note about the drive.' };
  const issue = !result.ok && result.issue ? { cause: result.issue.cause, note } : undefined;
  const quality = result.onTime && result.ok ? 'on time, no incident' : [!result.onTime && 'late', issue && `incident: ${FIRST_GIG_ISSUE_LABEL[issue.cause].toLowerCase()}, "${issue.note}"`].filter(Boolean).join(', ');
  return {
    ok: true,
    applicant: withLog({ ...a, firstGig: { ...a.firstGig, doneAt: now, onTime: result.onTime, ok: result.ok, ...(issue ? { issue } : {}) } }, now, `First gig completed (${quality})`),
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
