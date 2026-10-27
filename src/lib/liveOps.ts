import { cleanNote, type Applicant, type FirstGigIssue, type Gig } from './types';
import { REVIEWER } from './types';
import { canStartDrive } from './eligibility';
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
  unassigned?: boolean;
  previousDriverId?: string;
  customer: string; // a company
  pilot: boolean;
  from: string;
  to: string;
  area: string; // pickup area
  km: number;
  driveMin: number;
  pickupAt: number;
  bookedAt?: number;
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
  phoneChecks?: Partial<Record<'24h' | '60min', number>>;
  customerWarnedAt?: number;
  customerSatisfied?: boolean;
  originalDeadline?: number;
  deliveryAgreement?: { at: number; by: string; deadline: number };
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
  escalation?: { at: number; why: 'driver' | 'ops' | 'safety' | 'text_failed' | 'phoned' };
  /** The pickup contact answered the assistant's text (in the demo: a button). */
  contactReply?: { at: number; text: string };
  /** A new driver's first drive: ops is on standby, and delivering it makes the driver active. */
  firstDrive?: boolean;
  dispatchReady?: boolean;
  /** The Part 1 case as given: no pre-pickup check was in place for this drive. */
  asInCase?: boolean;
  solutionExample?: boolean;
  /** Our first drive from this address; the same confirmation process applies. */
  newSite?: boolean;
  /** Legacy demo field; no routine site-call requirement remains. */
  siteCalledAt?: number;
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
export type Outcome = 'keys_found' | 'later_today' | 'new_date' | 'cancelled' | 'ops_stopped';

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
  /** A pilot customer: the account owner at our side was told while it happened. */
  accountOwnerAt?: number;
  /** What the driver got for the drive that didn't happen (half the reward), on top of the waiting time. */
  cancelPay?: number;
  /** A 15-minute review with the customer's booker is booked: what went wrong on site, and the fix. */
  reviewBooked?: boolean;
  reviewAt?: number;
  reviewOwner?: string;
  waitingEndedAt?: number;
  nextCustomerUpdateAt?: number;
  ownError?: { at: number; found: boolean; note?: string };
  rebooking?: { owner: string; dueAt: number; status: 'open' | 'booked'; pickupAt?: number; bookedAt?: number; replacementId?: string; deadline?: number; driverConfirmed?: boolean };
  log: { at: number; text: string }[];
}

// ---------- The rulebook ----------

/** No keys this long after the driver checks in → the assistant takes it, without anyone having to call. */
export const NO_KEYS_ASSIST_MS = 5 * MIN;
/** The assistant's minutes: it texts the contact and keeps the driver calm. Not solved by then → a person. */
export const ASSIST_MS = 10 * MIN;
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
  replyBy: number;
  state: CheckState;
}

function check(key: Check['key'], sentAt: number, wait: number, repliedAt: number | undefined, j: Job, now: number): Check {
  const label = j.bookedAt !== undefined && j.bookedAt >= j.pickupAt - 2 * HOUR ? 'At late booking' : key === '24h' ? 'T−24 h' : 'T−60 min';
  if (now < sentAt) return { key, label, sentAt, replyBy: sentAt + wait, state: 'scheduled' };
  if (done(repliedAt, now) && repliedAt! >= sentAt) return { key, label, sentAt, replyBy: sentAt + wait, state: 'confirmed' };
  if (done(j.phoneChecks?.[key], now) && j.phoneChecks![key]! >= sentAt) return { key, label, sentAt, replyBy: sentAt + wait, state: 'by_phone' };
  return { key, label, sentAt, replyBy: sentAt + wait, state: now - sentAt >= wait ? 'no_reply' : 'waiting' };
}

/** The two messages to the pickup contact: confirm the time, where the keys are, and who is on site. */
export function pickupChecks(j: Job, now: number): Check[] {
  // As in the case: nobody confirmed anything before the pickup.
  if (j.asInCase) return [];
  // A late booking gets one relevant confirmation, not two identical messages.
  if (j.bookedAt !== undefined && j.bookedAt >= j.pickupAt - 2 * HOUR) return [
    check('60min', j.bookedAt, Math.min(REPLY_WAIT_60_MS, Math.max(0, (j.pickupAt - j.bookedAt) / 2)), j.confirmed60At, j, now),
  ];
  return [
    check('24h', Math.max(j.pickupAt - CHECK_24_MS, j.bookedAt ?? -Infinity), REPLY_WAIT_24_MS, j.confirmed24At, j, now),
    check('60min', j.pickupAt - CHECK_60_MS, REPLY_WAIT_60_MS, j.confirmed60At, j, now),
  ];
}

