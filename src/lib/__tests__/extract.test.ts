import { describe, expect, it } from 'vitest';
import type { Applicant } from '../types';
import { DAY, HOUR } from '../time';
import { mk, NOW } from './helpers';
import { generateSeed } from '../seed';
import { generateGigs, firstGigOffers } from '../gigs';
import { createApplicant, bookCall, bookOffer, driverStep } from '../driverFlow';
import { applyDecision, bookFirstGig, completeFirstGig, receiveDocument, setActivationReason, setPhotoApproved } from '../actions';
import { bookExtractCheck, extractState, markExtractShown, needsExtract, OFFER_LEAD_MS, releaseDue, releaseIfUnchecked, showBy } from '../extract';
import { callSlots } from '../booking';
import { activationReason, activationReasons, supplyDemand, JOBS_PER_DRIVER_14D } from '../activation';
import { automationEvents } from '../automation';
import { syncFirstDrive } from '../liveOps';
import { deriveStage } from '../stage';
import { computeKpis } from '../kpis';
import { todayItems, isExtractCheck } from '../today';
import { weeklyFacts } from '../report/facts';
import { actionOptions, applyChatAction } from '../chat/selfService';

const gigs = generateGigs(NOW);
const seed = generateSeed(NOW);

/** A new applicant who orders the extract, books the next call and is accepted in it. */
function acceptedWithExtractOrdered(): Applicant {
  let a = createApplicant({ name: 'Nya Förare', area: 'Solna', licenceYears: 5, meetsMinAge: true, availability: 'full' }, seed, NOW);
  a = receiveDocument(a, 'id', 'verified', NOW);
  a = receiveDocument(a, 'licence', 'verified', NOW);
  a = receiveDocument(a, 'photo', 'uploaded', NOW);
  a = receiveDocument(a, 'extract', 'pending', NOW);
  const call = callSlots(NOW, seed)[0];
  a = setPhotoApproved(bookCall(a, call, NOW), true, call);
  const r = applyDecision(a, { type: 'accepted' }, call);
  if (!r.ok) throw new Error(r.error);
  return r.applicant;
}

