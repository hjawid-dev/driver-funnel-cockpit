import { describe, expect, it } from 'vitest';
import { distanceScore, firstGigOffers, generateGigs, isEasy, isWeekendOrEvening } from '../gigs';
import { callSlots } from '../booking';
import { automationEvents, driverInbox, summarize } from '../automation';
import { availabilityFrom, bookCall, bookOffer, canMoveCall, canRetake, changePrequal, createApplicant, driverStep, progress, remindWhenQualified, retakeDocument, reviewableSteps } from '../driverFlow';
import { completeOnboarding, applyDecision, receiveDocument, setExtractShown, setPhotoApproved } from '../actions';
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
  it('the applicant can change a wrong answer and carry on; the change is logged', () => {
    const a = changePrequal(apply({ licenceYears: 0.5 }), { licenceYears: 3, meetsMinAge: true }, NOW + MIN);
    expect(a.prequalIssue).toBeUndefined();
    expect(driverStep(a)).toBe('extract');
    expect(a.log.at(-1)?.text).toContain('requirements now met');
    expect(changePrequal(apply({ licenceYears: 0.5 }), { licenceYears: 0.5, meetsMinAge: true }, NOW).prequalIssue).toBe('licence');
  });
  it('"remind me when I qualify" is logged once and decides nothing', () => {
    const a = remindWhenQualified(remindWhenQualified(apply({ licenceYears: 0.5 }), NOW), NOW + MIN);
    expect(a.remindWhenQualifiedAt).toBe(NOW);
    expect(a.decision).toBeUndefined();
  });
  it('availability: weekday daytime is full; anything else is limited with a note', () => {
    expect(availabilityFrom(['weekday_day', 'weekend'])).toMatchObject({ availability: 'full' });
    expect(availabilityFrom(['weekend', 'weekday_evening'])).toMatchObject({ availability: 'limited', availabilityNote: 'Weekday evenings and weekends' });
    expect(availabilityFrom(['weekend'])).toMatchObject({ availability: 'limited', availabilityNote: 'Weekends' });
  });
  it('a person can close a pre-qualify issue without waiting 14 days', () => {
    const r = applyDecision(apply({ licenceYears: 0.5 }), { type: 'rejected', reason: 'no_valid_licence' }, NOW);
    expect(r.ok).toBe(true);
  });
});

describe('going back during the application', () => {
  const upTo = (n: number) => {
    let a = apply();
    const steps: [Parameters<typeof receiveDocument>[1], Parameters<typeof receiveDocument>[2]][] = [['extract', 'ready'], ['id', 'verified'], ['licence', 'verified'], ['photo', 'uploaded']];
    for (const [k, st] of steps.slice(0, n)) a = receiveDocument(a, k, st, NOW);
    return a;
  };
  it('shows the answers and every step before the current one', () => {
    expect(reviewableSteps(upTo(0))).toEqual(['answers']);
    expect(reviewableSteps(upTo(3))).toEqual(['answers', 'extract', 'id', 'licence']);
  });
  it('a photo can be retaken before the file is complete, which takes the applicant back to that step', () => {
    const a = upTo(3);
    expect(canRetake(a, 'licence')).toBe(true);
    const b = retakeDocument(a, 'licence', NOW + MIN);
    expect(driverStep(b)).toBe('licence');
    expect(b.docs.photo).toBe('missing');
    expect(b.log.at(-1)?.text).toContain('retaking the licence photo');
  });
  it('nothing can be retaken once the file is complete', () => {
    const done = upTo(4);
    expect(done.docsCompleteAt).toBeDefined();
    expect(canRetake(done, 'photo')).toBe(false);
    expect(retakeDocument(done, 'photo', NOW)).toBe(done);
  });
  it('a call can be moved until two hours before', () => {
    const a = bookCall(upTo(4), NOW + 3 * HOUR, NOW);
    expect(canMoveCall(a, NOW)).toBe(true);
    expect(canMoveCall(a, NOW + 2 * HOUR)).toBe(false);
  });
});

