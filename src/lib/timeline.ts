import type { Applicant } from './types';
import { DOC_KEYS, REJECT_REASONS } from './types';
import { DECISION_LABEL } from './criteria';
import { nudgeState } from './nudges';

export type TimelineKind = 'registered' | 'doc' | 'nudge' | 'complete' | 'decision' | 'call' | 'booked' | 'gig';

export interface TimelineEvent {
  at: number;
  kind: TimelineKind;
  label: string;
  detail?: string;
  upcoming?: boolean;
  tone?: 'ok' | 'bad' | 'neutral';
}

const DOC_NAME = { licence: 'Driving licence', id: 'ID (BankID)', extract: 'Extract arrived', photo: 'Profile photo' } as const;

/** Every stage transition with its timestamp: the data the funnel metrics are built from. */
export function buildTimeline(a: Applicant, now: number): TimelineEvent[] {
  const ev: TimelineEvent[] = [{ at: a.registeredAt, kind: 'registered', label: 'Registered', detail: a.area }];

  for (const k of DOC_KEYS) {
    const t = a.docTimes?.[k];
    if (t) ev.push({ at: t, kind: 'doc', label: k === 'extract' ? DOC_NAME[k] : `${DOC_NAME[k]} received`, ...(k === 'extract' ? { detail: 'Nothing uploaded' } : {}) });
  }

  const n = nudgeState(a, now);
  n.autoSent.forEach((t, i) => ev.push({ at: t, kind: 'nudge', label: `Auto-nudge ${i + 1}`, detail: 'Scheduled workflow' }));
  n.manual.forEach((t) => ev.push({ at: t, kind: 'nudge', label: 'Manual nudge', detail: 'Logged by ops' }));
  if (n.nextAt) ev.push({ at: n.nextAt, kind: 'nudge', label: `Auto-nudge ${n.autoSent.length + 1}`, detail: 'Scheduled', upcoming: true });

  const submitted = a.firstDocsSubmittedAt ?? a.docsCompleteAt;
  if (submitted) ev.push({ at: submitted, kind: 'complete', label: 'File complete', detail: 'Auto-queued for review' });

  if (a.decision) {
    const d = a.decision;
    if (d.type === 'rejected') {
      const reason = REJECT_REASONS.find((r) => r.value === d.reason)?.label ?? 'No reason';
      ev.push({ at: d.at, kind: 'decision', label: 'Rejected', detail: `${reason}${d.note ? ` · ${d.note}` : ''} · ${d.by}`, tone: 'bad' });
    } else {
      ev.push({
        at: d.at,
        kind: 'decision',
        label: DECISION_LABEL[d.type],
        detail: `${d.by}${d.secondReviewer ? ` + ${d.secondReviewer}` : ''}`,
        tone: 'ok',
      });
    }
  }

  if (a.welcomeCallAt) ev.push({ at: a.welcomeCallAt, kind: 'call', label: 'Welcome call' });

  const gig = a.firstGig;
  if (gig?.doneAt) {
    const good = gig.onTime && gig.ok;
    const detail = good ? 'On time, no incident' : [gig.onTime === false && 'Late', gig.ok === false && 'Incident or unhappy customer'].filter(Boolean).join(' · ');
    ev.push({ at: gig.doneAt, kind: 'gig', label: 'First gig completed', detail, tone: good ? 'ok' : 'bad' });
  } else if (gig?.bookedFor) {
    ev.push({ at: gig.bookedFor, kind: 'booked', label: 'First gig booked', upcoming: gig.bookedFor > now });
  }

  return ev.sort((x, y) => x.at - y.at);
}
