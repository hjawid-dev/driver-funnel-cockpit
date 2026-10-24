import type { Applicant, Gig } from './types';
import { REVIEWER } from './types';
import { HOUR, MIN } from './time';

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
  /** The driver tapped "Problem at pickup". */
  problemAt?: number;
  /** A new driver's first drive: ops is on standby, and delivering it makes the driver active. */
  firstDrive?: boolean;
  incident?: Incident;
}

export type StepKey = 'keep_driver' | 'own_error' | 'escalate' | 'customer' | 'decide' | 'close';
export type Outcome = 'keys_found' | 'later_today' | 'new_date' | 'cancelled';

export interface Incident {
  steps: Partial<Record<StepKey, number>>;
  outcome?: { type: Outcome; at: number };
  waitPaid?: boolean;
  feeWaived?: boolean;
  closedAt?: number;
  log: { at: number; text: string }[];
}

// ---------- The rulebook ----------

/** No contact or keys this long after the driver checks in → an urgent alert, without anyone having to call. */
export const NO_KEYS_ALERT_MS = 10 * MIN;
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

export type DriverStatus = 'scheduled' | 'on_the_way' | 'arrived' | 'keys' | 'driving' | 'delivered';

export const DRIVER_STATUS_LABEL: Record<DriverStatus, string> = {
  scheduled: 'Scheduled',
  on_the_way: 'On the way',
  arrived: 'At the pickup',
  keys: 'Has the keys',
  driving: 'Driving',
  delivered: 'Delivered',
};

