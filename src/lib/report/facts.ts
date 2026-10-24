import type { Job } from '../liveOps';
import type { Applicant } from '../types';
import type { ChatThread } from '../chat/types';
import { computeFunnel, computeKpis, isReviewDecision, median } from '../kpis';
import { deriveStage, isAccepted } from '../stage';
import { chatStats, contentGaps } from '../chat/threads';
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
  const decided = apps.filter((a) => isReviewDecision(a) && inWindow(a.decision!.at, from, to));
  return {
    newApps: apps.filter((a) => inWindow(a.registeredAt, from, to)).length,
    filesComplete: apps.filter((a) => inWindow(a.docsCompleteAt, from, to)).length,
    decisions: decided.length,
    accepted: decided.filter(isAccepted).length,
    firstDrives: apps.filter((a) => inWindow(a.firstGig?.doneAt, from, to)).length,
    medianDecisionH: round(median(decided.map((a) => (a.decision!.at - a.docsCompleteAt!) / HOUR))),
  };
}

export function weeklyFacts(apps: Applicant[], threads: ChatThread[], now: number, jobs: Job[] = []): WeeklyFacts {
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
  const dropIdx = funnel.edges.findIndex((e) => e.biggestDrop);
  const review = apps.filter((a) => deriveStage(a) === 'review');
  const awaiting = apps.filter((a) => deriveStage(a) === 'accepted');

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

    // Now against target
    status('document_completion', 'Document completion (registered 7+ days ago)', '%', kpi.docCompletion ?? null, 85, true),
    status('time_to_decision', 'Time from registration to decision, median of all decisions', 'h', kpi.timeToDecision ?? null, 48, false),
    status('activation', 'Activation: first drive within 14 days of acceptance', '%', kpi.activation ?? null, 75, true),
    status('application_to_active', 'Application to active driver, last 30 days (north star)', '%', kpi.appToActive ?? null, 35, true),
    status('first_drive_quality', 'First drives on time without incident', '%', kpi.quality ?? null, 95, true),
    status('chat_target', 'Answered-by-AI target', '%', round(chat.rate), 95, true),

    // Where it is stuck right now
    { id: 'review_queue', label: 'Files waiting for a decision', value: review.length, unit: '', good: null },
    { id: 'review_overdue', label: 'Files waiting more than 48 h (overdue)', value: review.filter((a) => now - a.docsCompleteAt! > 48 * HOUR).length, unit: '', good: null },
    { id: 'awaiting_first_drive', label: 'Accepted drivers without a first drive', value: awaiting.length, unit: '', good: null },
    { id: 'awaiting_over_7_days', label: 'Accepted 7+ days ago without a first drive booked', value: awaiting.filter((a) => now - a.decision!.at > 7 * DAY && !a.firstGig?.bookedFor).length, unit: '', good: null },
    { id: 'pickup_incidents', label: 'Stuck pickups closed this week', value: closedWeek.length, unit: '', good: null },
    { id: 'pickup_solved_by_assistant', label: 'Stuck pickups solved by the assistant, no person needed', value: closedWeek.filter((j) => j.incident!.by === 'assistant').length, unit: '', good: null },
    { id: 'pickup_our_error', label: 'Stuck pickups caused by our own error (address, time, booking)', value: closedWeek.filter((j) => j.incident!.cause === 'our_error').length, unit: '', good: null },
    { id: 'open_content_gaps', label: 'Driver questions the help articles do not cover yet', value: contentGaps(threads).length, unit: '', good: null },
    dropIdx >= 0
      ? {
          id: 'biggest_drop_rate',
          label: `Biggest drop-off: ${funnel.tiles[dropIdx].label} to ${funnel.tiles[dropIdx + 1].label}, share who get through`,
          value: round(funnel.edges[dropIdx].rate) ?? 0,
          unit: '%' as const,
          good: null,
        }
      : null,
    dropIdx >= 0
      ? { id: 'biggest_drop_lost', label: `People lost between ${funnel.tiles[dropIdx].label} and ${funnel.tiles[dropIdx + 1].label}`, value: funnel.tiles[dropIdx].reached - funnel.tiles[dropIdx + 1].reached, unit: '' as const, good: null }
      : null,
  ].filter((f): f is Fact => f !== null);

  return { week: isoWeek(now), from: now - WEEK, to: now, facts };
}

export { formatFact } from './check';
