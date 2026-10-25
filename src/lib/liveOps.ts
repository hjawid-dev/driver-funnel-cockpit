import { cleanNote, type Applicant, type FirstGigIssue, type Gig } from './types';
import { REVIEWER } from './types';
import { HOUR, MIN } from './time';
import { cleanReply, composeText, isTextReason, prepareTexts, REASON_LABEL, type PickupReason, type SentText } from './sms';

/**
 * Live ops: today's drives, the pre-pickup check, and the incident playbook for a driver stuck
 * at a pickup. A step "happens" when its timestamp is at or before now, so the demo clock
 * moves the other drivers along by itself and only the stuck one needs a person.
 */

export interface Contact {
  /** A role at the customer, not a private person: "Service desk". */
  role: string;
  phone: string;
}

export interface Job {
  id: string; // "JOB-201"
  driverId: string;
  driverName: string;
  customer: string; // a company
  pilot: boolean;
  from: string;
  to: string;
  area: string; // pickup area
  km: number;
  driveMin: number;
  pickupAt: number;
  deadline: number;
  reward: number; // SEK to the driver
  price: number; // SEK from the customer
  contact: Contact;
  backup: Contact;
  keyLocation: string;
  /** The pickup contact's replies to the pre-pickup messages (sent at T−24 h and T−60 min). */
  confirmed24At?: number;
  confirmed60At?: number;
  /** Ops reached the contact another way (phone), which settles a missing reply. */
  checkedByOpsAt?: number;
  /** The driver's taps in the app. */
  arrivedAt?: number;
  keysAt?: number;
  departedAt?: number;
  deliveredAt?: number;
  /** The driver reported a problem at the pickup (a tap, or in the chat). The assistant takes it first. */
  problemAt?: number;
  /** What the driver said is wrong, picked from a short list. */
  problemReason?: PickupReason;
  /** The automated texts sent to the pickup contacts (fixed templates, see sms.ts). */
  texts?: SentText[];
  /** A person was asked for before the assistant's minutes ran out. */
  escalation?: { at: number; why: 'driver' | 'ops' | 'safety' | 'text_failed' };
  /** The pickup contact answered the assistant's text (in the demo: a button). */
  contactReply?: { at: number; text: string };
  /** A new driver's first drive: ops is on standby, and delivering it makes the driver active. */
  firstDrive?: boolean;
  incident?: Incident;
}

export type IncidentCause = 'customer_keys' | 'contact_absent' | 'car_not_ready' | 'our_error' | 'other';

export const CAUSE_LABEL: Record<IncidentCause, string> = {
  customer_keys: 'Customer: keys not where agreed',
  contact_absent: 'Customer: nobody on site',
  car_not_ready: 'Customer: car not there or not ready',
  our_error: 'Our error (address, time, booking)',
  other: 'Other',
};

/** The likely cause from what the driver reported; ops confirms or changes it when closing. */
export function causeFromReason(r: PickupReason | undefined): IncidentCause {
  return r === 'keys_missing' ? 'customer_keys' : r === 'no_contact' ? 'contact_absent' : r === 'car_missing' ? 'car_not_ready' : 'other';
}

export type StepKey = 'keep_driver' | 'own_error' | 'escalate' | 'customer' | 'decide' | 'close';
export type Outcome = 'keys_found' | 'later_today' | 'new_date' | 'cancelled';

export interface Incident {
  steps: Partial<Record<StepKey, number>>;
  outcome?: { type: Outcome; at: number };
  waitPaid?: boolean;
  feeWaived?: boolean;
  closedAt?: number;
  /** Solved while the assistant had it: closed by the rules, with no person involved. */
  by?: 'assistant';
  /** Why it happened, picked when it closes: what the weekly report and prevention learn from. */
  cause?: IncidentCause;
  /** In ops' words, required when the cause is "other". */
  causeNote?: string;
  log: { at: number; text: string }[];
}

// ---------- The rulebook ----------

/** No keys this long after the driver checks in → the assistant takes it, without anyone having to call. */
export const NO_KEYS_ASSIST_MS = 5 * MIN;
/** The assistant's minutes: it texts the contact and keeps the driver calm. Not solved by then → a person. */
export const ASSIST_MS = 5 * MIN;
/** A person takes over at the latest this long before the customer must decide, whatever the assistant's clock says. */
export const ESCALATE_BEFORE_DECIDE_MS = 15 * MIN;
/** The driver hasn't checked in this long after the agreed pickup time → an alert. */
export const NOT_ARRIVED_ALERT_MS = 10 * MIN;
/** Pre-pickup messages to the pickup contact, and how long to wait for a reply before ops calls. */
export const CHECK_24_MS = 24 * HOUR;
export const CHECK_60_MS = 60 * MIN;
export const REPLY_WAIT_24_MS = 2 * HOUR;
export const REPLY_WAIT_60_MS = 20 * MIN;
/** Time at the drop-off for photos and handover, and a small margin. */
export const HANDOVER_MS = 15 * MIN;
export const MARGIN_MS = 5 * MIN;
/** The customer picks the next step this long before the last departure, so there is time to act on it. */
export const DECIDE_BEFORE_MS = 35 * MIN;

