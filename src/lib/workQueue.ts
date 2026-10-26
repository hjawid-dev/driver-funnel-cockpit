import type { Applicant, DocKey, Gig } from './types';
import { deriveStage } from './stage';
import { slaStatus } from './sla';
import { isNoResponse, nudgeState, outstandingDocs } from './nudges';
import { activationBucket, activationReason, ACTIVATION_REASON_LABEL } from './activation';
import { ago } from './time';
import { evaluate } from './criteria';

/**
 * One queue for the driver funnel: everyone a person may need to act on, with the next action spelled out.
 * The filters are the three places people get stuck: missing documents, review and the first gig.
 */
export type QueueFilter = 'action' | 'missing' | 'review' | 'awaiting' | 'all';

export const QUEUE_FILTER_LABEL: Record<QueueFilter, string> = {
  action: 'Needs action',
  missing: 'Missing documents',
  review: 'In review',
  awaiting: 'Awaiting first gig',
  all: 'All applicants',
};

export type WorkTone = 'bad' | 'warn' | 'ok' | 'muted';

export interface WorkItem {
  a: Applicant;
  stage: 'registered' | 'review' | 'accepted';
  /** Why they are here now, in a few words. */
  status: string;
  /** One more line: what is missing, how long they have waited. */
  detail: string;
  tone: WorkTone;
  /** What a person does next. */
  next: string;
  /** Something a person should do now; the rest runs by itself or waits on the driver. */
  needsAction: boolean;
  /** Lower comes first. */
  rank: number;
}

const DOC_SHORT: Record<DocKey, string> = { licence: 'licence', id: 'BankID', extract: 'extract', photo: 'photo' };

function missingItem(a: Applicant, now: number): WorkItem {
  const missing = outstandingDocs(a).map((k) => DOC_SHORT[k]);
  const detail = `${missing.length ? `Missing: ${missing.join(', ')}` : 'Nothing missing'} · registered ${ago(a.registeredAt, now)}`;
  const base = { a, stage: 'registered' as const, detail };
  if (a.prequalIssue) return { ...base, status: "Doesn't meet a must-have", tone: 'bad', next: 'Close the file with a reason', needsAction: true, rank: 2 };
  if (isNoResponse(a, now)) return { ...base, status: 'No response in 14 days', tone: 'bad', next: 'Close the file: no response', needsAction: true, rank: 2 };
  const sla = slaStatus(a.registeredAt, now);
  if (sla.bucket === 'overdue') return { ...base, status: `Decision ${sla.label.toLowerCase()}`, tone: 'bad', next: 'Owner contacts applicant: resolve missing documents', needsAction: true, rank: 1 };
  const n = nudgeState(a, now);
  if (n.nextAt === null && !a.reminders?.offAt) return { ...base, status: 'All three reminders sent', tone: 'warn', next: 'Request the documents in person', needsAction: true, rank: 5 };
  return { ...base, status: n.label, tone: 'muted', next: 'Reminders run by themselves', needsAction: false, rank: 8 };
}

function reviewItem(a: Applicant, now: number): WorkItem {
  const sla = slaStatus(a.registeredAt, now);
  return {
    a,
    stage: 'review',
    status: sla.label,
    detail: `File complete ${ago(a.docsCompleteAt!, now)}`,
    tone: sla.bucket === 'overdue' ? 'bad' : sla.bucket === 'warn' ? 'warn' : 'muted',
    next: evaluate(a).suggestedReject === 'no_valid_licence' ? 'Select the rejection reason and Reject' : 'Review and decide',
    needsAction: true,
    rank: sla.bucket === 'overdue' ? 0 : sla.bucket === 'warn' ? 3 : 4,
  };
}

function awaitingItem(a: Applicant, apps: Applicant[], gigs: Gig[], now: number): WorkItem {
  const bucket = activationBucket(a.decision!.at, now);
  const reason = activationReason(a, apps, gigs, now);
  const base = { a, stage: 'accepted' as const, detail: `${ACTIVATION_REASON_LABEL[reason]} · accepted ${ago(a.decision!.at, now)}` };
  if (a.firstGig?.bookedFor) return { ...base, status: reason === 'extract' ? 'Booked; pre-drive check outstanding' : 'First drive booked', tone: reason === 'extract' ? 'warn' : 'ok', next: reason === 'extract' ? 'Complete the pre-drive check before release deadline' : 'Track the booked drive in Live Ops', needsAction: reason === 'extract', rank: reason === 'extract' ? 2 : 7 };
  if (reason === 'not_interested') return { ...base, status: 'No longer interested', tone: 'muted', next: 'No action unless the driver wants to return', needsAction: false, rank: 9 };
  if (bucket === 'call') return { ...base, status: 'No first booking in 14 days', tone: 'bad', next: 'Call the driver', needsAction: true, rank: 1 };
  if (bucket === 'dormant') return { ...base, status: 'Dormant, 30+ days', tone: 'muted', next: 'Monthly re-engagement', needsAction: false, rank: 9 };
  if (reason === 'booked') return { ...base, status: 'First gig booked', tone: 'ok', next: 'Nothing: on track', needsAction: false, rank: 7 };
  if (bucket === 'book') return { ...base, status: 'No first gig booked after 7 days', tone: 'warn', next: 'Automatic reminder: choose a first drive in the app', needsAction: false, rank: 3 };
  if (reason === 'extract') return { ...base, status: 'Extract not shown yet', tone: 'warn', next: 'Book the extract check', needsAction: true, rank: 5 };
  return { ...base, status: 'On track', tone: 'muted', next: 'Driver chooses a matching job in the app', needsAction: false, rank: 8 };
}

/** Everyone still on the way to active, each with a status and a next action. */
export function workItems(apps: Applicant[], gigs: Gig[], now: number): WorkItem[] {
  const items: WorkItem[] = [];
  for (const a of apps) {
    const s = deriveStage(a);
    if (s === 'registered') items.push(missingItem(a, now));
    else if (s === 'review') items.push(reviewItem(a, now));
    else if (s === 'accepted') items.push(awaitingItem(a, apps, gigs, now));
  }
  return items.sort((x, y) => x.rank - y.rank || since(x) - since(y));
}

/** Oldest first within the same rank. */
const since = (w: WorkItem) => (w.stage === 'review' ? w.a.registeredAt : w.stage === 'accepted' ? w.a.decision!.at : w.a.registeredAt);

const STAGE_OF: Record<Exclude<QueueFilter, 'action' | 'all'>, WorkItem['stage']> = { missing: 'registered', review: 'review', awaiting: 'accepted' };

export function filterItems(items: WorkItem[], f: QueueFilter): WorkItem[] {
  if (f === 'all') return items;
  if (f === 'action') return items.filter((w) => w.needsAction);
  return items.filter((w) => w.stage === STAGE_OF[f]);
}

export function queueCounts(items: WorkItem[], total: number): Record<QueueFilter, number> {
  return {
    action: filterItems(items, 'action').length,
    missing: filterItems(items, 'missing').length,
    review: filterItems(items, 'review').length,
    awaiting: filterItems(items, 'awaiting').length,
    all: total,
  };
}