/** A pickup nobody has confirmed: ops calls the backup contact now, before the driver is at the gate. */
export function needsConfirmation(j: Job, now: number): boolean {
  if (done(j.arrivedAt, now)) return false;
  return pickupChecks(j, now).some((c) => c.state === 'no_reply');
}

// ---------- Incidents ----------

export type EscalationWhy = 'time' | 'deadline' | 'driver' | 'ops' | 'safety' | 'text_failed' | 'phoned';

/** Why a person took over from the assistant, in ops' words. */
export const ESCALATION_LABEL: Record<EscalationWhy, string> = {
  time: `not solved in ${ASSIST_MS / MIN} minutes`,
  deadline: 'little time left before the customer must decide',
  driver: 'the driver asked for a call',
  ops: 'ops took over',
  safety: 'the driver reported something a person must handle',
  text_failed: "the automated text couldn't be sent",
  phoned: 'the driver called ops',
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
  // As in the case: today's process, no assistant. The driver calls ops.
  if (j.asInCase) return null;
  const at: number[] = [];
  if (done(j.problemAt, now)) at.push(j.problemAt!);
  if (done(j.arrivedAt, now)) {
    const t = j.arrivedAt! + NO_KEYS_ASSIST_MS;
    if (t <= now && !(j.keysAt !== undefined && j.keysAt <= t)) at.push(t);
  }
  return at.length ? Math.min(...at) : null;
}

/** When a person takes over and why: the earliest of the driver or ops asking, safety, the assistant's 10 minutes, or the decision deadline. */
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
  if (!j.unassigned && now > j.deadline && !done(j.deliveredAt, now)) return { at: j.deadline, kind: 'escalated', why: 'deadline', text: 'Delivery overdue; confirm status with the driver' };
  if (done(j.keysAt, now) && !j.incident) return null;
  const alerts: Alert[] = [];
  const e = escalation(j, now);
  if (e) alerts.push({ at: e.at, kind: 'escalated', why: e.why, text: e.why === 'phoned' ? `${first(j)} called ops` : `Handed to a person: ${ESCALATION_LABEL[e.why]}` });
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
    waitedMs: Math.max(0, Math.min(now, j.keysAt ?? Infinity, j.incident?.waitingEndedAt ?? Infinity, j.incident?.outcome?.at ?? Infinity) - waitFrom),
    decideBy: lastDeparture - DECIDE_BEFORE_MS,
    lastDeparture,
    deadline: j.deadline,
    margin: j.price - j.reward,
  };
}

const PROBLEM_SHORT: Record<PickupReason, string> = {
  keys_missing: 'No keys',
  no_contact: 'Nobody on site',
  car_missing: 'Car not ready',
  damage: 'Damage or breakdown',
  unsafe: 'Driver feels unsafe',
  other: 'Problem at the pickup',
};

/** The problem in a few words, for the top of a stuck pickup: how long, what is wrong, who isn't answering. */
export function problemSummary(j: Job, now: number): string[] {
  if (j.incident?.outcome || done(j.keysAt, now)) return [];
  const out = [`Waited ${Math.round(incidentClock(j, now).waitedMs / MIN)} min`];
  if (done(j.problemAt, now)) out.push(PROBLEM_SHORT[j.problemReason ?? 'other']);
  if (j.problemReason !== 'no_contact' && !(j.contactReply && j.contactReply.at <= now)) out.push('Contact not answering');
  return out;
}

export interface PlaybookStep {
  key: StepKey;
  title: string;
  /** One line on what to do; the cockpit shows the details next to it. */
  what: string;
}

