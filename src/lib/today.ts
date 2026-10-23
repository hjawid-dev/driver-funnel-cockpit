import type { Applicant } from './types';
import type { ChatThread } from './chat/types';
import { deriveStage } from './stage';
import { slaStatus } from './sla';
import { isNoResponse } from './nudges';
import { activationBucket } from './activation';

export type TodayTab = 'review' | 'missing' | 'awaiting' | 'chat';

export interface TodayItem {
  key: 'urgent' | 'questions' | 'overdue' | 'activation' | 'close';
  tab: TodayTab;
  count: number;
  label: string;
  urgent: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What needs a person today, most urgent first. Only items with something to do. */
export function todayItems(apps: Applicant[], threads: ChatThread[], now: number): TodayItem[] {
  const waiting = threads.filter((t) => t.status === 'waiting');
  const urgent = waiting.filter((t) => t.reason === 'urgent').length;
  const questions = waiting.length - urgent;
  const overdue = apps.filter((a) => deriveStage(a) === 'review' && slaStatus(a.docsCompleteAt!, now).bucket === 'overdue').length;
  const activation = apps.filter((a) => {
    if (deriveStage(a) !== 'accepted') return false;
    const b = activationBucket(a.decision!.at, now);
    return b === 'call' || b === 'book';
  }).length;
  const close = apps.filter((a) => deriveStage(a) === 'registered' && isNoResponse(a, now)).length;

  const items: TodayItem[] = [
    { key: 'urgent', tab: 'chat', count: urgent, label: plural(urgent, 'urgent, on a drive', 'urgent, on a drive'), urgent: true },
    { key: 'overdue', tab: 'review', count: overdue, label: plural(overdue, 'review overdue', 'reviews overdue'), urgent: true },
    { key: 'questions', tab: 'chat', count: questions, label: plural(questions, 'question waiting', 'questions waiting'), urgent: false },
    { key: 'activation', tab: 'awaiting', count: activation, label: plural(activation, 'first gig to chase', 'first gigs to chase'), urgent: false },
    { key: 'close', tab: 'missing', count: close, label: plural(close, 'file to close', 'files to close'), urgent: false },
  ];
  return items.filter((i) => i.count > 0);
}
