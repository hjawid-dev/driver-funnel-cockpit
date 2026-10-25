import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../timeline';
import { restore, serialize, shiftApplicant } from '../persist';
import { generateSeed } from '../seed';
import { generateGigs } from '../gigs';
import { slaStatus } from '../sla';
import { DAY, HOUR } from '../time';
import { mk, NOW } from './helpers';
import { seedThreads } from '../chat/threads';
import { seedJobs } from '../liveOps';

describe('buildTimeline', () => {
  it('orders every transition in time and marks upcoming items', () => {
    const reg = NOW - 30 * HOUR;
    const a = mk({ registeredAt: reg, docTimes: { id: reg + HOUR }, docs: { licence: 'missing', id: 'verified', extract: 'pending', photo: 'missing' } });
    const t = buildTimeline(a, NOW);
    expect(t.map((e) => e.label)).toEqual(['Registered', 'ID (BankID) received', 'Auto-nudge 1', 'Auto-nudge 2', 'Auto-nudge 3']);
    expect(t.at(-1)!.upcoming).toBe(true);
  });
  it('shows decision with reason and first-gig quality', () => {
    const seed = generateSeed(NOW);
    const late = seed.find((a) => a.firstGig?.onTime === false)!;
    const t = buildTimeline(late, NOW);
    expect(t.map((e) => e.kind)).toEqual(expect.arrayContaining(['registered', 'complete', 'decision', 'call', 'gig']));
    expect(t.find((e) => e.kind === 'gig')!.detail).toBe('Late');
    const rejected = seed.find((a) => a.decision?.reason === 'no_valid_licence')!;
    expect(buildTimeline(rejected, NOW).find((e) => e.kind === 'decision')!.detail).toContain('No valid B licence');
  });
});

describe('persist', () => {
  const seed = generateSeed(NOW);
  const gigs = generateGigs(NOW);
  const threads = seedThreads(seed, NOW);
  const jobs = seedJobs(seed, NOW);
  const data = { apps: seed, gigs, threads, jobs };
  it('round-trips without change when saved recently', () => {
    expect(restore(serialize(data, NOW), NOW + HOUR)).toEqual(data);
  });
  it('moves old saves forward so SLA clocks and jobs look the same', () => {
    const later = NOW + 5 * DAY;
    const out = restore(serialize(data, NOW), later)!;
    const restored = out.apps;
    expect(out.gigs[0].at).toBe(gigs[0].at + 5 * DAY);
    const elin = (xs: typeof seed) => xs.find((a) => a.name === 'Elin Johansson')!;
    expect(slaStatus(elin(restored).docsCompleteAt!, later).label).toBe(slaStatus(elin(seed).docsCompleteAt!, NOW).label);
    expect(restored[0].log[0].at).toBe(seed[0].log[0].at + 5 * DAY);
    expect(out.threads[0].messages[0].at).toBe(threads[0].messages[0].at + 5 * DAY);
    const waiting = threads.find((t) => t.status === 'waiting')!;
    expect(out.threads.find((t) => t.id === waiting.id)!.waitingSince).toBe(waiting.waitingSince! + 5 * DAY);
    expect(out.jobs[0].pickupAt).toBe(jobs[0].pickupAt + 5 * DAY);
  });
  it.each([3, 4, 5, 6, 7])('starts fresh instead of a v%i save: before v8 the decision waited for the extract', (version) => {
    expect(restore(JSON.stringify({ version, savedAt: NOW, apps: seed, gigs, threads, jobs }), NOW + HOUR)).toBeNull();
  });
  it('moves the extract check, when it was shown and a released drive forward with the rest', () => {
    const a = mk({ extractShownAt: NOW, extractCheckAt: NOW + DAY, activationReason: { reason: 'unreachable', at: NOW }, firstGig: { released: { at: NOW, bookedFor: NOW + DAY } } });
    const s = shiftApplicant(a, HOUR);
    expect([s.extractShownAt, s.extractCheckAt, s.activationReason!.at, s.firstGig!.released!.at, s.firstGig!.released!.bookedFor]).toEqual([NOW + HOUR, NOW + DAY + HOUR, NOW + HOUR, NOW + HOUR, NOW + DAY + HOUR]);
  });
  it('discards saves from an older version of the app', () => {
    const old = seed.map((x) => {
      const { extract, ...docs } = x.docs;
      return { ...x, docs: { ...docs, background: extract === 'ready' ? 'verified' : extract } };
    });
    // Previous version: no version field and the old document key.
    expect(restore(JSON.stringify({ savedAt: NOW, apps: old }), NOW)).toBeNull();
    // Same version number but an unknown reason code from an older model.
    const badReason = seed.map((x) => (x.decision?.type === 'rejected' ? { ...x, decision: { ...x.decision, reason: 'background_failed' } } : x));
    expect(restore(JSON.stringify({ version: 8, savedAt: NOW, apps: badReason, gigs, threads, jobs }), NOW)).toBeNull();
    // Version 2 (no jobs) is discarded too.
    expect(restore(JSON.stringify({ version: 2, savedAt: NOW, apps: seed }), NOW)).toBeNull();
  });
  it('ignores missing or broken data', () => {
    expect(restore(null, NOW)).toBeNull();
    expect(restore('{not json', NOW)).toBeNull();
    expect(restore('{"apps":5}', NOW)).toBeNull();
  });
  it('shiftApplicant leaves non-time fields alone', () => {
    const a = seed[0];
    const b = shiftApplicant(a, DAY);
    expect(b.name).toBe(a.name);
    expect(b.registeredAt - a.registeredAt).toBe(DAY);
  });
});
