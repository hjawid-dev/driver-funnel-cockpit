import { describe, expect, it } from 'vitest';
import { guideAdvance, type GuideSnapshot } from '../guideFlow';
import { generateSeed } from '../seed';
import { generateGigs } from '../gigs';
import { seedJobs, solutionExample, reportReason, markStep, recordOwnError, tellAccountOwner, setOutcome, bookReplacement, type Job } from '../liveOps';
import { caseTime, DAY, MIN } from '../time';
import { NOW } from './helpers';
import { reviewTarget, docsTarget, followUpTargets } from '../present';

const at = caseTime(NOW) - 25 * MIN;
function fixture(): GuideSnapshot {
  const apps = generateSeed(at + 25 * MIN);
  const original = seedJobs(apps, at + 25 * MIN, { asInCase: true }).find(j => j.asInCase)!;
  return { now: at, applicantId: null, data: { apps, gigs: generateGigs(at), jobs: [solutionExample(original)], threads: [] } };
}
const withJob = (s: GuideSnapshot, job: Job, now = s.now): GuideSnapshot => ({ ...s, now, data: { ...s.data, jobs: [job] } });

describe('guide follows real actions without changing business data', () => {
  it('follows manual phone reporting, then the actual ten-minute clock', () => {
    const before = fixture();
    const reported = withJob(before, reportReason(before.data.jobs[0], 'keys_missing', at));
    expect(guideAdvance(before, reported, 1)?.key).toBe('assistant');
    expect(guideAdvance(reported, { ...reported, now: at + 10 * MIN - 1 }, 1)).toBeNull();
    expect(guideAdvance(reported, { ...reported, now: at + 10 * MIN }, 1)?.key).toBe('playbook');
  });
  it('follows each manually logged playbook action', () => {
    let s = fixture();
    const actions: [(j: Job) => Job, string][] = [
      [j => markStep(j, 'keep_driver', at), 'booking_check'],
      [j => recordOwnError(j, false, '', at), 'contact'],
      [j => markStep(j, 'escalate', at), 'customer'],
    ];
    for (const [action, key] of actions) {
      const after = withJob(s, action(s.data.jobs[0]));
      expect(guideAdvance(s, after, 1)?.key).toBe(key); s = after;
    }
  });
  it('waits for the customer update AND the pilot account-owner confirmation, in either order', () => {
    const s = fixture(), j = s.data.jobs[0];
    for (const first of ['customer', 'owner']) {
      const one = withJob(s, first === 'customer' ? markStep(j, 'customer', at) : tellAccountOwner(j, at));
      expect(guideAdvance(s, one, 1)).toBeNull();
      const two = withJob(one, first === 'customer' ? tellAccountOwner(one.data.jobs[0], at) : markStep(one.data.jobs[0], 'customer', at));
      expect(guideAdvance(one, two, 1)?.key).toBe('decision');
    }
  });
  it('keeps new-date timing in the decision step until it is actually saved', () => {
    const s = fixture();
    const chosen = withJob(s, setOutcome(s.data.jobs[0], 'new_date', at));
    expect(guideAdvance(s, chosen, 1)).toBeNull();
    const saved = withJob(chosen, bookReplacement(chosen.data.jobs[0], at + DAY, at, { deadline: at + DAY + 180 * MIN, driverConfirmed: false }));
    expect(guideAdvance(chosen, saved, 1)?.key).toBe('close');
  });
  it('does not advance on viewing old records, resetting, or unrelated changes', () => {
    const s = fixture(), before = JSON.stringify(s);
    expect(guideAdvance(s, s, 1)).toBeNull();
    expect(guideAdvance(s, fixture(), 1)).toBeNull();
    const changed = { ...s, data: { ...s.data, apps: s.data.apps.map(a => ({ ...a, photoApproved: true })) } };
    expect(guideAdvance(s, changed, 2)).toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });
  it('moves Nora’s logged manual follow-up to the decision queue', () => {
    const s = fixture(), nora = docsTarget(s.data.apps)!;
    const after = { ...s, data: { ...s.data, apps: s.data.apps.map(a => a.id === nora.id ? { ...a, nudges: [...a.nudges, at] } : a) } };
    expect(guideAdvance(s, after, 2)).toEqual({ key: 'queue', message: 'Manual follow-up logged' });
    expect(guideAdvance(after, after, 2)).toBeNull();
  });
  it('retains the historical day-7 example when the first-drive clock has advanced', () => {
    const s = fixture();
    expect(followUpTargets(s.data, at + 5 * DAY).reminder?.name).toBe('Ida Sjöberg');
    const ida = s.data.apps.find(a => a.name === 'Ida Sjöberg')!;
    const blocked = { ...s.data, apps: s.data.apps.map(a => a.id === ida.id ? { ...a, extractShown: false } : a) };
    expect(followUpTargets(blocked, at + 5 * DAY).reminder?.id).not.toBe(ida.id);
  });
  it('follows Ahmed’s real decision and delivery, never treating booking as activation', () => {
    const s = fixture(), ahmed = reviewTarget(s.data.apps)!;
    const replace = (a: typeof ahmed): GuideSnapshot => ({ ...s, data: { ...s.data, apps: s.data.apps.map(x => x.id === a.id ? a : x) } });
    const accepted = replace({ ...ahmed, decision: { type: 'accepted_simple', at, by: 'Hjalmar' } });
    expect(guideAdvance(s, accepted, 2)?.key).toBe('activate');
    const booked = replace({ ...reviewTarget(accepted.data.apps)!, firstGig: { bookedFor: at + DAY } });
    expect(guideAdvance(accepted, booked, 2)).toBeNull();
    const delivered = replace({ ...reviewTarget(booked.data.apps)!, firstGig: { bookedFor: at + DAY, doneAt: at + DAY + 60 * MIN } });
    expect(guideAdvance(booked, delivered, 2)?.key).toBe('followup');
  });
});