/** The real-time playbook from the deck: six moves, decision before the last departure. */
export const PLAYBOOK: PlaybookStep[] = [
  { key: 'keep_driver', title: 'Keep the driver', what: 'Call the driver: stay until the decision point, I\'m on it. Your waiting time is paid, also if the drive is cancelled. If continuing is unsafe or no longer feasible, escalate to the duty lead.' },
  { key: 'own_error', title: 'Rule out our own error', what: 'Check address, time, contact and that the confirmations went out. It decides who to call.' },
  { key: 'escalate', title: 'Call the contact, then the backup', what: 'The next rung after a text: a call. The driver asks anyone on site (reception, workshop, key box) meanwhile.' },
  { key: 'customer', title: 'Customer hears it from us', what: 'Send an update before they ask: what happened, what we are doing, when they hear from us next. A pilot customer: tell the account owner too.' },
  { key: 'decide', title: 'Decision point', what: 'Recommend a feasible option and confirm it with the customer. If unreachable, escalate to the duty lead; record an Ops stop only with confirmed authority.' },
  { key: 'close', title: 'Close the loop', what: 'Confirm waiting compensation, log the cause and owner. Proposed cancellation pay: half the reward. Book a review for pilot incidents; fee waivers need approval.' },
];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  keys_found: 'Keys found, driver leaves',
  later_today: 'Customer chose later today',
  new_date: 'Customer chose a new date',
  cancelled: 'Customer cancelled',
  ops_stopped: 'Authorised Ops stop: customer unreachable',
};

const hm = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const first = (j: Job) => j.driverName.split(' ')[0];

function withIncident(j: Job, now: number, change: (i: Incident) => Incident, text: string): Job {
  const base: Incident = j.incident ?? { steps: {}, log: [], nextCustomerUpdateAt: Math.min(now, j.escalation?.at ?? j.problemAt ?? now) + 10 * MIN };
  const next = change(base);
  return { ...j, incident: { ...next, log: [...next.log, { at: now, text }] } };
}

export function markStep(j: Job, step: StepKey, now: number): Job {
  if (step === 'own_error' && !j.incident?.ownError) return j;
  const title = PLAYBOOK.find((s) => s.key === step)!.title;
  const owned = step === 'keep_driver' && (!j.escalation || j.escalation.at > now) ? escalate(j, 'ops', now) : j;
  return withIncident(owned, now, (i) => ({ ...i, steps: { ...i.steps, [step]: now }, ...(step === 'customer' ? { nextCustomerUpdateAt: now + 20 * MIN } : {}) }), `${title}: done (${REVIEWER})`);
}

/** Ops records what happens next. "Keys found" lets the driver go; the others end the drive for today. */
export function setOutcome(j: Job, outcome: Outcome, now: number): Job {
  if (j.incident?.closedAt !== undefined || j.incident?.outcome) return j;
  if (outcome === 'keys_found' && now > incidentClock(j, now).lastDeparture) return j;
  const next = withIncident(j, now, (i) => ({ ...i, outcome: { type: outcome, at: now }, waitingEndedAt: now, ...(outcome === 'later_today' || outcome === 'new_date' || outcome === 'ops_stopped' ? { rebooking: { owner: REVIEWER, dueAt: now + HOUR, status: 'open' as const } } : {}), steps: { ...i.steps, decide: now } }), `Decision: ${OUTCOME_LABEL[outcome].toLowerCase()} (${REVIEWER})`);
  return outcome === 'keys_found' ? { ...next, keysAt: next.keysAt ?? now } : next;
}

export type CloseResult = { ok: true; job: Job } | { ok: false; error: string };

/** Close only once there is a decision and the driver's waiting time is paid: the driver never carries the cost. */
/** The driver came and waited, and the drive didn't happen (cancelled or another day): half the reward on top of the waiting time. A proposal, to set with the team. */
export const CANCEL_SHARE = 0.5;

export function cancelPayFor(j: Job): number {
  const o = j.incident?.outcome?.type;
  return o && o !== 'keys_found' ? Math.round(j.reward * CANCEL_SHARE) : 0;
}

/** A pilot customer: the account owner hears it while it happens, not from the weekly report. */
export function tellAccountOwner(j: Job, now: number): Job {
  return withIncident(j, now, (i) => ({ ...i, accountOwnerAt: now }), `Account owner told: pilot customer, ${j.customer} (${REVIEWER})`);
}

