import { describe, expect, it } from 'vitest';
import {
  checkIn,
  closedIncidents,
  closeIncident,
  confirmByPhone,
  currentJob,
  customerUpdate,
  driverStatus,
  driverUpdate,
  firstDriveJob,
  firstDriveResult,
  syncFirstDrive,
  gotKeys,
  incidentClock,
  jobAlert,
  jobFact,
  markStep,
  needsConfirmation,
  openIncidents,
  pickupChecks,
  reportProblem,
  seedJobs,
  setOutcome,
  shiftJob,
  type Job,
} from '../liveOps';
import { liveOpsEvents } from '../automation';
import { emptyThread, keysFoundByDriver, reportUrgent } from '../chat/threads';
import { generateSeed } from '../seed';
import { DAY, HOUR, MIN } from '../time';
import type { Applicant } from '../types';
import { NOW, mk } from './helpers';

const job = (over: Partial<Job> = {}): Job => ({
  id: 'JOB-1',
  driverId: 'DRV-1',
  driverName: 'Julia Lindgren',
  customer: 'Pilot AB',
  pilot: true,
  from: 'Dealership, Solna',
  to: 'Customer, Upplands Väsby',
  area: 'Solna',
  km: 35,
  driveMin: 50,
  pickupAt: NOW,
  deadline: NOW + 3 * HOUR,
  reward: 500,
  price: 780,
  contact: { role: 'Service desk', phone: '1' },
  backup: { role: 'Site manager', phone: '2' },
  keyLocation: 'Key box',
  ...over,
});

describe('the incident clock (the case: pickup 09:00, deadline 12:00, 35 km)', () => {
  it('last departure ~10:50 and decision point ~10:15, margin 280 SEK', () => {
    const c = incidentClock(job(), NOW + 30 * MIN);
    expect((c.lastDeparture - NOW) / MIN).toBe(110); // 12:00 − 50 min drive − 15 min handover − 5 min margin
    expect((c.decideBy - NOW) / MIN).toBe(75); // 35 min before the last departure
    expect(c.margin).toBe(280);
    expect(c.waitedMs).toBe(30 * MIN);
  });
});

describe('pre-pickup check', () => {
  it('scheduled, waiting, then no reply after the wait', () => {
    const j = job({ pickupAt: NOW + 30 * HOUR, deadline: NOW + 33 * HOUR });
    expect(pickupChecks(j, NOW).map((c) => c.state)).toEqual(['scheduled', 'scheduled']);
    expect(pickupChecks(j, NOW + 6.5 * HOUR)[0].state).toBe('waiting');
    expect(pickupChecks(j, NOW + 8.5 * HOUR)[0].state).toBe('no_reply');
    expect(needsConfirmation(j, NOW + 8.5 * HOUR)).toBe(true);
  });
  it('a reply or a phone call settles it', () => {
    const j = job({ pickupAt: NOW + 3 * HOUR, deadline: NOW + 6 * HOUR });
    expect(pickupChecks({ ...j, confirmed24At: NOW - 20 * HOUR }, NOW)[0].state).toBe('confirmed');
    expect(needsConfirmation(confirmByPhone(j, NOW), NOW)).toBe(false);
  });
});

describe('alerts: the app notices before anyone has to call', () => {
  it('no keys 10 minutes after checking in', () => {
    const j = checkIn(job(), NOW);
    expect(jobAlert(j, NOW + 9 * MIN)).toBeNull();
    expect(jobAlert(j, NOW + 10 * MIN)).toMatchObject({ kind: 'no_keys', at: NOW + 10 * MIN });
  });
  it('not checked in 10 minutes after pickup time', () => {
    expect(jobAlert(job(), NOW + 11 * MIN)?.kind).toBe('not_arrived');
  });
  it("a driver's own tap replaces the demo's planned steps", () => {
    const planned = job({ arrivedAt: NOW + 5 * MIN, keysAt: NOW + 8 * MIN, departedAt: NOW + 15 * MIN });
    const j = reportProblem(planned, NOW);
    expect(j.arrivedAt).toBe(NOW);
    expect(j.keysAt).toBeUndefined();
    expect(j.departedAt).toBeUndefined();
    expect(jobAlert(j, NOW + 30 * MIN)?.kind).toBe('driver_reported');
  });
  it('the driver reporting a problem is an alert at once', () => {
    expect(jobAlert(reportProblem(job(), NOW + MIN), NOW + MIN)?.kind).toBe('driver_reported');
  });
  it('keys found after the alert: the incident stays open for ops to close, with the outcome filled in', () => {
    const j = gotKeys(checkIn(job(), NOW), NOW + 15 * MIN);
    expect(j.incident?.outcome?.type).toBe('keys_found');
    expect(j.incident?.log.at(-1)?.text).toBe('The driver found the keys');
    expect(jobAlert(j, NOW + 16 * MIN)).not.toBeNull();
  });
  it('keys before the alert: nothing to do', () => {
    expect(jobAlert(gotKeys(checkIn(job(), NOW), NOW + 5 * MIN), NOW + 20 * MIN)).toBeNull();
  });
  it('an incident stays open until ops closes it, even after the keys turn up', () => {
    let j = checkIn(job(), NOW);
    j = markStep(j, 'keep_driver', NOW + 11 * MIN);
    j = gotKeys(j, NOW + 20 * MIN);
    expect(j.incident?.outcome?.type).toBe('keys_found');
    expect(jobAlert(j, NOW + 21 * MIN)).not.toBeNull();
    const r = closeIncident(j, { waitPaid: true, feeWaived: true }, NOW + 30 * MIN);
    if (!r.ok) throw new Error(r.error);
    expect(jobAlert(r.job, NOW + 31 * MIN)).toBeNull();
  });
});

