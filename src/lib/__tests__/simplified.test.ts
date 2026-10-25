import { describe, expect, it } from 'vitest';
import { caseTime, DAY, HOUR } from '../time';
import { generateSeed } from '../seed';
import { generateGigs } from '../gigs';
import { deriveStage } from '../stage';
import { closeIncident, markStep, seedJobs, setOutcome } from '../liveOps';
import { filterItems, queueCounts, workItems } from '../workQueue';
import { byOpsPriority, currentStep, firstToOpen, opsState } from '../opsState';
import { activationTarget, incidentTarget, PRESENT_STEPS, reviewTarget } from '../present';
import { inReview, mk, NOW } from './helpers';

describe('the candidate queue', () => {
  it('puts an overdue review first and says what to do', () => {
    const fresh = inReview({ id: 'A', docsCompleteAt: NOW - 3 * HOUR });
    const late = inReview({ id: 'B', docsCompleteAt: NOW - 60 * HOUR });
    const [first, second] = workItems([fresh, late], [], NOW);
    expect(first.a.id).toBe('B');
    expect(first).toMatchObject({ stage: 'review', tone: 'bad', next: 'Review and decide', needsAction: true });
    expect(first.status).toMatch(/^Overdue/);
    expect(second.tone).toBe('muted');
  });

  it('leaves files on automatic reminders alone, and asks a person to close one after 14 days', () => {
    const recent = mk({ id: 'R', registeredAt: NOW - HOUR, docs: { licence: 'verified', id: 'verified', extract: 'missing', photo: 'missing' } });
    const stale = mk({ id: 'S', registeredAt: NOW - 15 * DAY, docs: { licence: 'verified', id: 'missing', extract: 'missing', photo: 'missing' } });
    const items = workItems([recent, stale], [], NOW);
    const r = items.find((w) => w.a.id === 'R')!;
    const s = items.find((w) => w.a.id === 'S')!;
    expect(r).toMatchObject({ needsAction: false, next: 'Reminders run by themselves' });
    expect(r.detail).toMatch(/Missing: extract, photo/);
    expect(s).toMatchObject({ needsAction: true, next: 'Close the file: no response', tone: 'bad' });
  });

  it('asks for a call when an accepted driver has had no first gig in 14 days', () => {
    const a = mk({ docsCompleteAt: NOW - 20 * DAY, decision: { type: 'accepted', at: NOW - 15 * DAY, by: 'Hjalmar' } });
    expect(workItems([a], [], NOW)[0]).toMatchObject({ stage: 'accepted', next: 'Call the driver', needsAction: true });
  });

  it('adds up on the seed: the three lists hold everyone not yet active, rejected or closed', () => {
    const now = caseTime(NOW);
    const apps = generateSeed(now);
    const items = workItems(apps, generateGigs(now), now);
    const c = queueCounts(items, apps.length);
    const n = (s: string) => apps.filter((a) => deriveStage(a) === s).length;
    expect([c.missing, c.review, c.awaiting]).toEqual([n('registered'), n('review'), n('accepted')]);
    expect(c.missing + c.review + c.awaiting).toBe(items.length);
    expect(c.all).toBe(apps.length);
    expect(filterItems(items, 'action').every((w) => w.needsAction)).toBe(true);
    expect(c.action).toBeGreaterThan(0);
    expect(c.action).toBeLessThan(items.length);
  });
});

describe('Live Ops states', () => {
  const at = caseTime(NOW);
  const apps = generateSeed(at);
  const jobs = seedJobs(apps, at, { asInCase: true });
  const julia = jobs.find((j) => j.asInCase)!;

  it('opens on the case: Julia needs a person, first in the list', () => {
    expect(opsState(julia, at)).toBe('needs_person');
    expect(firstToOpen(jobs, at)?.id).toBe(julia.id);
    expect(byOpsPriority(jobs, at)[0].id).toBe(julia.id);
  });

  it('puts exceptions before routine and done', () => {
    const order = byOpsPriority(jobs, at).map((j) => opsState(j, at));
    const rank = (s: string) => (['needs_person', 'to_close', 'issue', 'check_due'].includes(s) ? 0 : ['resolved', 'delivered'].includes(s) ? 2 : 1);
    expect(order.map(rank)).toEqual([...order.map(rank)].sort());
  });

  it('follows the playbook to a documented resolution', () => {
    expect(currentStep(julia)?.key).toBe('keep_driver');
    const called = markStep(julia, 'keep_driver', at);
    expect(currentStep(called)?.key).toBe('own_error');
    const decided = setOutcome(called, 'new_date', at + 10 * 60_000);
    expect(opsState(decided, at + 10 * 60_000)).toBe('to_close');
    const r = closeIncident(decided, { waitPaid: true, feeWaived: true, cause: 'customer_keys', reviewBooked: true }, at + 12 * 60_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(opsState(r.job, at + 12 * 60_000)).toBe('resolved');
  });

  it('shows a delivered drive as delivered', () => {
    const filip = jobs.find((j) => j.driverName === 'Filip Nyström')!;
    expect(opsState(filip, at)).toBe('delivered');
  });
});

describe('presentation mode', () => {
  const at = caseTime(NOW);
  const apps = generateSeed(at);
  const gigs = generateGigs(at);
  const jobs = seedJobs(apps, at, { asInCase: true });

  it('has five steps, the report last', () => {
    expect(PRESENT_STEPS.map((s) => s.key)).toEqual(['funnel', 'review', 'activate', 'incident', 'improve']);
  });

  it('opens Elin for review, a driver who needs a push to a first gig, and the case', () => {
    expect(reviewTarget(apps)?.name).toBe('Elin Johansson');
    const d = activationTarget(apps, gigs, at)!;
    expect(deriveStage(d)).toBe('accepted');
    expect(workItems(apps, gigs, at).find((w) => w.a.id === d.id)?.needsAction).toBe(true);
    expect(incidentTarget(jobs, at)?.asInCase).toBe(true);
  });
});
