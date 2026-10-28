import { describe, it, expect } from 'vitest';
import { NOW, inReview, mk } from './helpers';
import { DAY, HOUR, MIN } from '../time';
import { computeKpis } from '../kpis';
import { nextReviewSlot } from '../sla';
import { callSlots } from '../booking';
import { workItems } from '../workQueue';
import { generateGigs } from '../gigs';
import { activationReason } from '../activation';
import { setActivationReason, completeFirstGig } from '../actions';
import { applyDecision } from '../actions';
import { closeIncident, setOutcome, bookReplacement, replacementJob, firstDriveResult, syncFirstDrive, firstDriveJob, pickupChecks, checkIn, gotKeys, assisting, seedJobs } from '../liveOps';
import { releaseIfUnchecked } from '../extract';
import { generateSeed } from '../seed';
import { weeklyFacts } from '../report/facts';
import { templateReport } from '../report/check';
import { guideStatus } from '../present';
import { currentStep, opsState } from '../opsState';
const accepted = (age = 18) => inReview({ id: 'A', registeredAt: NOW - 40 * DAY, decision: { type: 'accepted', at: NOW - age * DAY, by: 'Hjalmar' } });
const gigs = generateGigs(NOW);
const job = () => seedJobs(generateSeed(NOW), NOW, { asInCase: true }).find(j => j.asInCase)!;

