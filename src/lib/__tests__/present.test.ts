import { describe, expect, it } from 'vitest';
import { NOW } from './helpers';
import { caseTime, DAY, MIN } from '../time';
import { generateSeed } from '../seed';
import { generateGigs } from '../gigs';
import { seedJobs, syncFirstDrive } from '../liveOps';
import { deriveStage } from '../stage';
import { incidentTarget, presentDone, preparePresentAction, reviewTarget, runPresentAction, type PresentAction } from '../present';
import type { DemoData } from '../persist';
const at = caseTime(NOW);
function fixture(): DemoData {
  const apps = generateSeed(at), gigs = generateGigs(at);
  return { apps, gigs, jobs: seedJobs(apps, at, { asInCase: true }), threads: [] };
}
function run(actions: PresentAction[], data = fixture(), now = at) {
  for (const action of actions) ({ data, now } = runPresentAction(action, data, now));
  return { data, now };
}
describe('guided demonstration', () => {
  it('completes both case stories through real domain rules and the same Elin', () => {
    const before = fixture(), registration = reviewTarget(before.apps)!.registeredAt;
    const { data, now } = run(['respond', 'resolve', 'nudge', 'review', 'book', 'pickup', 'deliver'], before);
    const j = incidentTarget(data.jobs)!, a = reviewTarget(data.apps)!;
    expect(j.incident).toMatchObject({ waitPaid: true, cause: 'customer_keys', reviewBooked: true });
    expect(j.incident!.waitingEndedAt! - j.arrivedAt!).toBe(40 * MIN);
    expect(j.deliveredAt).toBeUndefined();
    expect(j.incident!.reviewAt).toBeGreaterThan(j.incident!.closedAt!);
    expect(a.registeredAt).toBe(registration);
    expect(deriveStage(a)).toBe('active');
    expect(a.firstGig).toMatchObject({ doneAt: now, onTime: true, ok: true, customerSatisfied: true });
    const drive = data.jobs.find(x => x.id === a.firstGig!.gigId)!;
    expect(drive.driverId).toBe(a.id);
    expect(drive.deliveredAt).toBe(a.firstGig!.doneAt);
    expect(drive.incident).toBeUndefined();
  });
  it('keeps a booking accepted, without pretending it is an activation', () => {
    const { data } = run(['review', 'book']);
    const a = reviewTarget(data.apps)!;
    expect(deriveStage(a)).toBe('accepted');
    expect(a.firstGig?.doneAt).toBeUndefined();
    expect(data.jobs.find(j => j.id === a.firstGig?.gigId)?.dispatchReady).toBe(true);
  });
  it('refuses delivery before pickup instead of inventing delivery evidence', () => {
    const { data, now } = run(['review', 'book']);
    expect(() => runPresentAction('deliver', data, now)).toThrow('earlier demo actions');
    expect(presentDone('deliver', data)).toBe(false);
  });
  it('explicit checkpoint preparation fills prerequisites and preserves unrelated edits', () => {
    const d = fixture();d.apps[0] = { ...d.apps[0], availabilityNote: 'Manual note to preserve' };
    const { data, now } = preparePresentAction('pickup', d, at);
    expect(presentDone('book', data)).toBe(true);
    expect(presentDone('pickup', data)).toBe(false);
    expect(data.apps[0].availabilityNote).toBe('Manual note to preserve');
    expect(incidentTarget(data.jobs)!.incident).toBeUndefined();
    expect(now).toBe(at);
  });
  it('does not duplicate decisions, nudges, calls or booking events when revisiting', () => {
    const r = run(['respond', 'resolve', 'nudge', 'review', 'book']);
    for (const action of ['respond', 'resolve', 'nudge', 'review', 'book'] as PresentAction[]) {
      const again = runPresentAction(action, r.data, r.now);
      expect(again.data).toBe(r.data);
      expect(again.now).toBe(r.now);
    }
  });
  it('rejects a late keys-found shortcut and retains the unresolved incident', () => {
    const { data } = run(['respond']);
    expect(() => runPresentAction('resolve', data, at + DAY)).toThrow('cut-off');
    expect(incidentTarget(data.jobs)?.incident?.closedAt).toBeUndefined();
  });
  it('does not overwrite a manual rejection with an automatic acceptance', () => {
    const d = fixture(), a = reviewTarget(d.apps)!;
    a.decision = { type: 'rejected', reason: 'id_unverified', by: 'Hjalmar', at };
    const prepared = preparePresentAction('book', d, at);
    expect(reviewTarget(prepared.data.apps)?.decision?.type).toBe('rejected');
    expect(() => runPresentAction('book', prepared.data, at)).toThrow('No matching job');
  });
  it('refuses departure when a manually changed pre-drive check is no longer valid', () => {
    const { data, now } = run(['review', 'book']);
    const a = reviewTarget(data.apps)!;a.extractShown = false;
    data.jobs = syncFirstDrive(data.jobs, a, data.gigs);
    expect(() => runPresentAction('pickup', data, now)).toThrow('pre-drive checks');
    expect(data.jobs.find(j => j.driverId === a.id)?.departedAt).toBeUndefined();
  });
});