describe('the playbook', () => {
  it('logs each step with the time and who did it', () => {
    const j = markStep(checkIn(job(), NOW), 'escalate', NOW + 12 * MIN);
    expect(j.incident?.steps.escalate).toBe(NOW + 12 * MIN);
    expect(j.incident?.log.at(-1)?.text).toContain('Escalate in parallel: done');
  });
  it("can't close without a decision, or without paying the driver's waiting time", () => {
    const j = checkIn(job(), NOW);
    expect(closeIncident(j, { waitPaid: true, feeWaived: false }, NOW)).toEqual({ ok: false, error: 'Record the decision first.' });
    const decided = setOutcome(j, 'new_date', NOW + 40 * MIN);
    expect(closeIncident(decided, { waitPaid: false, feeWaived: true }, NOW).ok).toBe(false);
  });
  it('the customer update is filled from the job and names the last departure', () => {
    const text = customerUpdate(checkIn(job(), NOW), NOW + 15 * MIN);
    expect(text).toContain('JOB-1');
    expect(text).toContain('delivery by');
    expect(text).not.toMatch(/780|500|SEK/); // no prices in a customer message
  });
});

describe('the driver hears the decision in the chat', () => {
  it('keys found: when to leave; otherwise: you can go, and the waiting time is paid', () => {
    const j = checkIn(job(), NOW);
    expect(driverUpdate(j, 'keys_found', NOW + 20 * MIN)).toMatch(/leave by \d\d:\d\d/);
    expect(driverUpdate(j, 'new_date', NOW + 40 * MIN)).toMatch(/don't need to wait.*waiting time .* is paid/);
  });
  it('lists closed incidents from the last 12 hours', () => {
    const decided = setOutcome(checkIn(job(), NOW), 'cancelled', NOW + 30 * MIN);
    const r = closeIncident(decided, { waitPaid: true, feeWaived: true }, NOW + 35 * MIN);
    if (!r.ok) throw new Error(r.error);
    expect(closedIncidents([r.job], NOW + HOUR).map((j) => j.id)).toEqual(['JOB-1']);
    expect(closedIncidents([r.job], NOW + 13 * HOUR)).toEqual([]);
  });
});

describe("a new driver's first drive", () => {
  const accepted = (over: Partial<Applicant> = {}): Applicant => ({
    ...mk({ id: 'DRV-2001', name: 'Nova Lind', area: 'Solna' }),
    decision: { type: 'accepted', at: NOW - HOUR, by: 'x' },
    ...over,
  });
  const gig = { id: 'JOB-301', from: 'Dealership, Solna', to: 'Workshop, Sundbyberg', area: 'Solna', km: 8, minutes: 25, pay: 320, at: NOW + DAY, car: 'standard' as const };

  it('booking it adds a job with ops on standby; the pickup contact has confirmed', () => {
    const a = accepted({ firstGig: { gigId: gig.id, bookedFor: gig.at } });
    const jobs = syncFirstDrive([], a, [gig]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: 'JOB-301', firstDrive: true, pickupAt: gig.at, reward: 320 });
    expect(pickupChecks(jobs[0], gig.at - 30 * MIN).map((c) => c.state)).toEqual(['confirmed', 'confirmed']);
  });
  it('rebooking moves the job until the drive has started; nothing booked, nothing added', () => {
    const a = accepted({ firstGig: { gigId: gig.id, bookedFor: gig.at } });
    const jobs = syncFirstDrive([], a, [gig]);
    const later = { ...gig, id: 'JOB-302', at: gig.at + DAY };
    expect(syncFirstDrive(jobs, accepted({ firstGig: { gigId: later.id, bookedFor: later.at } }), [gig, later])[0].id).toBe('JOB-302');
    expect(syncFirstDrive(jobs, accepted({ firstGig: { gigId: later.id, bookedFor: later.at } }), [later]).length).toBe(1);
    expect(syncFirstDrive([], accepted(), [gig])).toEqual([]);
  });
  it('a booking by ops without a picked job gets a curated drive in the driver area', () => {
    expect(firstDriveJob(accepted({ firstGig: { bookedFor: NOW + DAY } }), undefined)).toMatchObject({ area: 'Solna', firstDrive: true });
  });
  it('delivered on time without an incident counts as a good first drive', () => {
    const j = firstDriveJob(accepted({ firstGig: { gigId: gig.id, bookedFor: gig.at } }), gig)!;
    expect(firstDriveResult({ ...j, deliveredAt: gig.at + HOUR })).toEqual({ onTime: true, ok: true });
    expect(firstDriveResult({ ...j, deliveredAt: j.deadline + MIN })).toEqual({ onTime: false, ok: true });
  });
});

