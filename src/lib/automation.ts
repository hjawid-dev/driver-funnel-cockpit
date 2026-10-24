import type { Applicant } from './types';
import { REJECT_REASONS } from './types';
import { NUDGE_OFFSETS, NO_RESPONSE_MS, nudgeMessage, reminderSilenced } from './nudges';
import { DAY, HOUR, atLocal, formatDateTime } from './time';
import type { ChatThread } from './chat/types';
import { slaFor } from './chat/threads';
import { jobAlert, pickupChecks, REPLY_WAIT_24_MS, REPLY_WAIT_60_MS, type Job } from './liveOps';

/**
 * The automation layer: what runs by itself (HubSpot workflows and the driver chat in
 * production). Every event is derived from timestamps that already exist, so the same rules
 * produce the driver's inbox, the ops feed, and what happened during a fast-forward.
 */
export type AutoKind =
  | 'nudge'
  | 'call_reminder'
  | 'sla_24'
  | 'sla_overdue'
  | 'close_task'
  | 'decision'
  | 'welcome_task'
  | 'offers'
  | 'book_task'
  | 'call_task'
  | 'dormant'
  | 'gig_reminder'
  | 'activated'
  | 'chat_sla'
  | 'weekly_report'
  | 'pickup_check'
  | 'pickup_task'
  | 'live_alert';

export interface AutoEvent {
  at: number;
  applicantId: string;
  name: string;
  audience: 'driver' | 'ops';
  kind: AutoKind;
  title: string;
  body?: string;
}

const first = (a: Applicant) => a.name.split(' ')[0];
const time = (ts: number) => formatDateTime(ts);