describe('decided within 48 hours, the extract before the first drive', () => {
  it('an ordered extract completes the file, so the decision can come within 48 h of registering', () => {
    const a = acceptedWithExtractOrdered();
    expect(a.docsCompleteAt).toBe(NOW);
    expect(deriveStage(a)).toBe('accepted');
    expect(a.decision!.at - a.registeredAt).toBeLessThanOrEqual(48 * HOUR);
    expect(a.log.at(-1)!.text).toMatch(/extract to show before the first drive/);
    expect(needsExtract(a)).toBe(true);
    expect(extractState(a)).toBe('ordered');
  });

  it('until the extract is shown, first drives start at least 5 days ahead; after, from 12 hours', () => {
    const a = acceptedWithExtractOrdered();
    const t = a.decision!.at;
    const offers = firstGigOffers(a, gigs, seed, t);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((g) => g.at >= t + OFFER_LEAD_MS)).toBe(true);
    const shown = markExtractShown(receiveDocument(a, 'extract', 'ready', t), true, t);
    expect(firstGigOffers(shown, gigs, seed, t).some((g) => g.at < t + OFFER_LEAD_MS)).toBe(true);
  });

  it('the 5-minute check is booked once the extract has arrived, in the same slots as the calls', () => {
    const a = acceptedWithExtractOrdered();
    const t = a.decision!.at;
    expect(bookExtractCheck(a, t + DAY, t).ok).toBe(false); // not arrived yet
    const arrived = receiveDocument(a, 'extract', 'ready', t);
    const slot = callSlots(t, seed)[0];
    const r = bookExtractCheck(arrived, slot, t);
    expect(r.ok && extractState(r.applicant)).toBe('check_booked');
    if (!r.ok) return;
    // Someone else can't book that time for their call.
    expect(callSlots(t, [r.applicant])).not.toContain(slot);
    // Shown: only the fact and the time are kept.
    const shown = markExtractShown(r.applicant, true, slot);
    expect(shown.extractShown).toBe(true);
    expect(shown.extractShownAt).toBe(slot);
    expect(shown.log.at(-1)!.text).toBe('Extract shown in the extract check, seen by Hjalmar (nothing stored)');
    expect(needsExtract(shown)).toBe(false);
  });

  it('no first drive without the extract: completing it and booking it too soon are refused, and say why', () => {
    const a = acceptedWithExtractOrdered();
    const t = a.decision!.at;
    const done = completeFirstGig(a, { onTime: true, ok: true }, t);
    expect(done).toEqual({ ok: false, error: 'The extract must be shown before the first drive.' });
    const soon = bookFirstGig(a, t + 20 * HOUR, t);
    expect(soon.ok).toBe(false);
    expect(bookFirstGig(a, t + 3 * DAY, t).ok).toBe(true);
  });

  it('a booked drive whose extract was not shown by the day before is released, and the job leaves Live ops', () => {
    const a = acceptedWithExtractOrdered();
    const t = a.decision!.at;
    const gig = firstGigOffers(a, gigs, seed, t)[0];
    const booked = bookOffer(a, gig, t);
    const by = showBy(booked)!;
    expect(by).toBe(gig.at - DAY);
    expect(releaseIfUnchecked(booked, by - 1)).toBeNull();
    const released = releaseIfUnchecked(booked, by)!;
    expect(released.firstGig).toEqual({ released: { at: by, bookedFor: gig.at } });
    expect(deriveStage(released)).toBe('accepted');
    expect(driverStep(released)).toBe('first_gig');
    // The job for the booked drive goes back.
    const jobs = syncFirstDrive([], booked, gigs);
    expect(jobs).toHaveLength(1);
    expect(syncFirstDrive(jobs, released, gigs)).toEqual([]);
    // Shown in time: nothing is released.
    expect(releaseIfUnchecked(markExtractShown(receiveDocument(booked, 'extract', 'ready', t), true, t), by)).toBeNull();
    expect(releaseDue([booked, released], by)).toHaveLength(1);
  });

  it('the driver hears the condition with the decision, a reminder the day before the deadline, and the release', () => {
    const a = acceptedWithExtractOrdered();
    const t = a.decision!.at;
    const gig = firstGigOffers(a, gigs, seed, t)[0];
    const booked = bookOffer(a, gig, t);
    const by = showBy(booked)!;
    const events = automationEvents([releaseIfUnchecked(booked, by)!], t - 1, by + HOUR);
    const kinds = (k: string) => events.filter((e) => e.kind === k);
    expect(kinds('decision').find((e) => e.audience === 'driver')!.body).toMatch(/show us your criminal-record extract/);
    expect(kinds('extract_due').map((e) => e.at)).toEqual([by - DAY, by - DAY]);
    expect(kinds('released').map((e) => e.audience).sort()).toEqual(['driver', 'ops']);
  });

  it('the chat offers the same steps: arrived, then check times, before the drive', () => {
    const a = acceptedWithExtractOrdered();
    const t = a.decision!.at;
    const ids = (x: Applicant) => actionOptions(x, seed, gigs, t).map((o) => o.id);
    expect(ids(a)).toContain('ARRIVED');
    const r = applyChatAction(a, { type: 'extract_arrived' }, seed, gigs, t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const checks = actionOptions(r.applicant, seed, gigs, t).filter((o) => o.action.type === 'book_check');
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.length).toBeLessThanOrEqual(6);
    const booked = applyChatAction(r.applicant, checks[0].action, seed, gigs, t);
    expect(booked.ok && extractState(booked.applicant)).toBe('check_booked');
  });
});

describe('the demo data shows both processes', () => {
  const byName = (n: string) => seed.find((a) => a.name === n)!;
  it('Hugo is in review with his extract only ordered, and nothing blocks his decision but the photo tick', () => {
    const h = byName('Hugo Larsson');
    expect(deriveStage(h)).toBe('review');
    expect(h.docs.extract).toBe('pending');
  });
  it('Viktor was accepted within 48 hours with the extract on its way; Mohammed has a check booked', () => {
    const v = byName('Viktor Engström');
    expect(v.decision!.at - v.registeredAt).toBeLessThanOrEqual(48 * HOUR);
    expect(extractState(v)).toBe('ordered');
    expect(extractState(byName('Mohammed Yusuf'))).toBe('check_booked');
  });
  it('time to decision still starts from the old baseline of several days', () => {
    const k = computeKpis(seed, NOW).find((x) => x.key === 'timeToDecision')!;
    expect(k.value!).toBeGreaterThan(72);
  });
});