describe('the driver finds the keys while waiting for ops', () => {
  it('the urgent chat leaves the queue; other threads are untouched', () => {
    const waiting = reportUrgent(emptyThread(null), 'No keys', NOW);
    const t = keysFoundByDriver(waiting, NOW + 5 * MIN);
    expect(t.status).toBe('ai');
    expect(t.waitingSince).toBeUndefined();
    expect(t.messages.at(-2)?.text).toBe('I found the keys.');
    const plain = emptyThread(null);
    expect(keysFoundByDriver(plain, NOW)).toBe(plain);
  });
});

describe('what the assistant may know about the drive', () => {
  it('area, time and status only: no customer, address or price', () => {
    const fact = jobFact(checkIn(job(), NOW), NOW + 5 * MIN);
    expect(fact).toContain('pickup in Solna');
    expect(fact).toContain('keys not found yet');
    expect(fact).not.toMatch(/Pilot AB|Dealership|780|500/);
  });
});

describe('the demo day', () => {
  const apps = generateSeed(NOW);
  const jobs = seedJobs(apps, NOW);
  const julia = jobs.find((j) => j.driverName === 'Julia Lindgren')!;

  it('Julia is the case: pilot customer, 35 km, 500/780 SEK, no keys after 10 min, nobody confirmed', () => {
    expect(julia).toMatchObject({ pilot: true, km: 35, reward: 500, price: 780 });
    expect(jobAlert(julia, NOW)?.kind).toBe('no_keys');
    expect(pickupChecks(julia, NOW).map((c) => c.state)).toEqual(['no_reply', 'no_reply']);
    expect(openIncidents(jobs, NOW).map((j) => j.id)).toEqual([julia.id]);
    expect(currentJob(jobs, julia.driverId, NOW)?.id).toBe(julia.id);
  });
  it('one other pickup has no reply yet, so ops can call ahead', () => {
    expect(jobs.filter((j) => j !== julia && needsConfirmation(j, NOW)).map((j) => j.driverName)).toEqual(['Omar Khalil']);
  });
  it('moving time a day: the other drivers finish by themselves, only Julia needs a person', () => {
    const later = NOW + 24 * HOUR;
    expect(jobs.filter((j) => j !== julia).every((j) => driverStatus(j, later) === 'delivered')).toBe(true);
    const alerts = liveOpsEvents(jobs, NOW, later).filter((e) => e.kind === 'live_alert');
    expect(alerts).toEqual([]); // Julia's alert fired before NOW; nobody else gets stuck
  });
  it('the automation sends the pre-pickup messages and a task when nobody replies', () => {
    const events = liveOpsEvents(jobs, NOW - 30 * HOUR, NOW);
    expect(events.some((e) => e.kind === 'pickup_check' && e.title.includes(julia.id))).toBe(true);
    expect(events.filter((e) => e.kind === 'pickup_task' && e.title.includes(julia.id))).toHaveLength(2);
    expect(events.some((e) => e.kind === 'live_alert' && e.applicantId === julia.driverId)).toBe(true);
  });
  it('shifting a job moves every timestamp', () => {
    const j = shiftJob(markStep(julia, 'keep_driver', NOW), HOUR);
    expect(j.pickupAt).toBe(julia.pickupAt + HOUR);
    expect(j.arrivedAt).toBe(julia.arrivedAt! + HOUR);
    expect(j.incident?.log[0].at).toBe(NOW + HOUR);
  });
});
