import type { Applicant, DocKey } from './types';
import { DECISION_LABEL, validateDecision, type DecisionInput } from './criteria';
import { REJECT_REASONS, REVIEWER } from './types';
import { allDocsSubmitted, deriveStage } from './stage';

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
    text = `${DECISION_LABEL[input.type]}${decision.secondReviewer ? `, confirmed by ${decision.secondReviewer}` : ''}`;
    message = `Accepted: ${a.name}. Moved to Awaiting first gig.`;
  }

  return { ok: true, applicant: withLog({ ...a, decision }, now, `${text} · by ${by}`), message };
}

export function setPhotoApproved(a: Applicant, approved: boolean, now: number): Applicant {
  return withLog({ ...a, photoApproved: approved }, now, approved ? `Photo approved by ${REVIEWER}` : 'Photo approval removed');
}

/** Only the fact that the extract was shown is recorded, never what it said. */
export function setExtractShown(a: Applicant, shown: boolean, now: number): Applicant {
  return withLog({ ...a, extractShown: shown }, now, shown ? `Extract shown in call, seen by ${REVIEWER} (nothing stored)` : 'Extract tick removed');
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
  let next: Applicant = { ...a, docs: { ...a.docs, [key]: status }, docTimes: { ...a.docTimes, [key]: now } };
  next = withLog(next, now, `Document received: ${key}`);
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
  const date = new Date(bookedFor).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return {
    ok: true,
    applicant: withLog({ ...a, firstGig: { ...a.firstGig, bookedFor } }, now, `First gig booked for ${date}`),
    message: `First gig booked: ${a.name}, ${date}.`,
  };
}

export function completeFirstGig(a: Applicant, result: { onTime: boolean; ok: boolean }, now: number): ActionResult {
  const error = requireAccepted(a);
  if (error) return { ok: false, error };
  const quality = result.onTime && result.ok ? 'on time, no incident' : [!result.onTime && 'late', !result.ok && 'incident or unhappy customer'].filter(Boolean).join(', ');
  return {
    ok: true,
    applicant: withLog({ ...a, firstGig: { ...a.firstGig, doneAt: now, ...result } }, now, `First gig completed (${quality})`),
    message: `${a.name} is now an active driver.`,
  };
}