export function automationEvents(apps: Applicant[], from: number, to: number): AutoEvent[] {
  const out: AutoEvent[] = [];
  for (const a of apps) {
    const push = (at: number, audience: AutoEvent['audience'], kind: AutoKind, title: string, body?: string) => {
      if (at > from && at <= to) out.push({ at, applicantId: a.id, name: a.name, audience, kind, title, ...(body ? { body } : {}) });
    };
    const decidedBy = (t: number) => !!a.decision && a.decision.at <= t;
    const completeBy = (t: number) => !!a.docsCompleteAt && a.docsCompleteAt <= t;

    // Reminders while the file is incomplete (2 h, 24 h, 72 h after registration).
    NUDGE_OFFSETS.forEach((o, i) => {
      const t = a.registeredAt + o;
      if (completeBy(t) || decidedBy(t) || reminderSilenced(a, t)) return;
      const stillIncomplete = !a.docsCompleteAt && !a.decision;
      push(t, 'driver', 'nudge', `Reminder ${i + 1} of 3`, stillIncomplete ? nudgeMessage(a) : `Hi ${first(a)}, a few things were still missing in your application.`);
      push(t, 'ops', 'nudge', `Auto-nudge ${i + 1} sent to ${a.name}`);
    });

    // A reminder the driver asked for in the chat ("remind me tomorrow").
    const snooze = a.reminders?.snooze;
    if (snooze && !completeBy(snooze.until) && !decidedBy(snooze.until) && !reminderSilenced({ ...a, reminders: { offAt: a.reminders?.offAt } }, snooze.until)) {
      push(snooze.until, 'driver', 'nudge', 'The reminder you asked for', nudgeMessage(a));
      push(snooze.until, 'ops', 'nudge', `Requested reminder sent to ${a.name}`);
    }

    // 14 days without a complete file: a person closes it (never automatic).
    const t14 = a.registeredAt + NO_RESPONSE_MS;
    if (!completeBy(t14) && !decidedBy(t14)) push(t14, 'ops', 'close_task', `Task: ${a.name} has not answered in 14 days. Review and close.`);

    // Extract call reminder.
    if (a.callAt) {
      push(a.callAt - HOUR, 'driver', 'call_reminder', 'Your call is in 1 hour', `Have your extract ready. We only look at it and never keep a copy. Call at ${time(a.callAt)}.`);
      push(a.callAt - HOUR, 'ops', 'call_reminder', `Onboarding call with ${a.name} at ${time(a.callAt)}`);
    }

    // Review SLA alerts to owner + backup.
    if (a.docsCompleteAt) {
      const t24 = a.docsCompleteAt + 24 * HOUR;
      const t48 = a.docsCompleteAt + 48 * HOUR;
      if (!decidedBy(t24)) push(t24, 'ops', 'sla_24', `SLA alert: ${a.name} has 24 h left for a decision`);
      if (!decidedBy(t48)) push(t48, 'ops', 'sla_overdue', `Overdue: ${a.name} has waited 48 h for a decision`);
    }

    if (!a.decision) continue;
    const d = a.decision;

    if (d.type === 'rejected') {
      if (d.reason === 'no_response_14d') {
        push(d.at, 'driver', 'decision', 'Your application is closed', `Hi ${first(a)}, we closed your application because it was not completed. You are welcome to apply again.`);
      } else {
        const label = REJECT_REASONS.find((r) => r.value === d.reason)?.label ?? 'See below';
        push(
          d.at,
          'driver',
          'decision',
          'Decision on your application',
          `Hi ${first(a)}, we can't offer you driving assignments right now. Reason: ${label}. You can ask for an explanation and a review in the chat; you get the result of the review within two weeks.`,
        );
      }
      continue;
    }

    // Accepted
    push(d.at, 'driver', 'decision', 'Welcome aboard!', `Hi ${first(a)}, you're accepted. Pick your first drive below: short, easy jobs with ops on standby.`);
    push(d.at, 'driver', 'offers', 'First-gig offers ready', 'Three easy jobs near you. Pick one and it is booked.');
    // The first drive is normally booked in the onboarding call; only if it wasn't does ops call within 24 h.
    if (!a.firstGig?.bookedFor) push(d.at + HOUR, 'ops', 'welcome_task', `Task: no first drive booked in the call. Welcome call to ${a.name}, due within 24 h`);

    const gig = a.firstGig;
    const reminderAt = gig?.bookedFor ? gig.bookedFor - 12 * HOUR : 0;
    if (gig?.bookedFor && (!gig.doneAt || gig.doneAt > reminderAt)) {
      push(reminderAt, 'driver', 'gig_reminder', 'Your first drive is tomorrow', `Start ${time(gig.bookedFor)}. Ops is on standby the whole drive.`);
    }
    if (gig?.doneAt) push(gig.doneAt, 'driver', 'activated', 'You are now an active driver', 'Great first drive. New jobs show up in the app every day.');

    const booked = !!gig?.bookedFor;
    const done = (t: number) => !!gig?.doneAt && gig.doneAt <= t;
    if (!booked && !done(d.at + 7 * DAY)) push(d.at + 7 * DAY, 'ops', 'book_task', `Task: book a first gig for ${a.name} (7 days since acceptance)`);
    if (!done(d.at + 14 * DAY)) push(d.at + 14 * DAY, 'ops', 'call_task', `Task: call ${a.name}, no first gig after 14 days`);
    if (!done(d.at + 30 * DAY)) push(d.at + 30 * DAY, 'ops', 'dormant', `${a.name} marked dormant (label only, nothing is blocked)`);
  }
  return out.sort((x, y) => x.at - y.at);
}

/** A question handed to a person and still unanswered alerts ops: after 15 minutes, or 5 when something is wrong on a drive. */
export function chatEvents(threads: ChatThread[], from: number, to: number): AutoEvent[] {
  return threads
    .filter((t) => t.status === 'waiting' && t.waitingSince !== undefined)
    .map((t) => ({ at: t.waitingSince! + slaFor(t), t }))
    .filter(({ at }) => at > from && at <= to)
    .map(({ at, t }) => ({
      at,
      applicantId: t.applicantId ?? 'visitor',
      name: t.name,
      audience: 'ops' as const,
      kind: 'chat_sla' as const,
      title:
        t.reason === 'urgent'
          ? `Urgent: ${t.name} has a problem on a drive and has waited 5 min. Call the driver now.`
          : `Chat alert: ${t.name} has waited 15 min for a person`,
    }));
}