const done = (t: number | undefined, now: number) => t !== undefined && t <= now;

export type DriverStatus = 'scheduled' | 'due' | 'arrived' | 'keys' | 'driving' | 'delivered';

export const DRIVER_STATUS_LABEL: Record<DriverStatus, string> = {
  scheduled: 'Scheduled',
  due: 'Due soon',
  arrived: 'At pickup',
  keys: 'Has keys',
  driving: 'Driving to drop-off',
  delivered: 'Delivered',
};

export function driverStatus(j: Job, now: number): DriverStatus {
  if (done(j.deliveredAt, now)) return 'delivered';
  if (done(j.departedAt, now)) return 'driving';
  if (done(j.keysAt, now)) return 'keys';
  if (done(j.arrivedAt, now)) return 'arrived';
  return now >= j.pickupAt - HOUR ? 'due' : 'scheduled';
}

// ---------- Pre-pickup check ----------

export type CheckState = 'scheduled' | 'waiting' | 'confirmed' | 'no_reply' | 'by_phone';

export interface Check {
  key: '24h' | '60min';
  label: string;
  sentAt: number;
  state: CheckState;
}

function check(key: Check['key'], sentAt: number, wait: number, repliedAt: number | undefined, j: Job, now: number): Check {
  const label = key === '24h' ? 'T−24 h' : 'T−60 min';
  if (now < sentAt) return { key, label, sentAt, state: 'scheduled' };
  if (done(repliedAt, now)) return { key, label, sentAt, state: 'confirmed' };
  if (done(j.checkedByOpsAt, now)) return { key, label, sentAt, state: 'by_phone' };
  return { key, label, sentAt, state: now - sentAt >= wait ? 'no_reply' : 'waiting' };
}

/** The two messages to the pickup contact: confirm the time, where the keys are, and who is on site. */
export function pickupChecks(j: Job, now: number): Check[] {
  return [
    check('24h', j.pickupAt - CHECK_24_MS, REPLY_WAIT_24_MS, j.confirmed24At, j, now),
    check('60min', j.pickupAt - CHECK_60_MS, REPLY_WAIT_60_MS, j.confirmed60At, j, now),
  ];
}

/** A pickup nobody has confirmed: ops calls the backup contact now, before the driver is at the gate. */
export function needsConfirmation(j: Job, now: number): boolean {
  if (done(j.arrivedAt, now)) return false;
  return pickupChecks(j, now).some((c) => c.state === 'no_reply');
}

// ---------- Incidents ----------

export type EscalationWhy = 'time' | 'deadline' | 'driver' | 'ops' | 'safety' | 'text_failed';

/** Why a person took over from the assistant, in ops' words. */
export const ESCALATION_LABEL: Record<EscalationWhy, string> = {
  time: `not solved in ${ASSIST_MS / MIN} minutes`,
  deadline: 'little time left before the customer must decide',
  driver: 'the driver asked for a call',
  ops: 'ops took over',
  safety: 'the driver reported something a person must handle',
  text_failed: "the automated text couldn't be sent",
};

export interface Alert {
  at: number;
  kind: 'escalated' | 'not_arrived';
  text: string;
  why?: EscalationWhy;
}

const closed = (j: Job, now: number) => j.incident?.closedAt !== undefined && j.incident.closedAt <= now;

/** When the assistant took the problem: the driver reported it, or the keys were missing 5 minutes after check-in. */
export function assistStart(j: Job, now: number): number | null {
  const at: number[] = [];
  if (done(j.problemAt, now)) at.push(j.problemAt!);
  if (done(j.arrivedAt, now)) {
    const t = j.arrivedAt! + NO_KEYS_ASSIST_MS;
    if (t <= now && !(j.keysAt !== undefined && j.keysAt <= t)) at.push(t);
  }
  return at.length ? Math.min(...at) : null;
}

/** When a person takes over and why: the earliest of the driver or ops asking, safety, the assistant's 5 minutes, or the decision deadline. */
export function escalation(j: Job, now: number): { at: number; why: EscalationWhy } | null {
  const start = assistStart(j, now);
  const due: { at: number; why: EscalationWhy }[] = [];
  if (j.escalation && j.escalation.at <= now) due.push(j.escalation);
  if (start !== null) {
    due.push({ at: start + ASSIST_MS, why: 'time' });
    due.push({ at: Math.max(start, incidentClock(j, now).decideBy - ESCALATE_BEFORE_DECIDE_MS), why: 'deadline' });
  }
  const passed = due.filter((d) => d.at <= now).sort((a, b) => a.at - b.at);
  if (!passed.length) return null;
  // Keys in hand before that moment: nothing to hand over.
  if (j.keysAt !== undefined && j.keysAt <= passed[0].at) return null;
  return passed[0];
}

