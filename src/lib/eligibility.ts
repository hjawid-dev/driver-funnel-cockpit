import type { Applicant } from './types';
import { deriveStage, isAccepted } from './stage';

/** Shared by every driver/ops entry point. A booking alone never makes a driver eligible. */
export function canStartDrive(a: Applicant): string | null {
  if (!isAccepted(a) || !['accepted', 'active'].includes(deriveStage(a))) return 'A human must accept the application first.';
  if (a.prequalIssue) return 'The pre-qualifying requirement must be resolved.';
  if (a.docs.licence !== 'verified' || a.licenceYears < 1) return 'A valid B licence must be verified.';
  if (a.docs.id !== 'verified') return 'ID must be verified with BankID or by a reviewer.';
  if (!a.photoApproved) return 'The profile photo must be approved.';
  if (!a.extractShown) return 'The pre-drive check must be completed and the extract shown.';
  return null;
}

export function firstSubmissionAt(a: Applicant): number | undefined {
  return a.firstDocsSubmittedAt ?? a.docsCompleteAt;
}

export function firstDecision(a: Applicant) { return a.decisionHistory?.[0] ?? a.decision; }
export function firstAcceptance(a: Applicant) { return a.decisionHistory?.find(d => d.type !== 'rejected') ?? (a.decision?.type !== 'rejected' ? a.decision : undefined); }

export function appendEvent(a: Applicant, kind: NonNullable<Applicant['events']>[number]['kind'], at: number, by: string, reason?: string): Applicant {
  return { ...a, events: [...(a.events ?? []), { kind, at, by, ...(reason ? { reason } : {}) }] };
}