export function closeIncident(j: Job, opts: { waitPaid: boolean; feeWaived: boolean; cause?: IncidentCause; note?: string; reviewBooked?: boolean; reviewAt?: number }, now: number): CloseResult {
  if (!j.incident?.outcome) return { ok: false, error: 'Record the decision first.' };
  if (!opts.waitPaid) return { ok: false, error: "Pay the driver's waiting time before closing: it is paid regardless." };
  if (!opts.cause) return { ok: false, error: 'Pick the cause: it is what prevention learns from.' };
  const cause = opts.cause;
  const note = cleanNote(opts.note ?? '');
  if (cause === 'other' && !note) return { ok: false, error: 'Say what happened: "other" needs a few words.' };
  if (j.pilot && !j.incident.accountOwnerAt) return { ok: false, error: 'Log the update to the pilot account owner before closing.' };
  if (j.pilot && (!opts.reviewBooked || !opts.reviewAt || opts.reviewAt <= now)) return { ok: false, error: 'Schedule the 15-minute booker review at a future time before closing.' };
  const pay = cancelPayFor(j);
  const job = withIncident(
    j,
    now,
    (i) => ({
      ...i,
      waitPaid: true,
      feeWaived: opts.feeWaived,
      cause,
      ...(note ? { causeNote: note } : {}),
      ...(pay ? { cancelPay: pay } : {}),
      reviewBooked: !!opts.reviewBooked, ...(opts.reviewBooked && opts.reviewAt ? { reviewAt: opts.reviewAt } : {}), reviewOwner: REVIEWER,
      waitingEndedAt: i.waitingEndedAt ?? i.outcome!.at,
      closedAt: now,
      steps: { ...i.steps, close: now },
    }),
    `Closed: waiting time paid${pay ? ` plus ${pay} SEK for the drive that didn't happen` : ''}${opts.feeWaived ? ', fee waived (pilot)' : ''}, cause: ${CAUSE_LABEL[cause].toLowerCase()}${note ? ` ("${note}")` : ''}${opts.reviewBooked ? ', review with the booker booked' : ''} (${REVIEWER})`,
  );
  return { ok: true, job };
}

/** Ops reached the pickup contact by phone after a missing reply. */
export function confirmByPhone(j: Job, now: number, key: Check['key'] = now >= j.pickupAt - CHECK_60_MS ? '60min' : '24h'): Job {
  const sentAt = j.pickupAt - (key === '24h' ? CHECK_24_MS : CHECK_60_MS);
  if (now < sentAt) return j;
  return { ...j, checkedByOpsAt: now, phoneChecks: { ...j.phoneChecks, [key]: now } };
}

/** What ops tells the driver in the chat once the next step is decided. */
export function driverUpdate(j: Job, outcome: Outcome, now: number): string {
  const waitFrom = hm(Math.max(j.pickupAt, j.arrivedAt ?? j.pickupAt));
  if (outcome === 'keys_found') {
    const c = incidentClock(j, now);
    if (now > c.lastDeparture) return 'The keys are available, but the departure cut-off has passed. Wait for ops to confirm a revised delivery plan before leaving.';
    return `Keys found, thanks for waiting! You can head off: leave by ${hm(c.lastDeparture)} to make ${hm(j.deadline)}. Your waiting time from ${waitFrom} is paid.`;
  }
  if (outcome === 'ops_stopped') return `We could not reach the customer and an authorised Ops lead stopped this pickup. You can leave. Waiting-time compensation and the proposed cancellation payment are logged by Ops; the customer transport remains a follow-up task.`;
  const what = outcome === 'later_today' ? 'to move the pickup to later today, and we\'ll come back to you about it' : outcome === 'new_date' ? 'a new date for this drive' : 'to cancel this drive';
  const extra = `, plus ${Math.round(j.reward * CANCEL_SHARE)} SEK, half the job's pay, since the drive didn't happen`;
  return `The customer chose ${what}. You don't need to wait any longer and can leave the pickup. Your waiting time from ${waitFrom} is paid${extra}. Thanks for staying!`;
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
  const reason = j.incident?.ownError?.found ? 'We found a booking detail that needed correcting.' : j.problemReason ? `Our driver reports: ${REASON_LABEL[j.problemReason].toLowerCase()}.` : 'We are checking the situation at pickup.';
  const delivery = now <= c.lastDeparture ? `If the car can leave by ${hm(c.lastDeparture)}, the current delivery plan is ${hm(j.deadline)}.` : `The original departure cut-off has passed. We need your agreement to a revised delivery time or another option.`;
  return `Hi, an update on pickup ${j.id} at ${j.from}. ${reason} ${delivery} We will update you again by ${hm(now + 20 * MIN)}.`;
}

