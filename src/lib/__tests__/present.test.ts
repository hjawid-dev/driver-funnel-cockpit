import { describe, expect, it } from 'vitest';
import { NOW } from './helpers';
import { caseTime } from '../time';
import { generateSeed } from '../seed';
import { firstGigOffers, generateGigs } from '../gigs';
import { seedJobs, syncFirstDrive } from '../liveOps';
import { guideDestination, presentEvidence, reviewTarget, PRESENT_STEPS } from '../present';
import { applyDecision, bookFirstGig, completeOnboarding, setExtractShown, setPhotoApproved } from '../actions';
import type { DemoData } from '../persist';
const at = caseTime(NOW);
const fixture = (): DemoData => {
  const apps = generateSeed(at), gigs = generateGigs(at);
  return { apps, gigs, jobs: seedJobs(apps, at, { asInCase: true }), threads: [] };
};
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') { Object.freeze(v); Object.values(v).forEach(freeze); }
  return v;
}
describe('case walkthrough navigation', () => {
  it('can visit every step forwards and backwards without changing any business record', () => {
    const data = freeze(fixture()), before = JSON.stringify(data);
    for (const step of [...PRESENT_STEPS, ...[...PRESENT_STEPS].reverse()]) {
      guideDestination(step.key, data); presentEvidence(step.key, data);
    }
    expect(JSON.stringify(data)).toBe(before);
  });
  it('keeps Julia for the incident and switches to an upcoming site only for prevention', () => {
    const data = fixture();
    const ids = ['incident', 'playbook', 'decision'].map(k => guideDestination(k as 'incident', data).liveId);
    expect(new Set(ids).size).toBe(1);
    expect(data.jobs.find(j => j.id === ids[0])?.asInCase).toBe(true);
    expect(data.jobs.find(j => j.id === guideDestination('prevent', data).liveId)?.newSite).toBe(true);
  });
  it('shows the same Nora first in onboarding and then in her actual message inbox', () => {
    const data = fixture(), app = guideDestination('onboarding', data), messages = guideDestination('reminders', data);
    expect(app.driverId).toBe(messages.driverId);
    expect(data.apps.find(a => a.id === app.driverId)?.name).toBe('Nora Axelsson');
    expect(app.phone).toBe('steps'); expect(messages.phone).toBe('chat');
  });
  it('keeps Ahmed after a normal human acceptance and normal matching-job booking', () => {
    const data = fixture(); let a = reviewTarget(data.apps)!;
    expect(a.licenceYears).toBe(1.5);
    a = completeOnboarding(setPhotoApproved(setExtractShown(a, true, at), true, at), at);
    const accepted = applyDecision(a, { type: 'accepted_simple' }, at);
    if (!accepted.ok) throw Error(accepted.error);
    data.apps = data.apps.map(x => x.id === a.id ? accepted.applicant : x);
    const offers = firstGigOffers(accepted.applicant, data.gigs, data.apps, at);
    expect(offers.length).toBeGreaterThan(0);
    const booked = bookFirstGig(accepted.applicant, offers[0], at, data.apps);
    if (!booked.ok) throw Error(booked.error);
    data.apps = data.apps.map(x => x.id === a.id ? booked.applicant : x);
    data.jobs = syncFirstDrive(data.jobs, booked.applicant, data.gigs);
    expect(guideDestination('criteria', data).applicantId).toBe(a.id);
    expect(guideDestination('activate', data).driverId).toBe(a.id);
    expect(guideDestination('deliver', data).driverId).toBe(a.id);
    expect(guideDestination('deliver', data).liveId).toBe(offers[0].id);
    expect(booked.applicant.firstGig?.doneAt).toBeUndefined();
  });
  it('keeps manual rejection and explains why offers are unavailable without replacing the decision', () => {
    const data = fixture(), a = reviewTarget(data.apps)!;
    a.decision = { type: 'rejected', reason: 'id_unverified', by: 'Hjalmar', at };
    const before = JSON.stringify(data);
    guideDestination('activate', data); guideDestination('deliver', data);
    expect(presentEvidence('activate', data)).toContain('rejected');
    expect(JSON.stringify(data)).toBe(before);
  });
  it('does not invent a job or activation when a visitor skips ahead', () => {
    const data = fixture();
    const destination = guideDestination('deliver', data);
    expect(destination.liveId).toBeNull();
    expect(presentEvidence('deliver', data)).toContain('Book Ahmed');
    expect(reviewTarget(data.apps)?.decision).toBeUndefined();
    expect(data.jobs.some(j => j.driverId === destination.driverId && j.firstDrive)).toBe(false);
  });
});
