import { describe, expect, it } from 'vitest';
import { mk, inReview, NOW } from './helpers';
import { DAY, HOUR, caseTime } from '../time';
import { evaluate, validateDecision } from '../criteria';
import { automationEvents, liveOpsEvents } from '../automation';
import { workItems } from '../workQueue';
import { confirmSecondReview } from '../actions';
import { generateSeed } from '../seed';
import { generateGigs } from '../gigs';
import { seedJobs } from '../liveOps';
import { guideDestination, guideStatus, followUpTargets } from '../present';
const accepted = (age: number) => inReview({ registeredAt: NOW - (age + 3) * DAY, docsCompleteAt: NOW - (age + 1) * DAY, firstDocsSubmittedAt: NOW - (age + 1) * DAY, onboardingCompletedAt: NOW - age * DAY, decision: { type: 'accepted', at: NOW - age * DAY, by: 'Hjalmar' } });
describe('requested process corrections', () => {
  it('passes the one-year minimum while keeping the simple-drive policy below two years', () => {
    const ev = evaluate(inReview({ licenceYears: 1.5 }));
    expect(ev.mustHaves.find(c => c.key === 'licence')).toMatchObject({ label: 'Valid B licence, held ≥ 1 year', result: 'pass' });
    expect(ev.acceptType).toBe('accepted_simple');
    expect(validateDecision(inReview({ licenceYears: .8 }), { type: 'accepted_simple' }, NOW)).toContain("Can't accept");
  });
  it('sends a driver reminder at seven days and an Ops call task at fourteen, without a welcome task', () => {
    const a = accepted(15), events = automationEvents([a], a.decision!.at, NOW);
    expect(events.some(e => e.kind === 'welcome_task')).toBe(false);
    expect(events.find(e => e.kind === 'book_task')).toMatchObject({ audience: 'driver', at: a.decision!.at + 7 * DAY });
    expect(events.find(e => e.kind === 'call_task')).toMatchObject({ audience: 'ops', at: a.decision!.at + 14 * DAY });
  });
  it('does not chase a driver who already booked and preserves reminder history before a later booking', () => {
    const a = accepted(15);
    const booked = { ...a, firstGig: { gigId: 'JOB', bookedAt: a.decision!.at + 8 * DAY, bookedFor: NOW + DAY } };
    const events = automationEvents([booked], a.decision!.at, NOW);
    expect(events.filter(e => e.kind === 'book_task')).toHaveLength(1);
    expect(events.filter(e => e.kind === 'call_task')).toHaveLength(0);
    expect(workItems([booked], [], NOW)[0]).toMatchObject({ needsAction: false, status: 'First drive booked' });
  });
  it('does not require a call before fourteen days just because a driver has not booked', () => {
    expect(workItems([accepted(2)], generateGigs(NOW), NOW)[0]).toMatchObject({ needsAction: false, next: 'Driver chooses a matching job in the app' });
    expect(workItems([accepted(8)], generateGigs(NOW), NOW)[0]).toMatchObject({ needsAction: false, next: 'Automatic reminder: choose a first drive in the app' });
    expect(workItems([accepted(15)], generateGigs(NOW), NOW)[0]).toMatchObject({ needsAction: true, next: 'Call the driver' });
  });
  it('stops booking follow-up after the driver says they are no longer interested', () => {
    const a = { ...accepted(35), activationReason: { reason: 'not_interested' as const, at: NOW - 30 * DAY } };
    const item = workItems([a], [], NOW)[0];
    expect(item).toMatchObject({ status: 'No longer interested', needsAction: false });
    expect(automationEvents([a], a.decision!.at, NOW).filter(e => ['book_task', 'call_task', 'dormant'].includes(e.kind))).toEqual([]);
  });
  it('keeps reminders and call tasks that predate the logged follow-up outcome', () => {
    const a = { ...accepted(20), activationReason: { reason: 'not_interested' as const, at: NOW } };
    const events = automationEvents([a], a.decision!.at, NOW);
    expect(events.filter(e => e.kind === 'book_task')).toHaveLength(1);
    expect(events.filter(e => e.kind === 'call_task')).toHaveLength(1);
  });
  it('accepts a separate manager confirmation without requiring the queue backup to be that person', () => {
    const a = inReview({ backup: 'Sofia' });
    const checked = confirmSecondReview(a, 'requirements_not_met', 'Jamie (Operations Manager)', NOW);
    expect(validateDecision(checked, { type: 'rejected', reason: 'requirements_not_met', secondReviewer: 'Jamie (Operations Manager)' }, NOW)).toBeNull();
    expect(confirmSecondReview(a, 'requirements_not_met', 'Hjalmar (Team Lead)', NOW).secondReview).toBeUndefined();
  });
  it('creates no new-customer call task when both pickup confirmations exist', () => {
    const apps = generateSeed(NOW), j = seedJobs(apps, NOW).find(x => x.newSite)!;
    const confirmed = { ...j, confirmed24At: j.pickupAt - 23 * HOUR, confirmed60At: j.pickupAt - 50 * 60000 };
    const events = liveOpsEvents([confirmed], j.pickupAt - 25 * HOUR, j.pickupAt - 45 * 60000);
    expect(events.filter(e => e.kind === 'pickup_check')).toHaveLength(2);
    expect(events.filter(e => e.kind === 'pickup_task')).toEqual([]);
  });
  it('starts step 5 blank, follows the user-created application, and shows a real completion state', () => {
    const at = caseTime(NOW), apps = generateSeed(at), data = { apps, gigs: generateGigs(at), jobs: seedJobs(apps, at, { asInCase: true }), threads: [] };
    expect(guideDestination('onboarding', data).driverId).toBeNull();
    expect(guideStatus('onboarding', data).kind).toBe('pending');
    const a = mk({ id: 'NEW', source: 'self', name: 'User entered name' });data.apps = [...apps, a];
    expect(guideDestination('onboarding', data, a.id).driverId).toBe(a.id);
    expect(guideStatus('onboarding', data, a.id).kind).toBe('pending');
    expect(guideStatus('onboarding', data, a.id).text).toContain('Registration saved');
    expect(guideStatus('onboarding', { ...data, apps: [...apps, { ...a, docsCompleteAt: at }] }, a.id).kind).toBe('complete');
    expect(guideStatus('criteria', data).kind).toBe('pending');
    const targets = followUpTargets(data, at);
    expect(targets.reminder?.name).toBe('Ida Sjöberg');expect(targets.call?.name).toBe('Anton Wallin');
    expect(guideDestination('followup', data).filter).toBe('awaiting');
  });
});