export function pickupReadinessErrors(j: Job): string[] {
  const errors: string[] = [];
  if (j.unassigned) errors.push('assigned and confirmed driver');
  if (!j.contact?.role?.trim() || !/^\+?[0-9][0-9 -]{5,18}$/.test(j.contact?.phone ?? '')) errors.push('named pickup contact and phone');
  if (!j.backup?.role?.trim() || !/^\+?[0-9][0-9 -]{5,18}$/.test(j.backup?.phone ?? '')) errors.push('backup contact and phone');
  if (!j.keyLocation?.trim()) errors.push('confirmed key location');
  if (j.firstDrive && j.dispatchReady === false) errors.push('completed driver pre-drive checks');
  if (!Number.isFinite(j.pickupAt) || !Number.isFinite(j.deadline) || j.deadline <= j.pickupAt) errors.push('valid pickup and delivery times');
  return errors;
}

export function recordOwnError(j: Job, found: boolean, note: string, now: number): Job {
  const text = cleanNote(note);
  if (found && !text) return j;
  return withIncident(j, now, i => ({ ...i, ownError: { at: now, found, ...(text ? { note: text } : {}) }, steps: { ...i.steps, own_error: now } }), found ? `Booking error found and corrected: ${text} (${REVIEWER})` : `Booking details checked and correct (${REVIEWER})`);
}

export function agreeDeliveryDeadline(j: Job, deadline: number, now: number): Job {
  if (!Number.isFinite(deadline) || deadline < now + j.driveMin * MIN + HANDOVER_MS + MARGIN_MS) return j;
  return { ...j, originalDeadline: j.originalDeadline ?? j.deadline, deadline, deliveryAgreement: { deadline, at: now, by: REVIEWER } };
}

export function bookReplacement(j: Job, pickupAt: number, now: number, agreement?: { deadline: number; driverConfirmed: boolean }): Job {
  const task = j.incident?.rebooking;
  if (!task || task.status !== 'open' || !Number.isFinite(pickupAt) || pickupAt <= now) return j;
  if (!agreement || !Number.isFinite(agreement.deadline) || agreement.deadline < pickupAt + j.driveMin * MIN + HANDOVER_MS + MARGIN_MS) return j;
  const sameDay = new Date(pickupAt).toDateString() === new Date(now).toDateString();
  if ((j.incident?.outcome?.type === 'later_today' && !sameDay) || (j.incident?.outcome?.type === 'new_date' && sameDay)) return j;
  return withIncident(j, now, i => ({ ...i, rebooking: { ...task, status: 'booked', pickupAt, deadline: agreement.deadline, driverConfirmed: agreement.driverConfirmed, bookedAt: now, replacementId: `${j.id}-R` } }), `Replacement confirmed: pickup ${hm(pickupAt)}, delivery ${hm(agreement.deadline)}, ${agreement.driverConfirmed ? 'same driver confirmed' : 'needs another driver'}; owner ${task.owner}`);
}

export function replacementJob(j: Job): Job | null {
  const task = j.incident?.rebooking;
  if (task?.status !== 'booked' || !task.pickupAt || !task.replacementId || !task.deadline) return null;
  return { id: task.replacementId, driverId: task.driverConfirmed ? j.driverId : '', driverName: task.driverConfirmed ? j.driverName : 'Unassigned transport', unassigned: !task.driverConfirmed, previousDriverId: task.driverConfirmed ? undefined : j.driverId, customer: j.customer, pilot: j.pilot, from: j.from, to: j.to, area: j.area, km: j.km, driveMin: j.driveMin, pickupAt: task.pickupAt, bookedAt: task.bookedAt, deadline: task.deadline, reward: j.reward, price: j.price, contact: j.contact, backup: j.backup, keyLocation: j.keyLocation, firstDrive: task.driverConfirmed ? j.firstDrive : false, dispatchReady: task.driverConfirmed ? j.dispatchReady : false };
}

// ---------- The driver's taps ----------

/** The demo plans the other drivers' taps ahead of time. Once someone taps for real, the plan for later steps is dropped. */
function takeOver(j: Job, now: number): Job {
  const next = { ...j };
  for (const k of ['arrivedAt', 'keysAt', 'departedAt', 'deliveredAt'] as const) if (next[k] !== undefined && next[k]! > now) delete next[k];
  return next;
}