/** Why this job needs a person now, if it does. The earliest trigger counts. The assistant's minutes come first. */
export function jobAlert(j: Job, now: number): Alert | null {
  if (closed(j, now)) return null;
  if (done(j.keysAt, now) && !j.incident) return null;
  const alerts: Alert[] = [];
  const e = escalation(j, now);
  if (e) alerts.push({ at: e.at, kind: 'escalated', why: e.why, text: `Handed to a person: ${ESCALATION_LABEL[e.why]}` });
  if (!done(j.arrivedAt, now) && !done(j.problemAt, now)) {
    const at = j.pickupAt + NOT_ARRIVED_ALERT_MS;
    if (at <= now) alerts.push({ at, kind: 'not_arrived', text: `${first(j)} hasn't checked in ${NOT_ARRIVED_ALERT_MS / MIN} min after pickup time` });
  }
  if (!alerts.length) return j.incident ? { at: firstLogAt(j), kind: 'escalated', why: 'ops', text: 'Incident open' } : null;
  return alerts.sort((a, b) => a.at - b.at)[0];
}

/** The assistant has this pickup: since when, and when a person takes over unless it is solved. */
export function assisting(j: Job, now: number): { since: number; until: number } | null {
  if (closed(j, now) || done(j.keysAt, now) || jobAlert(j, now)) return null;
  const since = assistStart(j, now);
  if (since === null) return null;
  return { since, until: Math.min(since + ASSIST_MS, Math.max(since, incidentClock(j, now).decideBy - ESCALATE_BEFORE_DECIDE_MS)) };
}

export function assistedJobs(jobs: Job[], now: number): Job[] {
  return jobs.filter((j) => assisting(j, now));
}

/** What the assistant did, worked out from the job: ops sees it while it runs and, after a hand-over, what was already tried. */
export function assistantLog(j: Job, now: number): { at: number; text: string }[] {
  const since = assistStart(j, now);
  if (since === null) return [];
  const contact = j.contact.role.toLowerCase();
  const reported = j.problemAt === since;
  const out = [
    {
      at: since,
      text: reported
        ? `${first(j)} reported: ${REASON_LABEL[j.problemReason ?? 'other'].toLowerCase()}.`
        : `No keys ${NO_KEYS_ASSIST_MS / MIN} min after check-in. The assistant asked ${first(j)} what is wrong.`,
    },
    { at: since, text: `Told ${first(j)}: stay, the waiting time is paid, and a person calls if it isn't solved.` },
  ];
  // Only what was actually sent, with the template it used.
  const sent = (j.texts ?? []).filter((t) => t.at <= now);
  if (sent.length) out.push({ at: sent[0].at, text: `Automated text (${REASON_LABEL[sent[0].reason].toLowerCase()}) to the ${sent.map((t) => t.role.toLowerCase()).join(' and the ')}.` });
  if (j.contactReply && j.contactReply.at <= now) out.push({ at: j.contactReply.at, text: `The ${contact} replied: "${j.contactReply.text}" Shown to ${first(j)}.` });
  const e = escalation(j, now);
  if (e) out.push({ at: e.at, text: `Handed to a person: ${ESCALATION_LABEL[e.why]}.` });
  return out;
}

const firstLogAt = (j: Job) => j.incident?.log[0]?.at ?? j.pickupAt;

export function openIncidents(jobs: Job[], now: number): Job[] {
  return jobs.filter((j) => jobAlert(j, now)).sort((a, b) => jobAlert(a, now)!.at - jobAlert(b, now)!.at);
}

export interface Clock {
  pickupAt: number;
  /** Minutes the driver has waited since the agreed pickup time (or since checking in, if later). */
  waitedMs: number;
  decideBy: number;
  lastDeparture: number;
  deadline: number;
  margin: number;
}

/** The clock on slide 3: when the car must leave to make the deadline, and when the customer must choose. */
export function incidentClock(j: Job, now: number): Clock {
  const lastDeparture = j.deadline - j.driveMin * MIN - HANDOVER_MS - MARGIN_MS;
  const waitFrom = Math.max(j.pickupAt, j.arrivedAt ?? j.pickupAt);
  return {
    pickupAt: j.pickupAt,
    waitedMs: Math.max(0, now - waitFrom),
    decideBy: lastDeparture - DECIDE_BEFORE_MS,
    lastDeparture,
    deadline: j.deadline,
    margin: j.price - j.reward,
  };
}