describe('case audit: outcome and exception paths', () => {
  it('uses the same applicants for cohort conversion even when throughput exceeds 100%', () => {
    const a = { ...accepted(32), firstGig: { bookedFor: NOW - 12 * DAY, doneAt: NOW - 10 * DAY } };
    const late = { ...accepted(32), id: 'B', registeredAt: NOW - 50 * DAY, firstGig: { bookedFor: NOW - 12 * DAY, doneAt: NOW - 10 * DAY } };
    const k = computeKpis([a, late, mk({ registeredAt: NOW - DAY })], NOW);
    expect(k.find(k => k.key === 'cohortConversion')).toMatchObject({ value: 50, status: 'info', target: 'Diagnostic · no target' });
    expect(k.find(k => k.key === 'appToActive')).toMatchObject({ value: 200, status: 'on', target: 'Target 35%', northStar: true });
  });
  it('uses mean decision time and preserves the slow-file signal', () => {
    const apps = [10, 20, 150].map(h => inReview({ registeredAt: NOW - 200 * HOUR, decision: { type: 'accepted', at: NOW - (200 - h) * HOUR, by: 'x' } }));
    const k = computeKpis(apps, NOW).find(k => k.key === 'timeToDecision')!;
    expect(k.value).toBe(60); expect(k.sub).toContain('Median 20 h'); expect(k.status).toBe('risk');
  });
  it('contacts incomplete applicants before the 48-hour deadline without resetting it', () => {
    const a = mk({ registeredAt: NOW - 25 * HOUR, docs: { ...mk().docs, photo: 'missing' } });
    expect(workItems([a], gigs, NOW)[0]).toMatchObject({ needsAction: true, next: 'Owner contacts applicant: resolve missing documents' });
  });
  it('does not call incompleteness proof of silence', () => {
    const a = mk({ registeredAt: NOW - 16 * DAY, docTimes: { photo: NOW - HOUR } });
    expect(workItems([a], gigs, NOW)[0].status).toBe('Incomplete after 14 days');
    const r = applyDecision(a, { type: 'rejected', reason: 'no_response_14d' }, NOW);
    expect(r.ok && r.message).toContain('Closed incomplete file');
  });
  it('keeps 48 calendar hours over a weekend: Friday afternoon gets the Saturday block, in display and call booking alike', () => {
    const friday = new Date('2026-10-23T15:00:00').getTime();
    const slot = nextReviewSlot(friday);
    expect(new Date(slot.at).getDay()).toBe(6); expect(slot.time).toBe('10:00'); expect(slot.at).toBe(callSlots(friday, [])[0]);
    expect(slot.at - friday).toBeLessThan(48 * HOUR);
  });
  it('flags a passed booking and an interrupted drive instead of treating booking as activation', () => {
    const a = { ...accepted(), firstGig: { gigId: 'OLD', bookedFor: NOW - DAY } };
    expect(workItems([a], gigs, NOW)[0]).toMatchObject({ needsAction: true, status: 'Delivery not recorded' });
    const j = { ...job(), id: 'OLD', driverId: a.id, firstDrive: true, incident: { steps: {}, log: [], outcome: { type: 'cancelled' as const, at: NOW } } };
    expect(workItems([a], gigs, NOW, [j])[0].status).toBe('First drive interrupted');
  });
  it('does not ask drivers to book a check before the extract arrives', () => {
    const a = { ...accepted(2), extractShown: false, docs: { ...mk().docs, extract: 'pending' as const } };
    expect(activationReason(a, [a], gigs, NOW)).toBe('extract');
    expect(workItems([a], gigs, NOW)[0]).toMatchObject({ needsAction: false, status: 'Waiting for extract to arrive' });
  });
  it('makes no matching demand an owner task rather than asking the driver to pick nothing', () => {
    expect(workItems([accepted(2)], [], NOW)[0]).toMatchObject({ needsAction: true, status: 'No matching first drive' });
  });
  it('uses logged contact outcomes and does not immediately repeat the same call', () => {
    const a = setActivationReason(accepted(), 'unreachable', NOW);
    if (!a.ok) throw Error(a.error);
    expect(workItems([a.applicant], gigs, NOW)[0]).toMatchObject({ needsAction: false, status: 'Contact attempt logged' });
    expect(workItems([a.applicant], gigs, NOW + 3 * DAY)[0]).toMatchObject({ needsAction: true, status: 'Contact retry due' });
  });
  it('keeps a released customer transport visible and allows one new driver to reserve it', () => {
    const g = gigs.find(g => g.at >= NOW + 5 * DAY)!;
    const a = { ...accepted(2), extractShown: false, firstGig: { gigId: g.id, bookedAt: NOW, bookedFor: g.at } };
    const js = syncFirstDrive([], a, gigs);
    const released = releaseIfUnchecked(a, g.at - DAY)!;
    const waiting = syncFirstDrive(js, released, gigs);
    expect(waiting).toHaveLength(1); expect(waiting[0]).toMatchObject({ id: g.id, unassigned: true });
    expect(opsState(waiting[0], g.at - DAY)).toBe('check_due');
    const b = { ...accepted(), id: 'B', firstGig: { gigId: g.id, bookedAt: NOW, bookedFor: g.at } };
    const assigned = syncFirstDrive(waiting, b, gigs);
    expect(assigned).toHaveLength(1); expect(assigned[0]).toMatchObject({ driverId: 'B', firstDrive: true }); expect(assigned[0].unassigned).not.toBe(true);
  });
  it('requires agreed customer times but allows an unassigned replacement', () => {
    const j = setOutcome(job(), 'later_today', NOW);
    expect(bookReplacement(j, NOW + HOUR, NOW)).toBe(j);
    const unassigned = bookReplacement(j, NOW + HOUR, NOW, { deadline: NOW + 4 * HOUR, driverConfirmed: false });
    expect(currentStep(j)?.key).toBe('decide');
    expect(currentStep(unassigned)?.key).toBe('close');
    expect(replacementJob(unassigned)).toMatchObject({ unassigned: true, driverId: '', pickupAt: NOW + HOUR, deadline: NOW + 4 * HOUR });
    expect(bookReplacement(j, NOW + HOUR, NOW, { deadline: NOW + HOUR, driverConfirmed: false })).toBe(j);
    const confirmed = bookReplacement(j, NOW + HOUR, NOW, { deadline: NOW + 4 * HOUR, driverConfirmed: true });
    expect(replacementJob(confirmed)).toMatchObject({ deadline: NOW + 4 * HOUR, pickupAt: NOW + HOUR });
  });
  it('preserves the replacement first-drive identity and can activate on that job', () => {
    const a = accepted(); const g = gigs[0];
    const j = firstDriveJob({ ...a, firstGig: { gigId: g.id, bookedFor: g.at } }, g)!;
    const decided = setOutcome(j, 'new_date', NOW);
    const confirmed = bookReplacement(decided, NOW + DAY, NOW, { deadline: NOW + DAY + 4 * HOUR, driverConfirmed: true });
    const r = replacementJob(confirmed)!; expect(r.firstDrive).toBe(true);
    const linked = { ...a, firstGig: { gigId: r.id, bookedFor: r.pickupAt } };
    expect(syncFirstDrive([r], linked, gigs)[0].unassigned).not.toBe(true);
    expect(completeFirstGig(linked, { onTime: true, ok: true, delivery: { jobId: r.id, at: r.pickupAt + HOUR } }, r.pickupAt + HOUR).ok).toBe(true);
  });
  it('does not hide lateness by extending the deadline', () => {
    const j = { ...job(), originalDeadline: NOW - HOUR, deadline: NOW + HOUR, deliveredAt: NOW };
    expect(firstDriveResult(j).onTime).toBe(false);
  });
  it('requires a scheduled review for pilot incidents but not every routine incident', () => {
    const j = setOutcome({ ...job(), pilot: false }, 'cancelled', NOW);
    expect(closeIncident(j, { waitPaid: true, feeWaived: false, cause: 'customer_keys' }, NOW).ok).toBe(true);
    expect(closeIncident({ ...j, pilot: true }, { waitPaid: true, feeWaived: false, cause: 'customer_keys' }, NOW).ok).toBe(false);
  });
  it('does not turn a normal key handover into an assistant rescue', () => {
    const j = checkIn({ ...job(), asInCase: false, escalation: undefined, incident: undefined, problemAt: undefined, arrivedAt: undefined, pickupAt: NOW, deadline: NOW + 3 * HOUR }, NOW);
    expect(assisting(j, NOW + 4 * MIN)).toBeNull(); expect(gotKeys(j, NOW + 2 * MIN).incident).toBeUndefined();
  });
  it('sends one short-notice confirmation with a reply deadline before pickup', () => {
    const j = { ...job(), asInCase: false, pickupAt: NOW + 10 * MIN, bookedAt: NOW, confirmed24At: undefined, confirmed60At: undefined };
    const checks = pickupChecks(j, NOW); expect(checks).toHaveLength(1); expect(checks[0].label).toBe('At late booking');
    expect(checks[0].replyBy).toBe(NOW + 5 * MIN); expect(pickupChecks(j, NOW + 5 * MIN)[0].state).toBe('no_reply');
  });
  it('reports day-14 calls, not day-7 calls, and drops unsupported capacity/AI targets', () => {
    const a = { ...accepted(8), id: '8' }, b = accepted(18);
    const wf = weeklyFacts([a,b], [], NOW, [], gigs);
    expect(wf.facts.find(f => f.id === 'awaiting_call_due')?.value).toBe(1);
    expect(templateReport(wf).actions.some(a => a.text.includes('Call the 1 drivers'))).toBe(true);
    expect(wf.facts.some(f => ['drivers_for_open_jobs','chat_target'].includes(f.id))).toBe(false);
  });
  it('only calls the activation demo complete after delivery', () => {
    const a = { ...accepted(), name: 'Ahmed Hassan', firstGig: { bookedFor: NOW + DAY } };
    const data = { apps: [a], jobs: [], gigs, threads: [] };
    expect(guideStatus('activate', data).kind).toBe('pending');
    expect(guideStatus('activate', { ...data, apps: [{ ...a, firstGig: { ...a.firstGig, doneAt: NOW + DAY } }] }).kind).toBe('complete');
  });
});