export function checkIn(j: Job, now: number): Job {
  if (j.unassigned || pickupReadinessErrors(j).length || now < j.pickupAt - 2 * HOUR) return j;
  const base = takeOver(j, now);
  return base.arrivedAt !== undefined ? base : { ...base, arrivedAt: now };
}

/** The driver has the keys ("customer" when the contact came out with them). */
export function gotKeys(j: Job, now: number, how: 'keys' | 'customer' = 'keys'): Job {
  const what = how === 'customer' ? 'The customer came with the keys' : 'The driver found the keys';
  if (now > incidentClock(j, now).lastDeparture) return withIncident({ ...checkIn(j, now), keysAt: now }, now, i => i, `${what}; departure cut-off passed, ops must agree a new delivery plan.`);
  // Keys handed over at check-in do not constitute an incident or an assistant rescue.
  if (j.arrivedAt === now && j.problemAt === undefined) return { ...j, keysAt: now };
  // Solved while the assistant had it: closed by the rules, waiting time paid, nobody needs to act. Ops can still see it.
  if (assisting(j, now)) {
    const next = { ...checkIn(j, now), keysAt: now };
    const log = [...assistantLog(j, now), { at: now, text: `${what}. Solved by the assistant; waiting time paid by the rule.` }];
    return { ...next, incident: { steps: {}, log, outcome: { type: 'keys_found', at: now }, waitPaid: true, closedAt: now, by: 'assistant', cause: causeFromReason(j.problemReason) } };
  }
  // Ops was already alerted: the incident stays open with the outcome filled in, so ops closes it and the waiting time gets paid.
  // An immediate key handover at check-in is not a missing-key incident.
  const alerted = !!jobAlert(j, now) && !(j.arrivedAt === now && j.problemAt === undefined);
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
    push(start, j.problemAt === start ? 'You reported a problem' : `No keys after ${NO_KEYS_ASSIST_MS / MIN} minutes`);
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
  if (pickupReadinessErrors(j).length || !done(j.keysAt, now) || now > incidentClock(j, now).lastDeparture || (j.incident?.outcome && j.incident.outcome.type !== 'keys_found')) return j;
  return { ...takeOver(j, now), departedAt: now };
}