export interface PlaybookStep {
  key: StepKey;
  title: string;
  /** One line on what to do; the cockpit shows the details next to it. */
  what: string;
}

/** The real-time playbook from the deck: six moves, decision before the last departure. */
export const PLAYBOOK: PlaybookStep[] = [
  { key: 'keep_driver', title: 'Keep the driver', what: 'Call the driver: stay, I\'m on it, your waiting time is paid. If they leave, the delivery is lost for certain.' },
  { key: 'own_error', title: 'Rule out our own error', what: 'Check address, time, contact and that the confirmations went out. It decides who to call.' },
  { key: 'escalate', title: 'Call the contact, then the backup', what: 'The next rung after a text: a call. The driver asks anyone on site (reception, workshop, key box) meanwhile.' },
  { key: 'customer', title: 'Customer hears it from us', what: 'Send an update before they ask: what happened, what we are doing, when they hear from us next.' },
  { key: 'decide', title: 'Decision point', what: 'No keys by then? The customer picks: later today, a new date or cancel. They decide, we bring the options.' },
  { key: 'close', title: 'Close the loop', what: 'Pay the waiting time regardless, log what happened, waive the fee in the pilot.' },
];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  keys_found: 'Keys found, driver leaves',
  later_today: 'Customer chose later today',
  new_date: 'Customer chose a new date',
  cancelled: 'Customer cancelled',
};

const hm = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const first = (j: Job) => j.driverName.split(' ')[0];

function withIncident(j: Job, now: number, change: (i: Incident) => Incident, text: string): Job {
  const base: Incident = j.incident ?? { steps: {}, log: [] };
  const next = change(base);
  return { ...j, incident: { ...next, log: [...next.log, { at: now, text }] } };
}

export function markStep(j: Job, step: StepKey, now: number): Job {
  const title = PLAYBOOK.find((s) => s.key === step)!.title;
  return withIncident(j, now, (i) => ({ ...i, steps: { ...i.steps, [step]: now } }), `${title}: done (${REVIEWER})`);
}

/** Ops records what happens next. "Keys found" lets the driver go; the others end the drive for today. */
export function setOutcome(j: Job, outcome: Outcome, now: number): Job {
  const next = withIncident(j, now, (i) => ({ ...i, outcome: { type: outcome, at: now }, steps: { ...i.steps, decide: now } }), `Decision: ${OUTCOME_LABEL[outcome].toLowerCase()} (${REVIEWER})`);
  return outcome === 'keys_found' ? { ...next, keysAt: next.keysAt ?? now } : next;
}

export type CloseResult = { ok: true; job: Job } | { ok: false; error: string };

/** Close only once there is a decision and the driver's waiting time is paid: the driver never carries the cost. */
export function closeIncident(j: Job, opts: { waitPaid: boolean; feeWaived: boolean; cause?: IncidentCause; note?: string }, now: number): CloseResult {
  if (!j.incident?.outcome) return { ok: false, error: 'Record the decision first.' };
  if (!opts.waitPaid) return { ok: false, error: "Pay the driver's waiting time before closing: it is paid regardless." };
  if (!opts.cause) return { ok: false, error: 'Pick the cause: it is what prevention learns from.' };
  const cause = opts.cause;
  const note = cleanNote(opts.note ?? '');
  if (cause === 'other' && !note) return { ok: false, error: 'Say what happened: "other" needs a few words.' };
  const job = withIncident(
    j,
    now,
    (i) => ({ ...i, waitPaid: true, feeWaived: opts.feeWaived, cause, ...(note ? { causeNote: note } : {}), closedAt: now, steps: { ...i.steps, close: now } }),
    `Closed: waiting time paid${opts.feeWaived ? ', fee waived (pilot)' : ''}, cause: ${CAUSE_LABEL[cause].toLowerCase()}${note ? ` ("${note}")` : ''} (${REVIEWER})`,
  );
  return { ok: true, job };
}

/** Ops reached the pickup contact by phone after a missing reply. */
export function confirmByPhone(j: Job, now: number): Job {
  return { ...j, checkedByOpsAt: now };
}

/** What ops tells the driver in the chat once the next step is decided. */
export function driverUpdate(j: Job, outcome: Outcome, now: number): string {
  const waitFrom = hm(Math.max(j.pickupAt, j.arrivedAt ?? j.pickupAt));
  if (outcome === 'keys_found') {
    const c = incidentClock(j, now);
    return `Keys found, thanks for waiting! You can head off: leave by ${hm(c.lastDeparture)} to make ${hm(j.deadline)}. Your waiting time from ${waitFrom} is paid.`;
  }
  const what = outcome === 'later_today' ? 'to move the pickup to later today, and we\'ll come back to you about it' : outcome === 'new_date' ? 'a new date for this drive' : 'to cancel this drive';
  return `The customer chose ${what}. You don't need to wait any longer and can leave the pickup. Your waiting time from ${waitFrom} is paid. Thanks for staying!`;
}

