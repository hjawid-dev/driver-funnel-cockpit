import { describe, expect, it } from 'vitest';
import { distanceScore, firstGigOffers, generateGigs, isEasy, isWeekendOrEvening } from '../gigs';
import { callSlots } from '../booking';
import { automationEvents, driverInbox, summarize } from '../automation';
import { bookCall, bookOffer, createApplicant, driverStep, progress } from '../driverFlow';
import { applyDecision, receiveDocument, setExtractShown, setPhotoApproved } from '../actions';
import { validateDecision } from '../criteria';
import { deriveStage } from '../stage';
import { generateSeed } from '../seed';
import { DAY, HOUR, MIN } from '../time';
import { NOW, mk } from './helpers';

const seed = generateSeed(NOW);
const gigs = generateGigs(NOW);
const apply = (over: Partial<Parameters<typeof createApplicant>[0]> = {}) =>
  createApplicant({ name: 'Nova Lind', area: 'Solna', licenceYears: 6, meetsMinAge: true, availability: 'full', ...over }, seed, NOW);

describe('createApplicant', () => {
  it('creates a self-registered applicant with the next free id', () => {
    const a = apply();
    expect(a.source).toBe('self');
    expect(Number(a.id.slice(4))).toBeGreaterThan(Math.max(...seed.map((x) => Number(x.id.slice(4)))));
    expect(deriveStage(a)).toBe('registered');
    expect(a.prequalIssue).toBeUndefined();
  });
  it('flags, but never rejects, an unmet requirement', () => {
    const young = apply({ meetsMinAge: false });
    expect(young.prequalIssue).toBe('age');
    expect(young.decision).toBeUndefined();
    expect(driverStep(young)).toBe('prequal_review');
    expect(apply({ licenceYears: 0.5 }).prequalIssue).toBe('licence');
  });
  it('a person can close a pre-qualify issue without waiting 14 days', () => {
    const r = applyDecision(apply({ licenceYears: 0.5 }), { type: 'rejected', reason: 'no_valid_licence' }, NOW);
    expect(r.ok).toBe(true);
  });
});

describe('driverStep walks the whole flow', () => {
  it('id → licence → photo → extract → call → decision → first gig → active', () => {
    let a = apply();
    const steps: string[] = [driverStep(a)];
    a = receiveDocument(a, 'id', 'verified', NOW);
    steps.push(driverStep(a));
    a = receiveDocument(a, 'licence', 'verified', NOW);
    steps.push(driverStep(a));
    a = receiveDocument(a, 'photo', 'uploaded', NOW);
    steps.push(driverStep(a));
    a = receiveDocument(a, 'extract', 'pending', NOW);
    steps.push(driverStep(a));
    a = receiveDocument(a, 'extract', 'ready', NOW);
    expect(a.docsCompleteAt).toBe(NOW); // complete file is auto-queued for review
    steps.push(driverStep(a));
    a = bookCall(a, NOW + 20 * HOUR, NOW);
    steps.push(driverStep(a));
    a = setExtractShown(setPhotoApproved(a, true, NOW), true, NOW);
    const r = applyDecision(a, { type: 'accepted' }, NOW + 20 * HOUR);
    if (!r.ok) throw new Error(r.error);
    a = r.applicant;
    steps.push(driverStep(a));
    const offer = firstGigOffers(a, gigs, seed, NOW + 20 * HOUR)[0];
    a = bookOffer(a, offer, NOW + 21 * HOUR);
    steps.push(driverStep(a));
    expect(steps).toEqual(['id', 'licence', 'photo', 'extract', 'extract', 'call', 'decision', 'first_gig', 'booked']);
    expect(progress('id')).toBe(0);
    expect(progress('booked')).toBeGreaterThan(progress('first_gig'));
  });
});

