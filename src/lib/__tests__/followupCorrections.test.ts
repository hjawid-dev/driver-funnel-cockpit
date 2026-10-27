import { describe, expect, it } from 'vitest';
import { inReview, NOW } from './helpers';
import { DAY, MIN } from '../time';
import { automationEvents } from '../automation';
import { receiveDocument } from '../actions';
import { validateDecision } from '../criteria';
import { currentJob, jobAlert, reportProblem, seedJobs, solutionExample } from '../liveOps';
import { generateSeed } from '../seed';

describe('reviewer corrections', () => {
  const accepted = () => inReview({ registeredAt: NOW - DAY, decision: { type: 'accepted', at: NOW, by: 'Hjalmar' } });

  it('sends day-7/day-14 activation tasks only to ready drivers without a booking', () => {
    const a = accepted();
    const tasks = (over = {}) => automationEvents([{ ...a, ...over }], NOW, NOW + 15 * DAY).filter(e => ['book_task', 'call_task'].includes(e.kind));
    expect(tasks().map(e => e.kind)).toEqual(['book_task', 'call_task']);
    expect(tasks({ extractShown: false })).toEqual([]);
    expect(tasks({ photoApproved: false })).toEqual([]);
    expect(tasks({ firstGig: { bookedFor: NOW + 10 * DAY, bookedAt: NOW } })).toEqual([]);
    expect(tasks({ firstGig: { bookedFor: NOW + DAY, doneAt: NOW + 2 * DAY } })).toEqual([]);
  });

  it('does not fabricate a day-7 message when the extract was shown later', () => {
    const a = { ...accepted(), extractShownAt: NOW + 10 * DAY };
    const tasks = automationEvents([a], NOW, NOW + 15 * DAY);
    expect(tasks.some(e => e.kind === 'book_task')).toBe(false);
    expect(tasks.some(e => e.kind === 'call_task')).toBe(true);
  });

  it('keeps three document nudges separate from activation follow-up', () => {
    const a = inReview({ registeredAt: NOW, docsCompleteAt: undefined, onboardingCompletedAt: undefined, extractShown: false, docs: { id: 'missing', licence: 'missing', photo: 'missing', extract: 'missing' } });
    const events = automationEvents([a], NOW, NOW + 15 * DAY);
    expect(events.filter(e => e.kind === 'nudge' && e.audience === 'driver')).toHaveLength(3);
    expect(events.some(e => ['book_task', 'call_task'].includes(e.kind))).toBe(false);
  });

  it('manual ID verification can be checked and unchecked; acceptance requires verification', () => {
    const uploaded = inReview({ idMethod: 'manual', docs: { ...inReview().docs, id: 'uploaded' } });
    expect(validateDecision(uploaded, { type: 'accepted' }, NOW)).toBeTruthy();
    const checked = receiveDocument(uploaded, 'id', 'verified', NOW);
    expect(validateDecision(checked, { type: 'accepted' }, NOW)).toBeNull();
    expect(validateDecision(receiveDocument(checked, 'id', 'uploaded', NOW + MIN), { type: 'accepted' }, NOW + MIN)).toBeTruthy();
  });

  it('the solution replay starts clean and escalates exactly ten minutes from the report', () => {
    const original = seedJobs(generateSeed(NOW), NOW, { asInCase: true }).find(j => j.asInCase)!;
    const replay = solutionExample(original);
    expect(replay).toMatchObject({ solutionExample: true, id: 'JOB-SOLUTION', pickupAt: original.pickupAt, deadline: original.deadline });
    expect(replay.asInCase).toBeUndefined();
    expect(replay.problemAt).toBeUndefined();
    expect(replay.arrivedAt).toBeUndefined();
    const reportAt = original.pickupAt + 5 * MIN;
    const reported = reportProblem(replay, reportAt, 'keys_missing');
    expect(jobAlert(reported, reportAt + 10 * MIN - 1)).toBeNull();
    expect(jobAlert(reported, reportAt + 10 * MIN)).toMatchObject({ at: reportAt + 10 * MIN, why: 'time' });
    expect(original.asInCase).toBe(true);
    expect(original.escalation?.why).toBe('phoned');
  });

  it('the phone never falls back to the original incident after closing a replay', () => {
    const original = seedJobs(generateSeed(NOW), NOW, { asInCase: true }).find(j => j.asInCase)!;
    const replay = { ...solutionExample(original), incident: { steps: {}, log: [], outcome: { type: 'cancelled' as const, at: NOW }, closedAt: NOW } };
    expect(currentJob([original, replay], replay.driverId, NOW)).toBeNull();
  });
});