export function driverStatus(j: Job, now: number): DriverStatus {
  if (done(j.deliveredAt, now)) return 'delivered';
  if (done(j.departedAt, now)) return 'driving';
  if (done(j.keysAt, now)) return 'keys';
  if (done(j.arrivedAt, now)) return 'arrived';
  return now >= j.pickupAt - HOUR ? 'on_the_way' : 'scheduled';
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

export interface Alert {
  at: number;
  kind: 'no_keys' | 'not_arrived' | 'driver_reported';
  text: string;
}

/** Why this job needs a person now, if it does. The earliest trigger counts. */
export function jobAlert(j: Job, now: number): Alert | null {
  if (j.incident?.closedAt !== undefined && j.incident.closedAt <= now) return null;
  if (done(j.keysAt, now) && !j.incident) return null;
  const alerts: Alert[] = [];
  if (done(j.problemAt, now)) alerts.push({ at: j.problemAt!, kind: 'driver_reported', text: `${first(j)} reported a problem at the pickup` });
  if (done(j.arrivedAt, now) && !done(j.keysAt, now)) {
    const at = j.arrivedAt! + NO_KEYS_ALERT_MS;
    if (at <= now) alerts.push({ at, kind: 'no_keys', text: `No keys ${NO_KEYS_ALERT_MS / MIN} min after ${first(j)} checked in` });
  }
  if (!done(j.arrivedAt, now)) {
    const at = j.pickupAt + NOT_ARRIVED_ALERT_MS;
    if (at <= now) alerts.push({ at, kind: 'not_arrived', text: `${first(j)} hasn't checked in ${NOT_ARRIVED_ALERT_MS / MIN} min after pickup time` });
  }
  if (!alerts.length) return j.incident ? { at: firstLogAt(j), kind: 'driver_reported', text: 'Incident open' } : null;
  return alerts.sort((a, b) => a.at - b.at)[0];
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
  { key: 'escalate', title: 'Escalate in parallel', what: 'The driver asks anyone on site (reception, workshop, key box). Ops calls the contact and the backup.' },
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
export function closeIncident(j: Job, opts: { waitPaid: boolean; feeWaived: boolean }, now: number): CloseResult {
  if (!j.incident?.outcome) return { ok: false, error: 'Record the decision first.' };
  if (!opts.waitPaid) return { ok: false, error: "Pay the driver's waiting time before closing: it is paid regardless." };
  const job = withIncident(
    j,
    now,
    (i) => ({ ...i, waitPaid: true, feeWaived: opts.feeWaived, closedAt: now, steps: { ...i.steps, close: now } }),
    `Closed: waiting time paid${opts.feeWaived ? ', fee waived (pilot)' : ''} (${REVIEWER})`,
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

export function gotKeys(j: Job, now: number): Job {
  // Ops was already alerted: the incident stays open with the outcome filled in, so ops closes it and the waiting time gets paid.
  const alerted = !!jobAlert(j, now);
  const next = { ...checkIn(j, now), keysAt: now };
  if (next.incident?.outcome || (!next.incident && !alerted)) return next;
  return withIncident(next, now, (i) => ({ ...i, outcome: { type: 'keys_found', at: now }, steps: { ...i.steps, decide: now } }), 'The driver found the keys');
}

export function depart(j: Job, now: number): Job {
  return { ...takeOver(j, now), departedAt: now };
}

export function deliver(j: Job, now: number): Job {
  return { ...takeOver(j, now), deliveredAt: now };
}

export function reportProblem(j: Job, now: number): Job {
  return { ...checkIn(j, now), problemAt: j.problemAt ?? now };
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
  const where = s === 'arrived' ? 'at the pickup, keys not found yet' : DRIVER_STATUS_LABEL[s].toLowerCase();
  return `On a job now: pickup in ${j.area} at ${hm(j.pickupAt)}, status: ${where}`;
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
  /** Minutes relative to pickup; undefined = not (yet) */
  confirm24?: number;
  confirm60?: number;
  arrive?: number;
  keys?: number;
  depart?: number;
  deliver?: number;
};

/**
 * Today in the demo. Julia's drive is the Part 1 case: a pilot customer, 35 km, 3 hours to the
 * deadline, 500 SEK to the driver and 780 SEK from the customer. Nobody answered the pre-pickup
 * messages, and she has been at the gate without keys for a little over 10 minutes.
 */
const JOBS: JobSeed[] = [
  { name: 'Filip Nyström', pickupInMin: -150, hours: 3, from: 'Workshop, Nacka', to: 'Dealership, Södermalm', area: 'Nacka', km: 9, driveMin: 25, reward: 320, price: 520, customer: 'Nacka Bil & Service', confirm24: -23 * 60, confirm60: -50, arrive: -5, keys: 3, depart: 10, deliver: 40 },
  { name: 'Julia Lindgren', pickupInMin: -12, hours: 3, from: 'Dealership, Solna', to: 'Customer, Upplands Väsby', area: 'Solna', km: 35, driveMin: 50, reward: 500, price: 780, customer: 'Solna Bilcenter', pilot: true, arrive: -2 },
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
    const set = (k: 'confirmed24At' | 'confirmed60At' | 'arrivedAt' | 'keysAt' | 'departedAt' | 'deliveredAt', m: number | undefined) => {
      const t = rel(m);
      if (t !== undefined) job[k] = t;
    };
    set('confirmed24At', s.confirm24);
    set('confirmed60At', s.confirm60);
    set('arrivedAt', s.arrive);
    set('keysAt', s.keys);
    set('departedAt', s.depart);
    set('deliveredAt', s.deliver);
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

/** How the first drive went, for first-gig quality: on time, and no incident. */
export function firstDriveResult(j: Job): { onTime: boolean; ok: boolean } {
  return { onTime: (j.deliveredAt ?? Infinity) <= j.deadline, ok: !j.incident };
}

/** Move every timestamp of a job by `delta` ms (an old save, rebased to now). */
export function shiftJob(j: Job, delta: number): Job {
  const s = (t: number | undefined) => (t === undefined ? undefined : t + delta);
  const keys = ['confirmed24At', 'confirmed60At', 'checkedByOpsAt', 'arrivedAt', 'keysAt', 'departedAt', 'deliveredAt', 'problemAt'] as const;
  const moved: Job = { ...j, pickupAt: j.pickupAt + delta, deadline: j.deadline + delta };
  for (const k of keys) if (j[k] !== undefined) moved[k] = s(j[k]);
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