/** Incidents closed in the last 12 hours, newest first. */
export function closedIncidents(jobs: Job[], now: number): Job[] {
  return jobs
    .filter((j) => j.incident?.closedAt !== undefined && j.incident.closedAt <= now && now - j.incident.closedAt < 12 * HOUR)
    .sort((a, b) => b.incident!.closedAt! - a.incident!.closedAt!);
}

/** A ready-to-send update to the customer, filled from the job. A template, not AI: it goes out under our name. */
export function customerUpdate(j: Job, now: number): string {
  const c = incidentClock(j, now);
  const nextUpdate = now + 20 * MIN;
  return [
    `Hi, an update on today's pickup at ${j.from} (${j.id}).`,
    `Our driver was there at ${hm(Math.max(j.pickupAt, j.arrivedAt ?? j.pickupAt))}, but the keys weren't at the agreed place (${j.keyLocation.toLowerCase()}) and we can't reach ${j.contact.role.toLowerCase()}.`,
    `We're calling your backup contact now and the driver is waiting on site. If we have the keys by ${hm(c.lastDeparture)}, delivery by ${hm(j.deadline)} still holds.`,
    `You'll hear from us again by ${hm(nextUpdate)} at the latest.`,
  ].join(' ');
}

// ---------- The driver's taps ----------

/** The demo plans the other drivers' taps ahead of time. Once someone taps for real, the plan for later steps is dropped. */
function takeOver(j: Job, now: number): Job {
  const next = { ...j };
  for (const k of ['arrivedAt', 'keysAt', 'departedAt', 'deliveredAt'] as const) if (next[k] !== undefined && next[k]! > now) delete next[k];
  return next;
}

export function checkIn(j: Job, now: number): Job {
  const base = takeOver(j, now);
  return base.arrivedAt !== undefined ? base : { ...base, arrivedAt: now };
}

/** The driver has the keys ("customer" when the contact came out with them). */
export function gotKeys(j: Job, now: number, how: 'keys' | 'customer' = 'keys'): Job {
  const what = how === 'customer' ? 'The customer came with the keys' : 'The driver found the keys';
  // Solved while the assistant had it: closed by the rules, waiting time paid, nobody needs to act. Ops can still see it.
  if (assisting(j, now)) {
    const next = { ...checkIn(j, now), keysAt: now };
    const log = [...assistantLog(j, now), { at: now, text: `${what}. Solved by the assistant; waiting time paid by the rule.` }];
    return { ...next, incident: { steps: {}, log, outcome: { type: 'keys_found', at: now }, waitPaid: true, closedAt: now, by: 'assistant', cause: causeFromReason(j.problemReason) } };
  }
  // Ops was already alerted: the incident stays open with the outcome filled in, so ops closes it and the waiting time gets paid.
  const alerted = !!jobAlert(j, now);
  const next = { ...checkIn(j, now), keysAt: now };
  if (next.incident?.outcome || (!next.incident && !alerted)) return next;
  return withIncident(next, now, (i) => ({ ...i, outcome: { type: 'keys_found', at: now }, steps: { ...i.steps, decide: now } }), what);
}

/** A person takes over now: the driver asked for a call, ops took over, or something a person must handle. Without check-in. */
export function escalate(j: Job, why: 'driver' | 'ops' | 'safety' | 'text_failed', now: number): Job {
  if (jobAlert(j, now)?.kind === 'escalated') return j;
  return { ...j, problemAt: j.problemAt ?? now, escalation: { at: now, why } };
}

// ---------- What the driver sees ----------

/** Where a stuck pickup stands, in the driver's terms: one state, so the phone never says two things at once. */
export type DriverIncidentState = 'assistant' | 'waiting_call' | 'ops_working' | 'decided';

export function driverIncidentState(j: Job, now: number): DriverIncidentState | null {
  if (j.incident?.outcome && j.incident.outcome.at <= now) return 'decided';
  if (assisting(j, now)) return 'assistant';
  if (jobAlert(j, now)?.kind !== 'escalated') return null;
  return done(j.incident?.steps.keep_driver, now) ? 'ops_working' : 'waiting_call';
}

