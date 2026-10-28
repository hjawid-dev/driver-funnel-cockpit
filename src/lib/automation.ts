import type { Applicant } from './types';
import { activationReminderReady } from './activation';
import { REJECT_REASONS } from './types';
import { NO_RESPONSE_MS, nudgeMessage, reminderSilenced, reminderTimes } from './nudges';
import { DAY, HOUR, atLocal, formatDateTime } from './time';
import type { ChatThread } from './chat/types';
import { slaFor } from './chat/threads';
import { assistStart, jobAlert, pickupChecks, type Job } from './liveOps';
import { SHOW_BY_MS } from './extract';

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
  | 'live_assist'
  | 'live_alert'
  | 'extract_check'
  | 'extract_due'
  | 'released';

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

function deriveAutomationEvents(apps: Applicant[], from: number, to: number): AutoEvent[] {
  const out: AutoEvent[] = [];
  for (const a of apps) {
    const push = (at: number, audience: AutoEvent['audience'], kind: AutoKind, title: string, body?: string) => {
      if (at > from && at <= to) out.push({ at, applicantId: a.id, name: a.name, audience, kind, title, ...(body ? { body } : {}) });
    };
    const decidedBy = (t: number) => !!a.decision && a.decision.at <= t;
    const completeBy = (t: number) => (a.firstDocsSubmittedAt ?? a.docsCompleteAt ?? Infinity) <= t;

    // Reminders while the file is incomplete (2 h, 24 h and day 7; never at night; see reminderTimes).
    const reminders = reminderTimes(a);
    reminders.forEach((t, i) => {
      if (completeBy(t) || decidedBy(t) || reminderSilenced(a, t)) return;
      const stillIncomplete = !a.docsCompleteAt && !a.decision;
      push(t, 'driver', 'nudge', `Reminder ${i + 1} of ${reminders.length}`, stillIncomplete ? nudgeMessage(a) : `Hi ${first(a)}, a few things were still missing in your application.`);
      push(t, 'ops', 'nudge', `Auto-nudge ${i + 1} sent to ${a.name}`);
    });

    // A reminder the driver asked for in the chat ("remind me tomorrow").
    const snooze = a.reminders?.snooze;
    if (snooze && !completeBy(snooze.until) && !decidedBy(snooze.until) && !reminderSilenced({ ...a, reminders: { offAt: a.reminders?.offAt } }, snooze.until)) {
      push(snooze.until, 'driver', 'nudge', 'The reminder you asked for', nudgeMessage(a));
      push(snooze.until, 'ops', 'nudge', `Requested reminder sent to ${a.name}`);
    }

    // 14 days without a complete file: a person pauses it (never automatic, never a rejection).
    const t14 = a.registeredAt + NO_RESPONSE_MS;
    if (!completeBy(t14) && !decidedBy(t14)) push(t14, 'ops', 'close_task', `Task: ${a.name}'s file is incomplete after 14 days. Check recent contact, then pause it.`);

    // Extract call reminder.
    if (a.callAt) {
      push(a.callAt - HOUR, 'driver', 'call_reminder', 'Your call is in 1 hour', `If your extract has arrived, have it ready; otherwise show it before driving. No copy is stored. Call at ${time(a.callAt)}.`);
      push(a.callAt - HOUR, 'ops', 'call_reminder', `Onboarding call with ${a.name} at ${time(a.callAt)}`);
    }

    // Review SLA alerts to owner + backup.
    if (!a.prequalIssue || !a.decision) {
      const t24 = a.registeredAt + 24 * HOUR;
      const t48 = a.registeredAt + 48 * HOUR;
      if (!decidedBy(t24)) push(t24, 'ops', 'sla_24', `SLA alert: ${a.name} has 24 h left for a decision`);
      if (!decidedBy(t48)) push(t48, 'ops', 'sla_overdue', `Overdue: ${a.name} has waited 48 h for a decision`);
    }

    if (!a.decision) continue;
    const d = a.decision;

    if (d.type === 'rejected') {
      if (d.reason === 'no_response_14d') {
        push(d.at, 'driver', 'decision', 'Your application is paused', `Hi ${first(a)}, we have paused your application because it is not complete yet. Message us here when you want to continue, and we will open it again.`);
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

    // Accepted. Without the extract shown yet, the one condition is said up front.
    const shownBy = (t: number) => a.extractShownAt !== undefined && a.extractShownAt <= t;
    push(
      d.at,
      'driver',
      'decision',
      'Welcome aboard!',
      shownBy(d.at)
        ? `Hi ${first(a)}, you're accepted. Pick your first drive below: short, easy jobs with ops on standby.`
        : `Hi ${first(a)}, you're accepted! One thing before your first drive: show us your criminal-record extract in a 5-minute video check when it arrives. Pick your first drive below; the reservation is conditional until the pre-drive check is complete. Five days is a planning floor, not a promise that the extract will arrive.`,
    );
    push(d.at, 'driver', 'offers', 'First-gig offers ready', 'Check the current matching jobs in your application. If none fit, your owner follows up; no job is guaranteed until booked.');
    // The 5-minute extract check, when the extract arrived after the decision.
    if (a.extractCheckAt) {
      push(a.extractCheckAt - HOUR, 'driver', 'extract_check', 'Your extract check is in 1 hour', `5 minutes on video at ${time(a.extractCheckAt)}. Have your extract at hand; we only look at it and never keep a copy.`);
      push(a.extractCheckAt - HOUR, 'ops', 'extract_check', `Extract check with ${a.name} at ${time(a.extractCheckAt)} (5 min)`);
    }
    // A booked first drive needs the extract shown the day before: a reminder a day ahead of that, then the drive is released.
    const booking = a.firstGig?.bookedFor ?? a.firstGig?.released?.bookedFor;
    if (booking) {
      const by = booking - SHOW_BY_MS;
      if (!shownBy(by - DAY) && d.at < by - DAY) {
        push(by - DAY, 'driver', 'extract_due', 'Show your extract by tomorrow', `Your first drive is ${time(booking)}. Show your extract by ${time(by)} in a 5-minute check, or the drive is released for reassignment. Your acceptance stays.`);
        push(by - DAY, 'ops', 'extract_due', `Task: ${a.name} must show the extract by ${time(by)}, or the first drive is released`);
      }
    }
    const released = a.firstGig?.released;
    if (released) {
      push(released.at, 'driver', 'released', 'Your first drive was released for reassignment', `The extract wasn't shown by the day before, so the drive ${time(released.bookedFor)} was released for reassignment. You're still accepted: show your extract and pick a new drive.`);
      push(released.at, 'ops', 'released', `First drive released: ${a.name} hadn't shown the extract (${time(released.bookedFor)})`);
    }

    const gig = a.firstGig;
    const reminderAt = gig?.bookedFor ? gig.bookedFor - 12 * HOUR : 0;
    if (gig?.bookedFor && (!gig.doneAt || gig.doneAt > reminderAt)) {
      push(reminderAt, 'driver', 'gig_reminder', 'Your first drive is coming up', `Start ${time(gig.bookedFor)}. Ops is on standby the whole drive.`);
    }
    if (gig?.doneAt) push(gig.doneAt, 'driver', 'activated', 'You are now an active driver', 'Great first drive. New jobs show up in the app every day.');

    const booked = !!gig?.bookedFor;
    const bookedBy = (t: number) => booked && (gig?.bookedAt ?? d.at) <= t;
    const done = (t: number) => !!gig?.doneAt && gig.doneAt <= t;
    const interestedAt = (t: number) => a.activationReason?.reason !== 'not_interested' || a.activationReason.at > t;
    if (activationReminderReady(a, d.at + 7 * DAY) && interestedAt(d.at + 7 * DAY) && !bookedBy(d.at + 7 * DAY) && !done(d.at + 7 * DAY)) push(d.at + 7 * DAY, 'driver', 'book_task', 'Choose your first drive', `Hi ${first(a)}, you are ready for your first drive. Open the matching offers and choose a drive that fits. If no jobs fit, contact Ops; you do not need to book an unsuitable drive.`);
    if (activationReminderReady(a, d.at + 14 * DAY) && interestedAt(d.at + 14 * DAY) && !bookedBy(d.at + 14 * DAY) && !done(d.at + 14 * DAY) && !(a.activationReason && a.activationReason.at <= d.at + 14 * DAY)) push(d.at + 14 * DAY, 'ops', 'call_task', `Task: call ${a.name}, no first booking after 14 days`);
    if (interestedAt(d.at + 30 * DAY) && !booked && !done(d.at + 30 * DAY)) push(d.at + 30 * DAY, 'ops', 'dormant', `${a.name} marked dormant (label only, nothing is blocked)`);
  }
  return out.sort((x, y) => x.at - y.at);
}

/** Materialize notifications before a mutation so later state cannot rewrite a sent message. */
export function materializeAutomation(a: Applicant, now: number, afterMutation = false): Applicant {
  if (a.automationRecordedUntil === now && !afterMutation) return a;
  const key = (e: AutoEvent) => `${e.kind}:${e.audience}:${e.at}`;
  const history = new Map((a.automationHistory ?? []).map(e => [key(e), e]));
  for (const event of deriveAutomationEvents([a], afterMutation ? now - 1 : a.automationRecordedUntil ?? a.registeredAt - 1, now)) if (!history.has(key(event))) history.set(key(event), event);
  return { ...a, automationHistory: [...history.values()].sort((a,b) => a.at-b.at), automationRecordedUntil: now };
}

export function automationEvents(apps: Applicant[], from: number, to: number): AutoEvent[] {
  return apps.flatMap(a => [
    ...(a.automationHistory ?? []).filter(e => e.at > from && e.at <= to),
    ...deriveAutomationEvents([a], Math.max(from, a.automationRecordedUntil ?? -Infinity), to),
  ]).sort((a,b) => a.at-b.at);
}

/** A question handed to a person and still unanswered alerts ops: after 15 minutes, or 10 when something is wrong on a drive. */
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
          ? `Urgent: ${t.name} has a problem on a drive and has waited 10 min. Call the driver now.`
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
      const deadline = c.replyBy;
      const atDeadline = pickupChecks(j, deadline).find((x) => x.key === c.key)!;
      if (inWindow(deadline) && atDeadline.state === 'no_reply') {
        out.push({ ...base, at: deadline, kind: 'pickup_task', title: `Task: no reply to the pre-pickup message (${c.label}) for ${j.id}. Call the ${j.contact.role.toLowerCase()}.` });
      }
    }

    // The assistant takes a missing key by itself; a person comes in when its minutes run out (taps and chat are logged where they happen).
    const start = assistStart(j, to);
    if (start !== null && start !== j.problemAt && inWindow(start)) {
      out.push({ ...base, at: start, kind: 'live_assist', title: `The assistant took a stuck pickup (${j.id}): asked the driver what is wrong. No contact message is recorded until the driver confirms it.` });
    }
    const alert = jobAlert(j, to);
    if (alert && (alert.kind === 'not_arrived' || alert.why === 'time' || alert.why === 'deadline') && inWindow(alert.at)) {
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
    [n(['live_assist']), 'assistant pickup'],
    [n(['live_alert']), 'live ops alert'],
    [n(['pickup_check']), 'pre-pickup message'],
    [n(['weekly_report']), 'weekly report'],
    [n(['call_reminder']), 'call reminder'],
    [n(['welcome_task', 'book_task', 'call_task', 'close_task', 'pickup_task', 'extract_due']), 'task'],
    [n(['extract_check']), 'extract check'],
    [n(['released']), 'first drive released'],
    [events.filter((e) => e.audience === 'driver' && e.kind === 'decision').length, 'decision message'],
  ] as const;
  const text = parts.filter(([c]) => c > 0).map(([c, label]) => `${c} ${label}${c === 1 ? '' : 's'}`);
  return text.length ? text.join(' · ') : 'Nothing was due in this window';
}
