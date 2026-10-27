import type { Job } from '../liveOps';
import type { Applicant, Gig } from '../types';
import { activationReasons } from '../activation';
import type { ChatThread } from '../chat/types';
import { computeFunnel, computeKpis, isReviewDecision, median } from '../kpis';
import { deriveStage, isAccepted } from '../stage';
import { chatStats, contentGaps } from '../chat/threads';
import { firstDecision, firstSubmissionAt } from '../eligibility';
import { topRejectReasons } from '../kpis';
import { DAY, HOUR } from '../time';

/**
 * The weekly report's numbers. Code computes every number here; the AI only writes text around
 * them, and the number check (check.ts) makes sure that text uses nothing else.
 * Only counts and rates: no names or other personal data go to the AI.
 */
export interface Fact {
  id: string;
  label: string;
  /** This week, or the current value. Whole numbers only. */
  value: number;
  unit: '' | '%' | 'h' | 'min';
  /** The week before. */
  previous?: number;
  /** value − previous. */
  change?: number;
  target?: number;
  /** Is the change (or the value against its target) good, bad or neither? */
  good: boolean | null;
}

export interface WeeklyFacts {
  week: number;
  from: number;
  to: number;
  facts: Fact[];
}

const WEEK = 7 * DAY;

/** ISO week number. */
export function isoWeek(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / DAY - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

const round = (v: number | null): number | null => (v === null ? null : Math.round(v));

/** A flow this week against the week before. higherIsBetter decides whether the change is good. */
function flow(id: string, label: string, unit: Fact['unit'], now: Fact['value'] | null, prev: number | null, higherIsBetter: boolean | null): Fact | null {
  if (now === null) return null;
  const f: Fact = { id, label, value: now, unit, good: null };
  if (prev !== null) {
    f.previous = prev;
    f.change = now - prev;
    f.good = f.change === 0 || higherIsBetter === null ? null : f.change > 0 === higherIsBetter;
  }
  return f;
}

/** A current value against a target. */
function status(id: string, label: string, unit: Fact['unit'], value: number | null, target: number, higherIsBetter: boolean): Fact | null {
  if (value === null) return null;
  return { id, label, value, unit, target, good: higherIsBetter ? value >= target : value <= target };
}

const inWindow = (t: number | undefined, from: number, to: number) => t !== undefined && t > from && t <= to;

function weekFlows(apps: Applicant[], to: number) {
  const from = to - WEEK;
  const decided = apps.filter((a) => isReviewDecision(a) && inWindow(firstDecision(a)!.at, from, to));
  return {
    newApps: apps.filter((a) => inWindow(a.registeredAt, from, to)).length,
    filesComplete: apps.filter((a) => inWindow(firstSubmissionAt(a), from, to)).length,
    decisions: decided.length,
    accepted: decided.filter(a => firstDecision(a)!.type !== 'rejected').length,
    firstDrives: apps.filter((a) => inWindow(a.firstGig?.doneAt, from, to)).length,
    medianDecisionH: round(median(decided.map((a) => (firstDecision(a)!.at - firstSubmissionAt(a)!) / HOUR))),
  };
}

export function weeklyFacts(apps: Applicant[], threads: ChatThread[], now: number, jobs: Job[] = [], gigs: Gig[] = []): WeeklyFacts {
  // Stuck pickups closed this week, by who solved them and why: what prevention learns from.
  const closedWeek = jobs.filter((j) => j.incident?.closedAt !== undefined && j.incident.closedAt > now - WEEK && j.incident.closedAt <= now);
  const cur = weekFlows(apps, now);
  const prev = weekFlows(apps, now - WEEK);
  const chat = chatStats(threads, now);
  // No chat questions the week before (e.g. the chat is new): no week-over-week comparison for the chat.
  const chatPrevRaw = chatStats(threads, now - WEEK);
  const chatPrev = chatPrevRaw.questions > 0 ? chatPrevRaw : null;
  const kpi = Object.fromEntries(computeKpis(apps, now).map((k) => [k.key, round(k.value)]));
  const funnel = computeFunnel(apps);
  const pending = [
    { edge: 0, label: 'Applicants awaiting documents', count: apps.filter(a => deriveStage(a) === 'registered').length },
    { edge: 1, label: 'Applicants awaiting a review decision', count: apps.filter(a => deriveStage(a) === 'review').length },
    { edge: 3, label: 'Accepted drivers awaiting first delivery', count: apps.filter(a => deriveStage(a) === 'accepted').length },
  ].sort((a,b) => b.count-a.count)[0];
  const dropIdx = pending.count ? pending.edge : -1;
  const review = apps.filter((a) => deriveStage(a) === 'review');
  const awaiting = apps.filter((a) => deriveStage(a) === 'accepted');
  // Why the accepted drivers haven't driven, and whether there is work for them: demand, not only drivers.
  const why = activationReasons(awaiting, apps, gigs, now);
  const whyCount = (r: string) => why.find((x) => x.reason === r)?.count ?? 0;
  // Job counts do not establish usable driver capacity; do not infer over-supply.

  const humanDecisions = apps.filter(a => firstDecision(a) && firstDecision(a)!.reason !== 'no_response_14d' && firstDecision(a)!.at >= a.registeredAt && firstDecision(a)!.at <= now);
  const decisionHours = humanDecisions.map(a => (firstDecision(a)!.at-a.registeredAt)/HOUR);
  const matureApplications = apps.filter(a => a.registeredAt <= now - 30 * DAY);
  const converted = matureApplications.filter(a => isAccepted(a) && a.firstGig?.doneAt && a.firstGig.doneAt >= a.registeredAt && a.firstGig.doneAt <= a.registeredAt + 30 * DAY).length;
  const facts = [
    // This week against last week
    flow('new_applications', 'New applications', '', cur.newApps, prev.newApps, true),
    flow('files_completed', 'Files completed (all documents in)', '', cur.filesComplete, prev.filesComplete, true),
    flow('decisions', 'Decisions after review', '', cur.decisions, prev.decisions, true),
    flow('accepted', 'Accepted', '', cur.accepted, prev.accepted, true),
    flow('first_drives', 'First drives completed (new active drivers)', '', cur.firstDrives, prev.firstDrives, true),
    flow('median_decision_hours', 'Median time from complete file to decision', 'h', cur.medianDecisionH, prev.medianDecisionH, false),
    flow('chat_answered_by_ai', 'Driver questions answered by the AI assistant', '%', round(chat.rate), chatPrev ? round(chatPrev.rate) : null, true),
    flow('chat_questions', 'Driver questions in the chat', '', chat.questions, chatPrev?.questions ?? null, null),
    flow('chat_handed_over', 'Driver questions handed to a person', '', chat.handedOver, chatPrev?.handedOver ?? null, false),
    flow('chat_self_service', 'Things drivers did themselves in the chat', '', chat.selfService, chatPrev?.selfService ?? null, true),
    flow('ops_reply_minutes', 'Median ops reply time in the chat', 'min', round(chat.medianOpsReplyMin), chatPrev ? round(chatPrev.medianOpsReplyMin) : null, false),

    ...(kpi.acceptance === null ? [] : [{ id: 'acceptance_rate', label: 'Accepted share of reviewed decisions (all history)', value: kpi.acceptance, unit: '%' as const, good: null }]),
    ...topRejectReasons(apps).filter(r => r.reason !== 'no_response_14d').map(r => ({ id: `reject_${r.reason}`, label: `Rejected: ${r.short} (all history)`, value: r.count, unit: '' as const, good: null })),
    ...(decisionHours.length ? [
      { id: 'mean_decision_hours', label: 'Registration to decision mean, all human decisions (case-comparable)', value: Math.round(decisionHours.reduce((n,h)=>n+h,0)/decisionHours.length), unit: 'h' as const, good: null },
      { id: 'within_48_hours', label: 'Human decisions within 48 calendar hours of registration', value: Math.round(100*decisionHours.filter(h=>h<=48).length/decisionHours.length), unit: '%' as const, good: null },
    ] : []),
    ...(matureApplications.length ? [{ id: 'cohort_conversion_30d', label: 'Active within 30 days, applications with 30+ days follow-up (all mature history)', value: Math.round(100*converted/matureApplications.length), unit: '%' as const, good: null }] : []),
    { id: 'quality_pending_feedback', label: 'Completed first drives awaiting customer feedback', value: apps.filter(a => a.firstGig?.doneAt && a.firstGig.doneAt <= now && a.firstGig.customerSatisfied === undefined).length, unit: '' as const, good: null },
    { id: 'prequal_rejections', label: 'Pre-qualifying rejections before document submission', value: apps.filter(a => a.decision?.type === 'rejected' && !firstSubmissionAt(a) && a.decision.reason !== 'no_response_14d').length, unit: '' as const, good: null },
    // Now against target
    status('document_completion', 'Documents within 7 days (mature registration cohort)', '%', kpi.docCompletion ?? null, 85, true),
    status('time_to_decision', 'Time from registration to decision, mean of all decisions', 'h', kpi.timeToDecision ?? null, 48, false),
    status('activation', 'Activation: first drive within 14 days of acceptance', '%', kpi.activation ?? null, 75, true),
    status('application_to_active', 'Application to active within 30 days (mature cohort; pilot target)', '%', kpi.cohortConversion ?? null, 35, true),
    status('first_drive_quality', 'First-drive delivery outcome: original deadline, no incident, satisfied', '%', kpi.quality ?? null, 95, true),
    // AI answer share is diagnostic, never a target for suppressing handovers.

    // Where it is stuck right now
    { id: 'review_queue', label: 'Files waiting for a decision', value: review.length, unit: '', good: null },
    { id: 'review_overdue', label: 'Files waiting more than 48 h (overdue)', value: review.filter((a) => now - a.registeredAt > 48 * HOUR).length, unit: '', good: null },
    { id: 'awaiting_first_drive', label: 'Accepted drivers without a first drive', value: awaiting.length, unit: '', good: null },
    { id: 'awaiting_call_due', label: 'First-booking calls due after 14 days', value: awaiting.filter(a => now - a.decision!.at >= 14 * DAY && now - a.decision!.at < 30 * DAY && !a.firstGig?.bookedFor && !a.activationReason && a.extractShown).length, unit: '', good: null },
    { id: 'awaiting_over_7_days', label: 'Accepted 7+ days ago without a first drive booked', value: awaiting.filter((a) => now - a.decision!.at > 7 * DAY && !a.firstGig?.bookedFor).length, unit: '', good: null },
    { id: 'awaiting_no_fit', label: 'Accepted drivers with no first drive that fits their area or times (demand, not the driver)', value: whyCount('no_fit'), unit: '', good: null },
    { id: 'awaiting_extract', label: 'Accepted drivers who have not shown their extract yet (shown on video before the first drive)', value: whyCount('extract'), unit: '', good: null },
    { id: 'pickup_incidents', label: 'Stuck pickups closed this week', value: closedWeek.length, unit: '', good: null },
    { id: 'pickup_solved_by_assistant', label: 'Stuck pickups solved by the assistant, no person needed', value: closedWeek.filter((j) => j.incident!.by === 'assistant').length, unit: '', good: null },
    { id: 'pickup_our_error', label: 'Stuck pickups caused by our own error (address, time, booking)', value: closedWeek.filter((j) => j.incident!.cause === 'our_error').length, unit: '', good: null },
    { id: 'open_content_gaps', label: 'Driver questions the help articles do not cover yet', value: contentGaps(threads).length, unit: '', good: null },
    dropIdx >= 0
      ? {
          id: 'biggest_drop_rate',
          label: `All-history reach: ${funnel.tiles[dropIdx].label} to ${funnel.tiles[dropIdx + 1].label}, share who get through`,
          value: round(funnel.edges[dropIdx].rate) ?? 0,
          unit: '%' as const,
          good: null,
        }
      : null,
    dropIdx >= 0
      ? { id: 'biggest_drop_lost', label: pending.label, value: pending.count, unit: '' as const, good: null }
      : null,
  ].filter((f): f is Fact => f !== null);

  return { week: isoWeek(now), from: now - WEEK, to: now, facts };
}

export { formatFact } from './check';