/** The weekly report goes out every Monday at 08:00 (Slack or HubSpot in production). */
export function reportEvents(from: number, to: number): AutoEvent[] {
  const out: AutoEvent[] = [];
  for (let d = 0; ; d++) {
    const t = atLocal(from, d, 8);
    if (t > to) break;
    if (t > from && new Date(t).getDay() === 1) {
      out.push({ at: t, applicantId: 'report', name: 'Weekly report', audience: 'ops', kind: 'weekly_report', title: 'Weekly report posted to #driver-ops' });
    }
  }
  return out;
}

/**
 * Live ops: the pre-pickup messages to the pickup contact, a task when nobody replies, and an
 * urgent alert when a driver is at the pickup without keys (or hasn't checked in).
 */
export function liveOpsEvents(jobs: Job[], from: number, to: number): AutoEvent[] {
  const out: AutoEvent[] = [];
  const inWindow = (t: number) => t > from && t <= to;
  for (const j of jobs) {
    const base = { applicantId: j.driverId, name: j.driverName, audience: 'ops' as const };
    // Judge each check as it stood when its reply window ran out.
    for (const c of pickupChecks(j, to)) {
      if (c.state === 'scheduled') continue;
      if (inWindow(c.sentAt)) out.push({ ...base, at: c.sentAt, kind: 'pickup_check', title: `Pre-pickup message (${c.label}) to ${j.contact.role.toLowerCase()} for ${j.id}, ${j.from}` });
      const deadline = c.sentAt + (c.key === '24h' ? REPLY_WAIT_24_MS : REPLY_WAIT_60_MS);
      const atDeadline = pickupChecks(j, deadline).find((x) => x.key === c.key)!;
      if (inWindow(deadline) && atDeadline.state === 'no_reply') {
        out.push({ ...base, at: deadline, kind: 'pickup_task', title: `Task: no reply to the ${c.label} message for ${j.id}. Call the ${j.backup.role.toLowerCase()}.` });
      }
    }
    const alert = jobAlert(j, to);
    if (alert && alert.kind !== 'driver_reported' && inWindow(alert.at)) {
      out.push({ ...base, at: alert.at, kind: 'live_alert', title: `Urgent: ${alert.text} (${j.id}). Call ${j.driverName.split(' ')[0]} now.` });
    }
  }
  return out;
}

/** The driver's inbox: everything sent to them, newest first. */
export function driverInbox(a: Applicant, now: number): AutoEvent[] {
  return automationEvents([a], a.registeredAt - 1, now)
    .filter((e) => e.audience === 'driver')
    .reverse();
}

/** Short summary of what automation did in a window: "4 nudges · 2 SLA alerts · 1 task". */
export function summarize(events: AutoEvent[]): string {
  const ops = events.filter((e) => e.audience === 'ops');
  const n = (kinds: AutoKind[]) => ops.filter((e) => kinds.includes(e.kind)).length;
  const parts = [
    [n(['nudge']), 'nudge'],
    [n(['sla_24', 'sla_overdue']), 'SLA alert'],
    [n(['chat_sla']), 'chat alert'],
    [n(['live_alert']), 'live ops alert'],
    [n(['pickup_check']), 'pre-pickup message'],
    [n(['weekly_report']), 'weekly report'],
    [n(['call_reminder']), 'call reminder'],
    [n(['welcome_task', 'book_task', 'call_task', 'close_task', 'pickup_task']), 'task'],
    [events.filter((e) => e.audience === 'driver' && e.kind === 'decision').length, 'decision message'],
  ] as const;
  const text = parts.filter(([c]) => c > 0).map(([c, label]) => `${c} ${label}${c === 1 ? '' : 's'}`);
  return text.length ? text.join(' · ') : 'Nothing was due in this window';
}