describe('why an accepted driver has not driven yet', () => {
  const waiting = seed.filter((a) => deriveStage(a) === 'accepted');
  it('every waiting driver is in exactly one group, so the groups add up to the list', () => {
    const groups = activationReasons(waiting, seed, gigs, NOW);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(waiting.length);
    expect(new Set(groups.flatMap((g) => g.ids)).size).toBe(waiting.length);
    for (const g of groups) expect(g.ids.length).toBe(g.count);
  });
  it('the demo shows a demand gap, a missing extract, a booked drive and a driver nobody can reach', () => {
    const r = (n: string) => activationReason(seed.find((a) => a.name === n)!, seed, gigs, NOW);
    expect(r('Anton Wallin')).toBe('no_fit'); // lives where we have no jobs
    expect(r('Viktor Engström')).toBe('extract');
    expect(r('Mohammed Yusuf')).toBe('extract');
    expect(r('Klara Forsberg')).toBe('booked');
    expect(r('Lova Hedlund')).toBe('unreachable');
  });
  it('what ops learned on a call wins, and clearing it lets the data speak again', () => {
    const k = seed.find((a) => a.name === 'Klara Forsberg')!;
    const set = setActivationReason(k, 'declined', NOW);
    expect(set.ok && activationReason(set.applicant, seed, gigs, NOW)).toBe('declined');
    if (!set.ok) return;
    const cleared = setActivationReason(set.applicant, null, NOW);
    expect(cleared.ok && activationReason(cleared.applicant, seed, gigs, NOW)).toBe('booked');
    expect(setActivationReason(mk(), 'declined', NOW).ok).toBe(false); // only accepted drivers
  });
  it('a booked drive with the extract still to show counts as the extract, not as booked', () => {
    const a = acceptedWithExtractOrdered();
    const g = firstGigOffers(a, gigs, seed, a.decision!.at)[0];
    expect(activationReason(bookOffer(a, g, a.decision!.at), seed, gigs, a.decision!.at)).toBe('extract');
  });
});

describe('supply and demand', () => {
  it('open jobs in the next 14 days against active and waiting drivers', () => {
    const s = supplyDemand(seed, gigs, NOW);
    expect(s.openJobs).toBe(gigs.filter((g) => g.at > NOW && g.at <= NOW + 14 * DAY).length);
    expect(s.driversNeeded).toBe(Math.ceil(s.openJobs / JOBS_PER_DRIVER_14D));
    expect(s.active).toBe(seed.filter((a) => deriveStage(a) === 'active').length);
    expect(s.waiting).toBe(seed.filter((a) => deriveStage(a) === 'accepted').length);
    expect(s.oversupplied).toBe(s.active + s.waiting > s.driversNeeded);
  });
  it('the weekly report gets the same numbers', () => {
    const f = Object.fromEntries(weeklyFacts(seed, [], NOW, [], gigs).facts.map((x) => [x.id, x.value]));
    const s = supplyDemand(seed, gigs, NOW);
    expect(f.open_jobs_14d).toBe(s.openJobs);
    expect(f.drivers_for_open_jobs).toBe(s.driversNeeded);
    expect(f.drivers_active_and_waiting).toBe(s.active + s.waiting);
    const groups = activationReasons(seed.filter((a) => deriveStage(a) === 'accepted'), seed, gigs, NOW);
    expect(f.awaiting_no_fit).toBe(groups.find((g) => g.reason === 'no_fit')?.count ?? 0);
    expect(f.awaiting_extract).toBe(groups.find((g) => g.reason === 'extract')?.count ?? 0);
  });
});

describe('Today', () => {
  it('the extract-check row counts exactly the drivers its list shows', () => {
    const item = todayItems(seed, [], NOW).find((i) => i.key === 'extract')!;
    expect(item.ids).toEqual(seed.filter((a) => isExtractCheck(a, NOW)).map((a) => a.id));
    expect(item.count).toBe(1);
    expect(item.tab).toBe('awaiting');
  });
});

describe('a check that did not happen', () => {
  it('counts as missed two hours after its time, leaves Today, and the driver books again', () => {
    const m = seed.find((a) => a.name === 'Mohammed Yusuf')!;
    const at = m.extractCheckAt!;
    expect(extractState(m, at + HOUR)).toBe('check_booked');
    expect(isExtractCheck(m, at + HOUR)).toBe(true);
    expect(extractState(m, at + 3 * HOUR)).toBe('ready');
    expect(isExtractCheck(m, at + 3 * HOUR)).toBe(false);
    const r = bookExtractCheck(m, at + DAY, at + 3 * HOUR);
    expect(r.ok && extractState(r.applicant, at + 3 * HOUR)).toBe('check_booked');
  });
});