export function deliver(j: Job, now: number): Job {
  if (!done(j.departedAt, now) || now < j.departedAt! + j.driveMin * MIN) return j;
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
    [...jobs].sort((a, b) => Number(!!b.solutionExample) - Number(!!a.solutionExample)).find(
      (j) =>
        !j.unassigned && j.driverId === driverId &&
        !(j.asInCase && jobs.some(x => x.solutionExample && x.driverId === driverId)) &&
        !done(j.deliveredAt, now) &&
        !(j.incident?.closedAt !== undefined && j.incident.outcome?.type !== 'keys_found') &&
        now >= j.pickupAt - 2 * HOUR,
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
      ? '; Ops call due now (10 min from report)'
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
  asInCase?: boolean;
  solutionExample?: boolean;
  newSite?: boolean;
};

/**
 * Today in the demo. Julia's drive is the Part 1 case: a pilot customer, 35 km, 3 hours to the
 * deadline, 500 SEK to the driver and 780 SEK from the customer. Nobody answered the pre-pickup
 * messages, and she has been at the gate without keys for a little over 10 minutes. She told the
 * assistant 9 minutes ago; it texted the contacts, got no reply, and handed her to a person 4 minutes ago.
 */
const JOBS: JobSeed[] = [
  { name: 'Filip Nyström', pickupInMin: -150, hours: 3, from: 'Workshop, Nacka', to: 'Dealership, Södermalm', area: 'Nacka', km: 9, driveMin: 25, reward: 320, price: 520, customer: 'Nacka Bil & Service', confirm24: -23 * 60, confirm60: -50, arrive: -5, keys: 3, depart: 10, deliver: 40 },
  { name: 'Julia Lindgren', pickupInMin: -12, hours: 3, from: 'Dealership, Solna', to: 'Customer, Upplands Väsby', area: 'Solna', km: 35, driveMin: 50, reward: 500, price: 780, customer: 'Solna Bilcenter', pilot: true, arrive: -2, problem: 1 },
  { name: 'Isak Bergström', pickupInMin: 45, hours: 2, from: 'Leasing depot, Bromma', to: 'Customer, Kungsholmen', area: 'Bromma', km: 11, driveMin: 30, reward: 340, price: 560, customer: 'Bromma Leasing', confirm24: -22 * 60, confirm60: -55, arrive: -6, keys: 2, depart: 8, deliver: 45 },
  { name: 'Agnes Ekström', pickupInMin: 180, hours: 3, from: 'Rental hub, Södermalm', to: 'Workshop, Huddinge', area: 'Södermalm', km: 16, driveMin: 30, reward: 350, price: 580, customer: 'City Rental Stockholm', confirm24: -21 * 60, confirm60: -50, arrive: -4, keys: 3, depart: 9, deliver: 45 },
  // Our first drive from this address tomorrow: the same confirmation checks apply.
  { name: 'Linnea Björk', pickupInMin: 20 * 60, hours: 3, from: 'Leasing depot, Täby', to: 'Customer, Danderyd', area: 'Täby', km: 12, driveMin: 25, reward: 330, price: 540, customer: 'Täby Leasing', confirm24: -23 * 60, confirm60: -50, newSite: true, arrive: -4, keys: 3, depart: 9, deliver: 40 },
  { name: 'Omar Khalil', pickupInMin: 330, hours: 3, from: 'Dealership, Sundbyberg', to: 'Customer, Täby', area: 'Sundbyberg', km: 18, driveMin: 35, reward: 360, price: 600, customer: 'Sundbyberg Motor', confirm60: -45, arrive: -3, keys: 4, depart: 10, deliver: 50 },
];

/**
 * The Part 1 case exactly as the brief gives it, for "Play the case" (Tuesday 09:30): pickup agreed
 * for 09:00, the driver at the gate since 09:05, so 25 minutes of waiting, no pre-pickup check, the
 * contact not answering, and no assistant: today's process. At 09:30 she calls ops, and the playbook
 * starts. The rest of the demo shows how the check and the assistant would have caught it earlier.
 */
const CASE_JULIA: JobSeed = { ...JOBS[1], pickupInMin: -30, arrive: 5, problem: 30, asInCase: true };

/** Demo jobs for active drivers in the seed (matched by name). With asInCase, Julia's drive is the Part 1 case at 09:30. */
export function seedJobs(apps: Applicant[], now: number, opts: { asInCase?: boolean } = {}): Job[] {
  const out: Job[] = [];
  const seeds = opts.asInCase ? JOBS.map((s) => (s.name === CASE_JULIA.name ? CASE_JULIA : s)) : JOBS;
  seeds.forEach((s, i) => {
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
      ...(s.asInCase ? { asInCase: true } : {}),
      ...(s.newSite ? { newSite: true } : {}),
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
    // Julia picked "keys missing" with one tap: the fixed texts went out from the booking's template.
    // In the case she phoned ops instead: no texts, and a person has it from her call.
    if (s.problem !== undefined) {
      job.problemReason = 'keys_missing';
      if (s.asInCase) job.escalation = { at: job.problemAt!, why: 'phoned' };
      else {
        const r = prepareTexts(job, 'keys_missing', job.problemAt!, true);
        if (r.ok) job.texts = r.texts;
      }
    }
    out.push(job);
  });
  return out;
}

/** Proposed solution replay: start before the wait, with no fabricated contact or Ops actions. */
export function solutionExample(j: Job): Job {
  const { asInCase: _case, incident: _incident, problemAt: _problem, problemReason: _reason, escalation: _escalation, texts: _texts, arrivedAt: _arrived, keysAt: _keys, departedAt: _departed, deliveredAt: _delivered, contactReply: _reply, ...base } = j;
  return { ...base, id: 'JOB-SOLUTION', solutionExample: true };
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
  if (!at || a.firstGig?.doneAt || a.decision?.type === 'rejected' || !gig || gig.id !== a.firstGig?.gigId || gig.at !== at) return null;
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
    bookedAt: a.firstGig?.bookedAt,
    deadline: at + 3 * HOUR,
    reward: gig?.pay ?? 330,
    price: Math.round(((gig?.pay ?? 330) * 1.6) / 10) * 10,
    contact: CONTACT,
    backup: BACKUP,
    keyLocation: 'Reception, ask for the car by its job number',
    // No fabricated contact replies: confirmations must be recorded in Live Ops.
    firstDrive: true,
    dispatchReady: canStartDrive(a) === null,
  };
}