/** The driver's own timeline of a stuck pickup: what happened and when, without anything about the customer's internals. */
export function driverTimeline(j: Job, now: number): { at: number; text: string }[] {
  const out: { at: number; text: string }[] = [];
  const push = (at: number | undefined, text: string) => {
    if (at !== undefined && at <= now) out.push({ at, text });
  };
  const start = assistStart(j, now);
  if (start !== null) {
    push(start, j.problemAt === start ? 'You reported a problem' : 'No keys after 5 minutes');
  }
  const sent = j.texts ?? [];
  if (sent.length) push(sent[0].at, `The ${sent.map((t) => t.role.toLowerCase()).join(' and ')} ${sent.length > 1 ? 'were' : 'was'} texted`);
  push(j.contactReply?.at, `The ${j.contact.role.toLowerCase()} replied`);
  const e = escalation(j, now);
  if (e) push(e.at, 'A person from ops took over');
  push(j.incident?.steps.keep_driver, 'Ops called you');
  push(j.incident?.steps.customer, 'Ops updated the customer');
  const o = j.incident?.outcome;
  if (o) push(o.at, j.incident?.by === 'assistant' ? 'Solved: you have the keys' : o.type === 'keys_found' ? 'Keys found' : OUTCOME_LABEL[o.type]);
  return out.sort((a, b) => a.at - b.at);
}

/** The pickup contact answered the assistant's text. */
export function contactReplies(j: Job, text: string, now: number): Job {
  return { ...j, contactReply: { at: now, text: cleanReply(text) } };
}

/**
 * The driver tapped Send on the text they were shown. The texts go out only for a reason that has a
 * template; if they can't go out (switched off, already sent), a person takes over at once.
 */
export function sendPickupTexts(j: Job, now: number, enabled = true): Job {
  const r = prepareTexts(j, j.problemReason ?? 'other', now, enabled);
  if (!r.ok) return escalate(j, 'text_failed', now);
  return { ...j, texts: [...(j.texts ?? []), ...r.texts] };
}

/**
 * The driver picked what is wrong: that tap is the confirmation. A reason with a template sends the
 * pre-approved text at once (the content was approved once, when the template was); damage or feeling
 * unsafe goes to a person at once, with no assistant and no text; "something else" goes to the chat.
 */
export function reportReason(j: Job, reason: PickupReason, now: number, textsEnabled = true): Job {
  const next = reportProblem(j, now, reason);
  if (reason === 'damage' || reason === 'unsafe') return escalate(next, 'safety', now);
  return isTextReason(reason) && !(next.texts ?? []).length ? sendPickupTexts(next, now, textsEnabled) : next;
}

/** The text a reason would send, for the button that says what it does. */
export function textFor(j: Job, reason: PickupReason): string | null {
  return isTextReason(reason) ? composeText(j, reason) : null;
}

export function depart(j: Job, now: number): Job {
  return { ...takeOver(j, now), departedAt: now };
}

export function deliver(j: Job, now: number): Job {
  return { ...takeOver(j, now), deliveredAt: now };
}

/**
 * The driver reported a problem at the pickup. A reason picked from the list replaces "something else",
 * never the other way round. Nothing is sent to the customer here: a text needs the driver's Send.
 */
export function reportProblem(j: Job, now: number, reason: PickupReason = 'other'): Job {
  const keep = j.problemReason && j.problemReason !== 'other' ? j.problemReason : reason;
  return { ...checkIn(j, now), problemAt: j.problemAt ?? now, problemReason: keep };
}

/** The job this driver has today, if any: from an hour before pickup until it is delivered or closed. */
export function currentJob(jobs: Job[], driverId: string, now: number): Job | null {
  return (
    jobs.find(
      (j) =>
        j.driverId === driverId &&
        !done(j.deliveredAt, now) &&
        !(j.incident?.closedAt !== undefined && j.incident.outcome?.type !== 'keys_found') &&
        now >= j.pickupAt - 2 * HOUR &&
        now <= j.deadline + HOUR,
    ) ?? null
  );
}

/** What the assistant may know about a drive: where and when the pickup is and where the driver is. No customer, address or price. */
export function jobFact(j: Job, now: number): string {
  const s = driverStatus(j, now);
  const where = s === 'arrived' ? 'at the pickup, no keys yet' : DRIVER_STATUS_LABEL[s].toLowerCase();
  // Kept under the 160 characters a fact may have.
  const a = assisting(j, now);
  const texted = (j.texts ?? []).some((t) => t.at <= now);
  const handling = a
    ? `; ${texted ? 'contact texted' : 'nothing sent to the customer yet'}, a person calls at ${hm(a.until)} if not solved`
    : jobAlert(j, now)?.kind === 'escalated'
      ? '; a person is on it, calls within 5 min'
      : '';
  return `On a job now: pickup in ${j.area} at ${hm(j.pickupAt)}, status: ${where}${handling}`;
}

/** Today's pickups for the list: from 12 hours ago to 24 hours ahead, soonest first. */
export function todaysJobs(jobs: Job[], now: number): Job[] {
  return jobs.filter((j) => j.pickupAt >= now - 12 * HOUR && j.pickupAt <= now + 24 * HOUR).sort((a, b) => a.pickupAt - b.pickupAt);
}

// ---------- Demo data ----------

