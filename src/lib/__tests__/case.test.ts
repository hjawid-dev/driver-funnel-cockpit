import { describe, expect, it } from 'vitest';
import { caseTime, MIN } from '../time';
import { generateSeed } from '../seed';
import { callSite, cancelPayFor, closeIncident, driverUpdate, incidentClock, jobAlert, needsSiteCall, pickupChecks, seedJobs, setOutcome, siteCallDue, tellAccountOwner, type Outcome } from '../liveOps';
import { seedThreads } from '../chat/threads';
import { todayItems } from '../today';
import { liveOpsEvents } from '../automation';
import { NOW } from './helpers';

const hm = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

describe('Play the case: Part 1 as the brief gives it', () => {
  const at = caseTime(NOW);
  const apps = generateSeed(at);
  const jobs = seedJobs(apps, at, { asInCase: true });
  const julia = jobs.find((j) => j.driverName === 'Julia Lindgren')!;

  it('is the latest Tuesday 09:30 at or before now', () => {
    const d = new Date(at);
    expect([d.getDay(), d.getHours(), d.getMinutes()]).toEqual([2, 9, 30]);
    expect(at).toBeLessThanOrEqual(NOW);
    expect(NOW - at).toBeLessThan(7 * 24 * 60 * MIN);
    expect(caseTime(at)).toBe(at);
    expect(caseTime(at - MIN)).toBe(at - 7 * 24 * 60 * MIN);
  });

  it("shows slide 3's clock: pickup 09:00, 25 minutes waited, decide by 10:15, leave by about 10:50, deliver by 12:00", () => {
    expect(hm(julia.pickupAt)).toBe('09:00');
    expect((at - julia.arrivedAt!) / MIN).toBe(25);
    const c = incidentClock(julia, at);
    expect([hm(c.decideBy), hm(c.lastDeparture), hm(c.deadline)]).toEqual(['10:15', '10:50', '12:00']);
    expect(c.margin).toBe(280);
    expect([julia.km, julia.reward, julia.price, julia.pilot]).toEqual([35, 500, 780, true]);
  });

  it('today\'s process: no assistant and no text; she phones ops at 09:30 and Today has it as urgent', () => {
    expect(jobAlert(julia, at)).toMatchObject({ kind: 'escalated', why: 'phoned', at });
    expect(jobAlert(julia, at - MIN)).toBeNull();
    expect(julia.texts).toBeUndefined();
    const urgent = todayItems(apps, seedThreads(apps, at, null), at, jobs).find((i) => i.key === 'urgent')!;
    expect(urgent.ids).toContain(julia.id);
  });

  it('no pre-pickup check was in place, so nothing was asked of the contact and no task was made', () => {
    expect(julia.asInCase).toBe(true);
    expect(pickupChecks(julia, at)).toEqual([]);
    const events = liveOpsEvents([julia], julia.pickupAt - 2 * 24 * 60 * MIN, at);
    expect(events.filter((e) => e.kind === 'pickup_check' || e.kind === 'pickup_task')).toEqual([]);
  });

  it("Julia's chat has nothing about the pickup: she phoned instead", () => {
    const t = seedThreads(apps, at, null).find((x) => x.name === 'Julia Lindgren')!;
    expect(t.messages.some((m) => m.text.includes('keys aren'))).toBe(false);
    expect(t.messages.length).toBeGreaterThan(0);
  });

  it('the normal demo day is unchanged: Julia reported 9 minutes ago, with the pre-pickup check', () => {
    const day = seedJobs(generateSeed(NOW), NOW).find((j) => j.driverName === 'Julia Lindgren')!;
    expect(day.asInCase).toBeUndefined();
    expect((NOW - day.problemAt!) / MIN).toBe(9);
    expect(pickupChecks(day, NOW)).toHaveLength(2);
  });
});

describe('prevention that reaches the cause: the site, the account owner, the driver and the booker', () => {
  const apps = generateSeed(NOW);
  const jobs = seedJobs(apps, NOW);
  const linnea = jobs.find((j) => j.driverName === 'Linnea Björk')!;
  const julia = jobs.find((j) => j.driverName === 'Julia Lindgren')!;

  it('a new address gets a site call the day before, in Today, until someone calls', () => {
    expect(linnea.newSite).toBe(true);
    expect(siteCallDue(linnea, NOW)).toBe(true);
    expect(siteCallDue(linnea, linnea.pickupAt - 25 * 60 * MIN)).toBe(false); // not yet
    const item = todayItems(apps, [], NOW, jobs).find((i) => i.key === 'sitecall')!;
    expect(item.ids).toEqual([linnea.id]);
    const called = callSite(linnea, NOW);
    expect(siteCallDue(called, NOW)).toBe(false);
    expect(todayItems(apps, [], NOW, jobs.map((j) => (j === linnea ? called : j))).some((i) => i.key === 'sitecall')).toBe(false);
  });

  it('the case had no check, so it gets no site call either; a first drive has ops on standby instead', () => {
    const caseJulia = seedJobs(generateSeed(caseTime(NOW)), caseTime(NOW), { asInCase: true }).find((j) => j.driverName === 'Julia Lindgren')!;
    expect(needsSiteCall(caseJulia)).toBe(false);
    expect(needsSiteCall({ ...linnea, firstDrive: true })).toBe(false);
  });

  it('the driver gets the waiting time and half the reward when the drive does not happen', () => {
    const decided = (o: Outcome) => setOutcome(julia, o, NOW);
    expect(cancelPayFor(decided('cancelled'))).toBe(250);
    expect(cancelPayFor(decided('new_date'))).toBe(250);
    expect(cancelPayFor(decided('later_today'))).toBe(0);
    expect(cancelPayFor(decided('keys_found'))).toBe(0);
    expect(driverUpdate(julia, 'cancelled', NOW)).toMatch(/plus 250 SEK, half the job's pay/);
    const r = closeIncident(decided('cancelled'), { waitPaid: true, feeWaived: true, cause: 'customer_keys', reviewBooked: true }, NOW);
    expect(r.ok && r.job.incident).toMatchObject({ cancelPay: 250, reviewBooked: true });
    expect(r.ok && r.job.incident!.log.at(-1)!.text).toMatch(/plus 250 SEK.*review with the booker booked/);
  });

  it('a pilot customer: the account owner is told, and it is logged', () => {
    const j = tellAccountOwner(julia, NOW);
    expect(j.incident!.accountOwnerAt).toBe(NOW);
    expect(j.incident!.log.at(-1)!.text).toMatch(/Account owner told/);
  });
});