describe('driverStep walks the whole flow', () => {
  it('id → licence → photo → extract → call → decision → first gig → active', () => {
    let a = apply();
    const steps: string[] = [driverStep(a)];
    a = receiveDocument(a, 'extract', 'pending', NOW); steps.push(driverStep(a));
    a = receiveDocument(a, 'id', 'verified', NOW); steps.push(driverStep(a));
    a = receiveDocument(a, 'licence', 'verified', NOW); steps.push(driverStep(a));
    a = receiveDocument(a, 'photo', 'uploaded', NOW); steps.push(driverStep(a));
    expect(a.docsCompleteAt).toBe(NOW);
    a = bookCall(a, NOW + 20 * HOUR, NOW);
    steps.push(driverStep(a));
    a = receiveDocument(a, 'extract', 'ready', NOW + 10 * HOUR);
    a = setExtractShown(setPhotoApproved(a, true, NOW), true, NOW);
    a = completeOnboarding(a, NOW + 20 * HOUR);
    const r = applyDecision(a, { type: 'accepted' }, NOW + 20 * HOUR);
    if (!r.ok) throw new Error(r.error);
    a = r.applicant;
    steps.push(driverStep(a));
    const offer = firstGigOffers(a, gigs, seed, NOW + 20 * HOUR)[0];
    a = bookOffer(a, offer, NOW + 21 * HOUR);
    steps.push(driverStep(a));
    expect(steps).toEqual(['extract', 'id', 'licence', 'photo', 'call', 'decision', 'first_gig', 'booked']);
    expect(progress('extract')).toBe(0);
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
    const a = mk({ registeredAt: NOW, docsCompleteAt: NOW });
    const kinds = automationEvents([a], NOW, NOW + 3 * DAY).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['sla_24', 'sla_overdue']));
  });
  it('a rejection tells the driver the reason and the right to a review', () => {
    const a = mk({ docsCompleteAt: NOW - DAY, decision: { type: 'rejected', reason: 'requirements_not_met', at: NOW, by: 'x' } });
    const msg = driverInbox(a, NOW + HOUR).find((e) => e.kind === 'decision')!;
    expect(msg.body).toContain('Suitability requirements not met');
    expect(msg.body).toContain('review');
  });
  it('acceptance offers self-booking; ready drivers receive later tasks if no first gig', () => {
    const a = mk({ extractShown: true, photoApproved: true, docsCompleteAt: NOW - DAY, decision: { type: 'accepted', at: NOW, by: 'x' } });
    const kinds = automationEvents([a], NOW - 1, NOW + 31 * DAY).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['offers', 'book_task', 'call_task', 'dormant']));
  });
  it('the 14-day close is a task for a person, never an automatic rejection', () => {
    const a = apply();
    const close = automationEvents([a], NOW, NOW + 15 * DAY).find((e) => e.kind === 'close_task');
    expect(close?.audience).toBe('ops');
    expect(a.decision).toBeUndefined();
  });
  it('the first-gig reminder stays in the inbox after the drive is done', () => {
    const at = NOW - 3 * DAY;
    const a = mk({ docsCompleteAt: at - DAY, decision: { type: 'accepted', at, by: 'x' }, firstGig: { gigId: 'JOB-1', bookedFor: NOW - DAY, doneAt: NOW - DAY + 2 * HOUR, onTime: true, ok: true } });
    expect(driverInbox(a, NOW).map((e) => e.kind)).toEqual(expect.arrayContaining(['gig_reminder', 'activated']));
  });
  it('summarize counts what ran', () => {
    const a = apply();
    expect(summarize(automationEvents([a], NOW, NOW + DAY + HOUR))).toBe('2 nudges · 1 SLA alert');
    expect(summarize([])).toBe('Nothing was due in this window');
  });
});

describe('validateDecision still guards the new flow', () => {
  it('a self-registered applicant without a pre-qualify issue cannot be rejected before review', () => {
    expect(validateDecision(apply(), { type: 'rejected', reason: 'other', note: 'x' }, NOW)).toMatch(/under review/);
  });
});