/** Keep the jobs in step with an applicant's first drive: add it when booked, move it when rebooked, drop it when released (until it starts). */
export function syncFirstDrive(jobs: Job[], a: Applicant, gigs: Gig[]): Job[] {
  const existing = jobs.find(j => j.driverId === a.id && j.firstDrive && j.id === a.firstGig?.gigId)
    ?? jobs.find(j => j.driverId === a.id && j.firstDrive && !j.deliveredAt && !j.incident?.closedAt);
  // A confirmed replacement is a real transport even though it is not in the seed offer pool.
  if (existing && existing.id === a.firstGig?.gigId && !gigs.some(g => g.id === existing.id) && a.decision?.type !== 'rejected') return jobs.map(j => j === existing ? { ...j, dispatchReady: canStartDrive(a) === null } : j);
  const job = firstDriveJob(a, gigs.find(g => g.id === a.firstGig?.gigId));
  if (!job) {
    if (!existing || existing.arrivedAt !== undefined || a.firstGig?.doneAt) return jobs;
    // The customer job remains visible and owned until another eligible driver books it.
    return jobs.map(j => j !== existing ? j : { ...j, previousDriverId: a.id, driverId: '', driverName: 'Unassigned transport', unassigned: true, firstDrive: false, dispatchReady: false });
  }
  if (existing?.arrivedAt !== undefined) return jobs;
  const open = jobs.find(j => j.id === job.id && j.unassigned);
  if (open) return jobs.map(j => j === open ? { ...job, deadline: open.deadline, originalDeadline: open.originalDeadline } : j);
  if (!existing) return [...jobs, job];
  if (existing.pickupAt === job.pickupAt && existing.id === job.id) return existing.dispatchReady === job.dispatchReady ? jobs : jobs.map(j => j === existing ? { ...j, dispatchReady: job.dispatchReady } : j);
  return jobs.map(j => j === existing ? job : j);
}

/** How the first drive went, for first-gig quality: on time, and no incident. An incident brings its cause and what happened. */
export function firstDriveResult(j: Job): { onTime: boolean; ok: boolean; customerSatisfied?: boolean; issue?: { cause: FirstGigIssue; note: string } } {
  const onTime = (j.deliveredAt ?? Infinity) <= (j.originalDeadline ?? j.deadline);
  const i = j.incident;
  if (!i && j.problemAt === undefined) return { onTime, ok: true, customerSatisfied: j.customerSatisfied };
  if (!i) return { onTime, ok: false, customerSatisfied: j.customerSatisfied, issue: { cause: causeFromReason(j.problemReason), note: cleanNote(j.problemReason ? REASON_LABEL[j.problemReason] : 'Problem reported at pickup') } };
  const cause: FirstGigIssue = i.cause ?? causeFromReason(j.problemReason);
  const what = i.by === 'assistant' ? `solved by the assistant` : i.outcome ? OUTCOME_LABEL[i.outcome.type].toLowerCase() : 'incident at the pickup';
  const note = cleanNote([j.problemReason ? REASON_LABEL[j.problemReason] : 'Problem at the pickup', what, i.causeNote].filter(Boolean).join('; '));
  return { onTime, ok: false, customerSatisfied: j.customerSatisfied, issue: { cause, note } };
}

/** Move every timestamp of a job by `delta` ms (an old save, rebased to now). */
export function shiftJob(j: Job, delta: number): Job {
  const s = (t: number | undefined) => (t === undefined ? undefined : t + delta);
  const keys = ['confirmed24At', 'confirmed60At', 'checkedByOpsAt', 'siteCalledAt', 'arrivedAt', 'keysAt', 'departedAt', 'deliveredAt', 'problemAt'] as const;
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
      ...(i.accountOwnerAt !== undefined ? { accountOwnerAt: i.accountOwnerAt + delta } : {}),
      log: i.log.map((e) => ({ ...e, at: e.at + delta })),
    };
  }
  return moved;
}

export function isJob(j: unknown): j is Job {
  const x = j as Job;
  return !!x && typeof x.id === 'string' && typeof x.driverId === 'string' && typeof x.pickupAt === 'number' && typeof x.deadline === 'number';
}
