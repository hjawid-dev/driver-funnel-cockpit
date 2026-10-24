import type { Applicant } from './types';
import type { ChatThread } from './chat/types';
import { deriveStage } from './stage';
import { slaStatus } from './sla';
import { isNoResponse } from './nudges';
import { activationBucket } from './activation';
import { needsConfirmation, openIncidents, type Job } from './liveOps';

export type TodayTab = 'live' | 'review' | 'missing' | 'awaiting' | 'chat';

export interface TodayItem {
  key: 'urgent' | 'toclose' | 'pickups' | 'questions' | 'overdue' | 'activation' | 'close';
  tab: TodayTab;
  count: number;
  label: string;
  urgent: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What needs a person today, most urgent first. Only items with something to do. */
export function todayItems(apps: Applicant[], threads: ChatThread[], now: number, jobs: Job[] = []): TodayItem[] {
  const waiting = threads.filter((t) => t.status === 'waiting');
  const urgentThreads = waiting.filter((t) => t.reason === 'urgent');
  const open = openIncidents(jobs, now);
  // Decided (e.g. the keys turned up) but not closed: no longer urgent, but ops still closes the loop.
  const incidents = open.filter((j) => !j.incident?.outcome);
  const toClose = open.length - incidents.length;
  // One problem, one item: an urgent chat about a drive with an open incident is that incident.
  const onIncident = new Set(open.map((j) => j.driverId));
  const urgent = incidents.length + urgentThreads.filter((t) => !t.applicantId || !onIncident.has(t.applicantId)).length;
  const questions = waiting.length - urgentThreads.length;
  const pickups = jobs.filter((j) => !onIncident.has(j.driverId) && needsConfirmation(j, now)).length;
  const overdue = apps.filter((a) => deriveStage(a) === 'review' && slaStatus(a.docsCompleteAt!, now).bucket === 'overdue').length;
  const activation = apps.filter((a) => {
    if (deriveStage(a) !== 'accepted') return false;
    const b = activationBucket(a.decision!.at, now);
    return b === 'call' || b === 'book';
  }).length;
  const close = apps.filter((a) => deriveStage(a) === 'registered' && isNoResponse(a, now)).length;

  const items: TodayItem[] = [
    { key: 'urgent', tab: incidents.length ? 'live' : 'chat', count: urgent, label: plural(urgent, 'urgent, on a drive', 'urgent, on a drive'), urgent: true },
    { key: 'toclose', tab: 'live', count: toClose, label: plural(toClose, 'incident to close', 'incidents to close'), urgent: false },
    { key: 'pickups', tab: 'live', count: pickups, label: plural(pickups, 'pickup not confirmed', 'pickups not confirmed'), urgent: false },
    { key: 'overdue', tab: 'review', count: overdue, label: plural(overdue, 'review overdue', 'reviews overdue'), urgent: true },
    { key: 'questions', tab: 'chat', count: questions, label: plural(questions, 'question waiting', 'questions waiting'), urgent: false },
    { key: 'activation', tab: 'awaiting', count: activation, label: plural(activation, 'first gig to chase', 'first gigs to chase'), urgent: false },
    { key: 'close', tab: 'missing', count: close, label: plural(close, 'file to close', 'files to close'), urgent: false },
  ];
  return items.filter((i) => i.count > 0);
}