describe('first-gig offers', () => {
  it('only easy jobs, nearest first, at most three', () => {
    const a = { ...apply(), decision: { type: 'accepted' as const, at: NOW, by: 'x' } };
    const offers = firstGigOffers(a, gigs, seed, NOW);
    expect(offers.length).toBe(3);
    expect(offers.every(isEasy)).toBe(true);
    expect(distanceScore(a.area, offers[0].area)).toBeLessThanOrEqual(distanceScore(a.area, offers[2].area));
  });
  it('limited availability gets weekend or evening jobs only', () => {
    const a = { ...apply({ availability: 'limited' }), decision: { type: 'accepted_flagged' as const, at: NOW, by: 'x' } };
    expect(firstGigOffers(a, gigs, seed, NOW).every((g) => isWeekendOrEvening(g.at))).toBe(true);
  });
  it('a job taken by another driver is not offered again', () => {
    const a = { ...apply(), decision: { type: 'accepted' as const, at: NOW, by: 'x' } };
    const first = firstGigOffers(a, gigs, seed, NOW)[0];
    const other = { ...mk({ id: 'DRV-9999' }), firstGig: { gigId: first.id } };
    expect(firstGigOffers(a, gigs, [...seed, other], NOW).map((g) => g.id)).not.toContain(first.id);
  });
  it('no jobs starting within 12 hours', () => {
    const a = { ...apply(), decision: { type: 'accepted' as const, at: NOW, by: 'x' } };
    expect(firstGigOffers(a, gigs, seed, NOW).every((g) => g.at >= NOW + 12 * HOUR)).toBe(true);
  });
});

describe('callSlots', () => {
  it('15-minute calls in the 09:00 and 14:00 slots, at least 30 min ahead, skipping booked ones', () => {
    const slots = callSlots(NOW, seed);
    expect(slots.length).toBe(8);
    for (const t of slots) {
      expect(t).toBeGreaterThan(NOW + 30 * MIN);
      expect([9, 14]).toContain(new Date(t).getHours());
      expect(new Date(t).getMinutes() % 15).toBe(0);
    }
    const taken = { ...mk({ id: 'DRV-9998' }), callAt: slots[0] };
    expect(callSlots(NOW, [...seed, taken])).not.toContain(slots[0]);
  });
});

describe('automationEvents', () => {
  it('sends the 2/24/72 h reminders to an incomplete applicant, and mirrors them for ops', () => {
    const a = apply();
    const ev = automationEvents([a], NOW, NOW + 4 * DAY);
    expect(ev.filter((e) => e.kind === 'nudge' && e.audience === 'driver')).toHaveLength(3);
    expect(ev.filter((e) => e.kind === 'nudge' && e.audience === 'ops')).toHaveLength(3);
  });
  it('stops reminders once the file is complete', () => {
    let a = apply();
    for (const k of ['id', 'licence', 'photo'] as const) a = receiveDocument(a, k, k === 'photo' ? 'uploaded' : 'verified', NOW + HOUR);
    a = receiveDocument(a, 'extract', 'ready', NOW + HOUR);
    expect(automationEvents([a], NOW, NOW + 4 * DAY).filter((e) => e.kind === 'nudge')).toHaveLength(0);
  });
  it('raises SLA alerts at 24 h and 48 h without a decision', () => {
    const a = mk({ docsCompleteAt: NOW });
    const kinds = automationEvents([a], NOW, NOW + 3 * DAY).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['sla_24', 'sla_overdue']));
  });
  it('a rejection tells the driver the reason and the right to a review', () => {
    const a = mk({ docsCompleteAt: NOW - DAY, decision: { type: 'rejected', reason: 'requirements_not_met', at: NOW, by: 'x' } });
    const msg = driverInbox(a, NOW + HOUR).find((e) => e.kind === 'decision')!;
    expect(msg.body).toContain('Suitability requirements not met');
    expect(msg.body).toContain('review');
  });
  it('acceptance creates a welcome-call task and offers; later tasks if no first gig', () => {
    const a = mk({ docsCompleteAt: NOW - DAY, decision: { type: 'accepted', at: NOW, by: 'x' } });
    const kinds = automationEvents([a], NOW - 1, NOW + 31 * DAY).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['welcome_task', 'offers', 'book_task', 'call_task', 'dormant']));
  });
  it('the 14-day close is a task for a person, never an automatic rejection', () => {
    const a = apply();
    const close = automationEvents([a], NOW, NOW + 15 * DAY).find((e) => e.kind === 'close_task');
    expect(close?.audience).toBe('ops');
    expect(a.decision).toBeUndefined();
  });
  it('summarize counts what ran', () => {
    const a = apply();
    expect(summarize(automationEvents([a], NOW, NOW + DAY + HOUR))).toBe('2 nudges');
    expect(summarize([])).toBe('Nothing was due in this window');
  });
});

describe('validateDecision still guards the new flow', () => {
  it('a self-registered applicant without a pre-qualify issue cannot be rejected before review', () => {
    expect(validateDecision(apply(), { type: 'rejected', reason: 'other', note: 'x' }, NOW)).toMatch(/under review/);
  });
});
