import type { DemoData } from './persist';
import { incidentTarget, reviewTarget, docsTarget, type PresentKey } from './present';
import { jobAlert } from './liveOps';

export interface GuideSnapshot { data: DemoData; now: number; applicantId: string | null }
export interface GuideAdvance { key: PresentKey; message: string }

/** Observe real changes only: revisiting a completed step never performs or repeats an action. */
export function guideAdvance(before: GuideSnapshot, after: GuideSnapshot, part: 1 | 2): GuideAdvance | null {
  const next = (key: PresentKey, message: string): GuideAdvance => ({ key, message });
  if (part === 1) {
    const p = incidentTarget(before.data.jobs), j = incidentTarget(after.data.jobs);
    if (!p || !j || p.id !== j.id) return null;
    const a = p.incident, b = j.incident;
    if (b?.closedAt && !a?.closedAt) return next('prevent', 'Incident closed');
    if ((b?.rebooking?.status === 'booked' && a?.rebooking?.status !== 'booked') || (b?.outcome && !a?.outcome && !b.rebooking)) return next('close', 'Customer decision saved');
    const customerDone = (i: typeof a) => !!i?.steps.customer && (!j.pilot || !!i.accountOwnerAt);
    if (customerDone(b) && !customerDone(a)) return next('decision', 'Customer and account owner updated');
    if (b?.steps.escalate && !a?.steps.escalate) return next('customer', 'Contact attempts logged');
    if (b?.steps.own_error && !a?.steps.own_error) return next('contact', 'Booking check saved');
    if (b?.steps.keep_driver && !a?.steps.keep_driver) return next('booking_check', 'Driver call logged');
    const reportedOrEscalated = j.problemAt !== undefined || j.escalation !== undefined || (!b && j.arrivedAt !== undefined);
    if (reportedOrEscalated && !j.incident?.outcome && jobAlert(j, after.now)?.kind === 'escalated' && jobAlert(p, before.now)?.kind !== 'escalated') return next('playbook', 'Ops call due now');
    if (j.problemAt && !p.problemAt) return next('assistant', 'Problem reported');
    return null;
  }
  const p = reviewTarget(before.data.apps), a = reviewTarget(after.data.apps);
  if (a?.firstGig?.doneAt && !p?.firstGig?.doneAt) return next('followup', 'First delivery recorded · driver active');
  if (a?.decision && !p?.decision) return next('activate', 'Review decision saved');
  const oldNora = docsTarget(before.data.apps), nora = docsTarget(after.data.apps);
  if (nora && oldNora && nora.nudges.length > oldNora.nudges.length) return next('queue', 'Manual follow-up logged');
  const own = after.data.apps.find(a => a.id === after.applicantId);
  const oldOwn = before.data.apps.find(a => a.id === after.applicantId);
  if (own?.docsCompleteAt && !oldOwn?.docsCompleteAt) return next('reminders', 'Application checklist complete');
  return null;
}
