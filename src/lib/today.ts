import type { Applicant } from './types';
import type { ChatThread } from './chat/types';
import { deriveStage } from './stage';
import { slaStatus } from './sla';
import { isNoResponse } from './nudges';
import { activationBucket } from './activation';
import { checkMissed, needsExtract } from './extract';
import { assistedJobs, needsConfirmation, openIncidents, siteCallDue, type Job } from './liveOps';

export type TodayTab = 'live' | 'review' | 'missing' | 'awaiting' | 'chat';

export interface TodayItem {
  key: 'urgent' | 'urgentchat' | 'assistant' | 'toclose' | 'pickups' | 'sitecall' | 'questions' | 'overdue' | 'extract' | 'activation' | 'close';
  tab: TodayTab;
  count: number;
  label: string;
  urgent: boolean;
  /** Exactly who is counted: jobs on Live ops, threads in Driver questions, applicants in the funnel lists. The list opens on these. */
  ids: string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const isOverdueReview = (a: Applicant, now: number) => deriveStage(a) === 'review' && slaStatus(a.registeredAt, now).bucket === 'overdue';
export const isToChase = (a: Applicant, now: number) => {
  if (deriveStage(a) !== 'accepted') return false;
  const b = activationBucket(a.decision!.at, now);
  return b === 'call' || b === 'book';
};
/** A 5-minute extract check is booked and not done yet: the last step before a first drive. */
export const isExtractCheck = (a: Applicant, now: number) => needsExtract(a) && a.extractCheckAt !== undefined && !checkMissed(a, now);
export const isToClose = (a: Applicant, now: number) => deriveStage(a) === 'registered' && isNoResponse(a, now);

/** What needs a person today, most urgent first. Only items with something to do. */
export function todayItems(apps: Applicant[], threads: ChatThread[], now: number, jobs: Job[] = []): TodayItem[] {
  const waiting = threads.filter((t) => t.status === 'waiting');
  const urgentThreads = waiting.filter((t) => t.reason === 'urgent');
  const open = openIncidents(jobs, now);
  // Decided (e.g. the keys turned up) but not closed: no longer urgent, but ops still closes the loop.
  const incidents = open.filter((j) => !j.incident?.outcome);
  const toClose = open.filter((j) => j.incident?.outcome);
  // One problem, one item: an urgent chat about a drive with an open incident is that incident.
  // The assistant's first minutes at a stuck pickup: shown, but nothing for a person to do yet.
  const assisted = assistedJobs(jobs, now);
  const onIncident = new Set([...open, ...assisted].map((j) => j.driverId));
  const urgentChats = urgentThreads.filter((t) => !t.applicantId || !onIncident.has(t.applicantId));
  const questions = waiting.filter((t) => t.reason !== 'urgent');
  const pickups = jobs.filter((j) => !onIncident.has(j.driverId) && needsConfirmation(j, now));
  const appIds = (pred: (a: Applicant, now: number) => boolean) => apps.filter((a) => pred(a, now)).map((a) => a.id);

  const item = (key: TodayItem['key'], tab: TodayTab, ids: string[], one: string, many: string, urgent: boolean): TodayItem => ({
    key,
    tab,
    count: ids.length,
    label: plural(ids.length, one, many),
    urgent,
    ids,
  });
  const items: TodayItem[] = [
    item('urgent', 'live', incidents.map((j) => j.id), 'urgent, on a drive', 'urgent, on a drive', true),
    item('urgentchat', 'chat', urgentChats.map((t) => t.id), 'urgent question', 'urgent questions', true),
    item('assistant', 'live', assisted.map((j) => j.id), 'handled by the assistant', 'handled by the assistant', false),
    item('toclose', 'live', toClose.map((j) => j.id), 'incident to close', 'incidents to close', false),
    item('pickups', 'live', pickups.map((j) => j.id), 'pickup not confirmed', 'pickups not confirmed', false),
    item('sitecall', 'live', jobs.filter((j) => !onIncident.has(j.driverId) && siteCallDue(j, now)).map((j) => j.id), 'new site to call', 'new sites to call', false),
    item('overdue', 'review', appIds(isOverdueReview), 'review overdue', 'reviews overdue', true),
    item('questions', 'chat', questions.map((t) => t.id), 'question waiting', 'questions waiting', false),
    item('extract', 'awaiting', appIds(isExtractCheck), 'extract check booked', 'extract checks booked', false),
    item('activation', 'awaiting', appIds(isToChase), 'first gig to chase', 'first gigs to chase', false),
    item('close', 'missing', appIds(isToClose), 'file to close', 'files to close', false),
  ];
  return items.filter((i) => i.count > 0);
}