type JobSeed = {
  name: string;
  pickupInMin: number; // relative to now
  hours: number; // pickup → deadline
  from: string;
  to: string;
  area: string;
  km: number;
  driveMin: number;
  reward: number;
  price: number;
  customer: string;
  pilot?: boolean;
  /** Minutes relative to pickup; undefined = not (yet). */
  confirm24?: number;
  confirm60?: number;
  arrive?: number;
  keys?: number;
  depart?: number;
  deliver?: number;
  problem?: number;
};

/**
 * Today in the demo. Julia's drive is the Part 1 case: a pilot customer, 35 km, 3 hours to the
 * deadline, 500 SEK to the driver and 780 SEK from the customer. Nobody answered the pre-pickup
 * messages, and she has been at the gate without keys for a little over 10 minutes. She told the
 * assistant 9 minutes ago; it texted the contacts, got no reply, and handed her to a person 4 minutes ago.
 */
const JOBS: JobSeed[] = [
  { name: 'Filip Nyström', pickupInMin: -150, hours: 3, from: 'Workshop, Nacka', to: 'Dealership, Södermalm', area: 'Nacka', km: 9, driveMin: 25, reward: 320, price: 520, customer: 'Nacka Bil & Service', confirm24: -23 * 60, confirm60: -50, arrive: -5, keys: 3, depart: 10, deliver: 40 },
  { name: 'Julia Lindgren', pickupInMin: -12, hours: 3, from: 'Dealership, Solna', to: 'Customer, Upplands Väsby', area: 'Solna', km: 35, driveMin: 50, reward: 500, price: 780, customer: 'Solna Bilcenter', pilot: true, arrive: -2, problem: 3 },
  { name: 'Isak Bergström', pickupInMin: 45, hours: 2, from: 'Leasing depot, Bromma', to: 'Customer, Kungsholmen', area: 'Bromma', km: 11, driveMin: 30, reward: 340, price: 560, customer: 'Bromma Leasing', confirm24: -22 * 60, confirm60: -55, arrive: -6, keys: 2, depart: 8, deliver: 45 },
  { name: 'Agnes Ekström', pickupInMin: 180, hours: 3, from: 'Rental hub, Södermalm', to: 'Workshop, Huddinge', area: 'Södermalm', km: 16, driveMin: 30, reward: 350, price: 580, customer: 'City Rental Stockholm', confirm24: -21 * 60, confirm60: -50, arrive: -4, keys: 3, depart: 9, deliver: 45 },
  { name: 'Omar Khalil', pickupInMin: 330, hours: 3, from: 'Dealership, Sundbyberg', to: 'Customer, Täby', area: 'Sundbyberg', km: 18, driveMin: 35, reward: 360, price: 600, customer: 'Sundbyberg Motor', confirm60: -45, arrive: -3, keys: 4, depart: 10, deliver: 50 },
];

/** Demo jobs for active drivers in the seed (matched by name). */
export function seedJobs(apps: Applicant[], now: number): Job[] {
  const out: Job[] = [];
  JOBS.forEach((s, i) => {
    const a = apps.find((x) => x.name === s.name);
    if (!a) return;
    const pickupAt = Math.round((now + s.pickupInMin * MIN) / MIN) * MIN;
    const rel = (m: number | undefined) => (m === undefined ? undefined : pickupAt + m * MIN);
    const job: Job = {
      id: `JOB-${201 + i}`,
      driverId: a.id,
      driverName: a.name,
      customer: s.customer,
      pilot: !!s.pilot,
      from: s.from,
      to: s.to,
      area: s.area,
      km: s.km,
      driveMin: s.driveMin,
      pickupAt,
      deadline: pickupAt + s.hours * HOUR,
      reward: s.reward,
      price: s.price,
      contact: { role: 'Service desk', phone: '08-123 45 00' },
      backup: { role: 'Site manager', phone: '070-123 45 67' },
      keyLocation: 'Key box by the service entrance',
    };
    const set = (k: 'confirmed24At' | 'confirmed60At' | 'arrivedAt' | 'keysAt' | 'departedAt' | 'deliveredAt' | 'problemAt', m: number | undefined) => {
      const t = rel(m);
      if (t !== undefined) job[k] = t;
    };
    set('confirmed24At', s.confirm24);
    set('confirmed60At', s.confirm60);
    set('arrivedAt', s.arrive);
    set('keysAt', s.keys);
    set('departedAt', s.depart);
    set('deliveredAt', s.deliver);
    set('problemAt', s.problem);
    // Julia picked "keys missing" and tapped Send: the texts went out from the booking's template.
    if (s.problem !== undefined) {
      job.problemReason = 'keys_missing';
      const r = prepareTexts(job, 'keys_missing', job.problemAt!, true);
      if (r.ok) job.texts = r.texts;
    }
    out.push(job);
  });
  return out;
}

// ---------- A new driver's first drive ----------

