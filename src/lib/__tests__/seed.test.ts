import { confirmSecondReview } from '../actions';
import { describe, expect, it } from 'vitest';
import { generateSeed } from '../seed';
import { deriveStage } from '../stage';
import { computeFunnel, computeKpis } from '../kpis';
import { evaluate, validateDecision } from '../criteria';
import { slaStatus } from '../sla';
import { activationBucket } from '../activation';
import { isNoResponse } from '../nudges';
import { NOW } from './helpers';

const seed = generateSeed(NOW);
const byName = (n: string) => seed.find((a) => a.name === n)!;

describe('seed composition', () => {
  it('44 applicants in the right stages', () => {
    const counts: Record<string, number> = {};
    for (const a of seed) counts[deriveStage(a)] = (counts[deriveStage(a)] ?? 0) + 1;
    expect(seed).toHaveLength(44);
    expect(counts).toEqual({ review: 9, registered: 14, accepted: 6, active: 10, rejected: 4, closed: 1 });
  });
  it('is deterministic for a given now, with unique ids', () => {
    expect(generateSeed(NOW)).toEqual(seed);
    expect(new Set(seed.map((a) => a.id)).size).toBe(44);
  });
  it('no timestamp lies in the future except the booked gig', () => {
    for (const a of seed) {
      for (const e of a.log) expect(e.at).toBeLessThanOrEqual(NOW);
      expect(a.registeredAt).toBeLessThan(NOW);
    }
  });
});

describe('seed tells the baseline story', () => {
  const kpis = Object.fromEntries(computeKpis(seed, NOW).map((k) => [k.key, k]));
  it('document completion ≈ 70% (off track vs 85%)', () => {
    expect(kpis.docCompletion.value).toBeGreaterThan(65);
    expect(kpis.docCompletion.value).toBeLessThan(75);
  });
  it('application → active ≈ 21%', () => {
    expect(kpis.appToActive.value).toBeGreaterThan(18);
    expect(kpis.appToActive.value).toBeLessThan(25);
  });
  it('time to decision is well over 48 h', () => {
    expect(kpis.timeToDecision.value).toBeGreaterThan(60);
  });
  it('activation gap is visible and quality is below the guardrail', () => {
    expect(kpis.activation.value).toBeLessThan(75);
    expect(kpis.quality.value).toBe(90);
  });
  it('the biggest funnel drop-off is registration → documents', () => {
    expect(computeFunnel(seed).edges.some(e => e.biggestDrop)).toBe(false);
  });
});

describe('the 8 review cases behave as described', () => {
  const sla = (n: string) => slaStatus(byName(n).docsCompleteAt!, NOW).bucket;
  const approve = (n: string) => ({ ...byName(n), onboardingCompletedAt: NOW, photoApproved: true, extractShown: true });

  it('Elin: clean accept once the photo is ticked (the extract is shown before the first drive)', () => {
    expect(evaluate(byName('Elin Johansson')).acceptBlockedBy).toHaveLength(1); // photo not ticked yet
    expect(validateDecision(approve('Elin Johansson'), { type: 'accepted' }, NOW)).toBeNull();
    expect(sla('Elin Johansson')).toBe('ok');
  });
  it('Ahmed: simple drives first', () => {
    expect(evaluate(byName('Ahmed Hassan')).acceptType).toBe('accepted_simple');
  });
  it('Sara: a suitability rejection needs a second reviewer', () => {
    const r = { type: 'rejected' as const, reason: 'requirements_not_met' as const };
    expect(validateDecision(approve('Sara Lindqvist'), r, NOW)).toMatch(/second reviewer/);
    expect(validateDecision(confirmSecondReview(approve('Sara Lindqvist'), 'requirements_not_met', 'Sofia', NOW), { ...r, secondReviewer: 'Sofia' }, NOW)).toBeNull();
    expect(validateDecision(approve('Sara Lindqvist'), { type: 'accepted' }, NOW)).toBeNull();
  });
  it('Johan: accept + flag activation, SLA amber', () => {
    expect(evaluate(byName('Johan Berg')).acceptType).toBe('accepted_flagged');
    expect(sla('Johan Berg')).toBe('warn');
  });
  it('Maja: ID not verified with BankID blocks accept, reason suggested', () => {
    const ev = evaluate(approve('Maja Karlsson'));
    expect(ev.acceptBlockedBy.length).toBeGreaterThan(0);
    expect(ev.suggestedReject).toBe('id_unverified');
  });
  it('Oskar: photo has a remark', () => {
    expect(byName('Oskar Nilsson').docs.photo).toBe('remark');
    expect(evaluate(byName('Oskar Nilsson')).mustHaves[3].result).toBe('manual');
  });
  it('Fatima and Erik are overdue', () => {
    expect(sla('Fatima Ali')).toBe('overdue');
    expect(sla('Erik Svensson')).toBe('overdue');
  });
  it('Erik: licence too new', () => {
    expect(evaluate(byName('Erik Svensson')).suggestedReject).toBe('no_valid_licence');
  });
});

describe('missing documents and activation lists', () => {
  it('2–3 incomplete files have had no response for 14 days', () => {
    const n = seed.filter((a) => isNoResponse(a, NOW)).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(3);
  });
  it('the extract is on its way for about half of the incomplete files', () => {
    const missing = seed.filter((a) => deriveStage(a) === 'registered');
    const pending = missing.filter((a) => a.docs.extract === 'pending').length;
    expect(pending).toBeGreaterThanOrEqual(6);
    expect(pending).toBeLessThanOrEqual(9);
  });
  it('awaiting first gig covers all four activation colours, one booked for tomorrow', () => {
    const waiting = seed.filter((a) => deriveStage(a) === 'accepted');
    const buckets = new Set(waiting.map((a) => activationBucket(a.decision!.at, NOW)));
    expect(buckets).toEqual(new Set(['on_track', 'book', 'call', 'dormant']));
    expect(waiting.filter((a) => a.firstGig?.bookedFor && a.firstGig.bookedFor > NOW)).toHaveLength(1);
    expect(waiting.some((a) => a.decision!.type === 'accepted_simple')).toBe(true);
    expect(waiting.some((a) => a.decision!.type === 'accepted_flagged')).toBe(true);
  });
});