const CONTACT: Contact = { role: 'Service desk', phone: '08-123 45 00' };
const BACKUP: Contact = { role: 'Site manager', phone: '070-123 45 67' };

/**
 * The job for an accepted driver's booked first drive. In the demo the pickup contact confirms
 * both pre-pickup messages, so the first drive runs smoothly and the driver's own taps move it on.
 */
export function firstDriveJob(a: Applicant, gig: Gig | undefined): Job | null {
  const at = a.firstGig?.bookedFor;
  if (!at || a.firstGig?.doneAt) return null;
  const from = gig?.from ?? `Curated first drive, ${a.area}`;
  return {
    id: gig ? gig.id : `JOB-F${a.id.replace(/\D/g, '')}`,
    driverId: a.id,
    driverName: a.name,
    customer: from.split(',')[0],
    pilot: false,
    from,
    to: gig?.to ?? `Customer, ${a.area}`,
    area: gig?.area ?? a.area,
    km: gig?.km ?? 12,
    driveMin: gig?.minutes ?? 25,
    pickupAt: at,
    deadline: at + 3 * HOUR,
    reward: gig?.pay ?? 330,
    price: Math.round(((gig?.pay ?? 330) * 1.6) / 10) * 10,
    contact: CONTACT,
    backup: BACKUP,
    keyLocation: 'Reception, ask for the car by its job number',
    confirmed24At: at - CHECK_24_MS + 40 * MIN,
    confirmed60At: at - CHECK_60_MS + 10 * MIN,
    firstDrive: true,
  };
}

/** Keep the jobs in step with an applicant's first drive: add it when booked, move it when rebooked (until it starts). */
export function syncFirstDrive(jobs: Job[], a: Applicant, gigs: Gig[]): Job[] {
  const job = firstDriveJob(a, gigs.find((g) => g.id === a.firstGig?.gigId));
  if (!job) return jobs;
  const existing = jobs.find((j) => j.driverId === a.id && j.firstDrive);
  if (!existing) return [...jobs, job];
  if (existing.arrivedAt !== undefined || (existing.pickupAt === job.pickupAt && existing.id === job.id)) return jobs;
  return jobs.map((j) => (j === existing ? job : j));
}

/** How the first drive went, for first-gig quality: on time, and no incident. An incident brings its cause and what happened. */
export function firstDriveResult(j: Job): { onTime: boolean; ok: boolean; issue?: { cause: FirstGigIssue; note: string } } {
  const onTime = (j.deliveredAt ?? Infinity) <= j.deadline;
  const i = j.incident;
  if (!i) return { onTime, ok: true };
  const cause: FirstGigIssue = i.cause ?? causeFromReason(j.problemReason);
  const what = i.by === 'assistant' ? `solved by the assistant` : i.outcome ? OUTCOME_LABEL[i.outcome.type].toLowerCase() : 'incident at the pickup';
  const note = cleanNote([j.problemReason ? REASON_LABEL[j.problemReason] : 'Problem at the pickup', what, i.causeNote].filter(Boolean).join('; '));
  return { onTime, ok: false, issue: { cause, note } };
}

/** Move every timestamp of a job by `delta` ms (an old save, rebased to now). */
export function shiftJob(j: Job, delta: number): Job {
  const s = (t: number | undefined) => (t === undefined ? undefined : t + delta);
  const keys = ['confirmed24At', 'confirmed60At', 'checkedByOpsAt', 'arrivedAt', 'keysAt', 'departedAt', 'deliveredAt', 'problemAt'] as const;
  const moved: Job = { ...j, pickupAt: j.pickupAt + delta, deadline: j.deadline + delta };
  for (const k of keys) if (j[k] !== undefined) moved[k] = s(j[k]);
  if (j.escalation) moved.escalation = { ...j.escalation, at: j.escalation.at + delta };
  if (j.contactReply) moved.contactReply = { ...j.contactReply, at: j.contactReply.at + delta };
  if (j.texts) moved.texts = j.texts.map((t) => ({ ...t, at: t.at + delta }));
  if (j.incident) {
    const i = j.incident;
    moved.incident = {
      ...i,
      steps: Object.fromEntries(Object.entries(i.steps).map(([k, t]) => [k, t! + delta])) as Incident['steps'],
      ...(i.outcome ? { outcome: { ...i.outcome, at: i.outcome.at + delta } } : {}),
      ...(i.closedAt !== undefined ? { closedAt: i.closedAt + delta } : {}),
      log: i.log.map((e) => ({ ...e, at: e.at + delta })),
    };
  }
  return moved;
}

export function isJob(j: unknown): j is Job {
  const x = j as Job;
  return !!x && typeof x.id === 'string' && typeof x.driverId === 'string' && typeof x.pickupAt === 'number' && typeof x.deadline === 'number';
}
