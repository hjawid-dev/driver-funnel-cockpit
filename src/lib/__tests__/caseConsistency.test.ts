import { describe, expect, it } from 'vitest';
import { inReview, mk, NOW } from './helpers';
import { DAY, HOUR, MIN } from '../time';
import { applyDecision, bookFirstGig, completeFirstGig, confirmSecondReview, receiveDocument, requestNewPhoto } from '../actions';
import { canStartDrive } from '../eligibility';
import { computeFunnel, computeKpis, reachedDocs } from '../kpis';
import { workItems } from '../workQueue';
import { firstGigOffers, generateGigs } from '../gigs';
import { driverStep } from '../driverFlow';
import { generateSeed } from '../seed';
import { agreeDeliveryDeadline, bookReplacement, checkIn, gotKeys, closeIncident, confirmByPhone, depart, firstDriveResult, incidentClock, pickupChecks, pickupReadinessErrors, replacementJob, seedJobs, setOutcome, tellAccountOwner } from '../liveOps';
import { liveOpsEvents, automationEvents, materializeAutomation } from '../automation';
import { opsState } from '../opsState';
import { weeklyFacts } from '../report/facts';
import { nudgeMessage } from '../nudges';

const accepted = () => inReview({ decision: { type: 'accepted', by: 'Hjalmar', at: NOW - DAY } });
const job = () => seedJobs(generateSeed(NOW), NOW, { asInCase: true })[1];
const metric = (apps: ReturnType<typeof mk>[], key: string) => computeKpis(apps, NOW).find(k => k.key === key)!;

describe('case-consistent funnel and controls', () => {
  it('uses registration for the queue deadline even when the documents just arrived', () => {
    const a = inReview({ registeredAt: NOW - 7 * DAY, docsCompleteAt: NOW - HOUR });
    expect(workItems([a], [], NOW)[0]).toMatchObject({ tone: 'bad' });
  });
  it('keeps first submission and historical weekly flow across a requested photo', () => {
    const a = inReview({ registeredAt: NOW - 10 * DAY, docsCompleteAt: NOW - 4 * DAY });
    const before = weeklyFacts([a], [], NOW).facts.find(f => f.id === 'files_completed')!.value;
    const result = requestNewPhoto(a, NOW);
    if (!result.ok) throw Error(result.error);
    expect(reachedDocs(result.applicant)).toBe(true);
    const again = receiveDocument(result.applicant, 'photo', 'uploaded', NOW);
    expect(again.firstDocsSubmittedAt).toBe(a.docsCompleteAt);
    expect(weeklyFacts([again], [], NOW).facts.find(f => f.id === 'files_completed')!.value).toBe(before);
  });
  it('does not invent submitted documents after a prequalifying rejection', () => {
    const r = applyDecision(mk({ prequalIssue: 'licence', licenceYears: .5 }), { type: 'rejected', reason: 'no_valid_licence' }, NOW);
    if (!r.ok) throw Error(r.error);
    const f = computeFunnel([r.applicant]);
    expect(f.tiles.map(t => t.reached)).toEqual([1, 0, 0, 0, 0]);
    expect(f.tiles[0].parts.reduce((n,p) => n+p.count, 0)).toBe(1);
  });
  it('preserves initial acceptance and funnel arithmetic after a later pre-drive rejection', () => {
    const a = confirmSecondReview(accepted(), 'requirements_not_met', 'Sofia', NOW);
    const r = applyDecision(a, { type: 'rejected', reason: 'requirements_not_met', secondReviewer: 'Sofia' }, NOW);
    if (!r.ok) throw Error(r.error);
    const funnel = computeFunnel([r.applicant]);
    expect(funnel.tiles.map(t => t.reached)).toEqual([1, 1, 1, 1, 0]);
    for (const tile of funnel.tiles.filter(t => t.parts.length)) expect(tile.parts.reduce((n,p) => n+p.count, 0)).toBe(tile.reached);
    expect(metric([r.applicant], 'acceptance').value).toBe(100);
  });
  it('does not double-count a closure after previously submitted documents', () => {
    const a = mk({ registeredAt: NOW - 20 * DAY, firstDocsSubmittedAt: NOW - 18 * DAY, decision: { type: 'rejected', reason: 'no_response_14d', by: 'Hjalmar', at: NOW } });
    const funnel = computeFunnel([a]);
    expect(funnel.tiles.map(t => t.reached)).toEqual([1, 1, 0, 0, 0]);
    for (const tile of funnel.tiles.filter(t => t.parts.length)) expect(tile.parts.reduce((n,p) => n+p.count, 0)).toBe(tile.reached);
  });
  it('does not label a new applicant as lost and asks for the extract first', () => {
    const a = mk({ registeredAt: NOW, docs: { licence: 'missing', id: 'missing', photo: 'missing', extract: 'missing' } });
    expect(driverStep(a)).toBe('extract');
    expect(computeFunnel([a]).edges.some(e => e.biggestDrop)).toBe(false);
  });
  it('requires a separate second reviewer and allows a pending pre-drive decision', () => {
    const a = accepted();
    expect(applyDecision(a, { type: 'rejected', reason: 'requirements_not_met', secondReviewer: 'Hjalmar' }, NOW).ok).toBe(false);
    const checked = confirmSecondReview(a, 'requirements_not_met', 'Sofia', NOW);
    expect(applyDecision(checked, { type: 'rejected', reason: 'requirements_not_met', secondReviewer: 'Sofia' }, NOW).ok).toBe(true);
  });
  it('requires explicit onboarding and verified licence, including manual ID', () => {
    expect(applyDecision(inReview({ onboardingCompletedAt: undefined }), { type: 'accepted' }, NOW).ok).toBe(false);
    expect(applyDecision(inReview({ docs: { ...inReview().docs, licence: 'uploaded' } }), { type: 'accepted' }, NOW).ok).toBe(false);
    expect(applyDecision(inReview({ idMethod: 'manual' }), { type: 'accepted' }, NOW).ok).toBe(true);
  });
  it('uses actual matching jobs, prevents conflicting reservations and rebooks with a new id', () => {
    const a = accepted(); const gigs = firstGigOffers(a, generateGigs(NOW), [a], NOW);
    const booked = bookFirstGig(a, gigs[0], NOW, [a]);
    if (!booked.ok) throw Error(booked.error);
    expect(bookFirstGig(a, NOW + DAY, NOW).ok).toBe(false);
    expect(bookFirstGig({ ...a, id: 'OTHER' }, gigs[0], NOW, [booked.applicant]).ok).toBe(false);
    const rebooked = bookFirstGig(booked.applicant, gigs[1], NOW, [booked.applicant]);
    expect(rebooked.ok && rebooked.applicant.firstGig?.gigId).toBe(gigs[1].id);
  });
  it('cannot complete a future or unbooked first drive or one without delivery evidence', () => {
    expect(completeFirstGig(accepted(), { onTime: true, ok: true }, NOW).ok).toBe(false);
    const a = { ...accepted(), firstGig: { gigId: 'TEST', bookedFor: NOW + DAY } };
    expect(completeFirstGig(a, { onTime: true, ok: true, delivery: { jobId: 'TEST', at: NOW } }, NOW).ok).toBe(false);
    expect(completeFirstGig({ ...a, firstGig: { ...a.firstGig, bookedFor: NOW - DAY } }, { onTime: true, ok: true }, NOW).ok).toBe(false);
  });
  it('only completes the booked drive from matching chronological delivery evidence', () => {
    const a = { ...accepted(), firstGig: { gigId: 'TEST', bookedFor: NOW - HOUR } };
    const r = completeFirstGig(a, { onTime: true, ok: true, delivery: { jobId: 'TEST', at: NOW } }, NOW);
    expect(r.ok && r.applicant.firstGig?.doneAt).toBe(NOW);
    expect(canStartDrive({ ...a, extractShown: false })).toBeTruthy();
  });
  it('distinguishes weekends-only from weekday evenings', () => {
    const a = { ...accepted(), availability: 'limited' as const, availabilitySlots: ['weekend' as const] };
    const g = { id: 'FRIDAY', from: 'Solna', to: 'Solna', area: 'Solna', km: 5, minutes: 20, pay: 300, at: NOW + DAY + 8 * HOUR, car: 'standard' as const };
    expect(firstGigOffers(a, [g], [a], NOW)).toEqual([]);
    expect(firstGigOffers({ ...a, availabilitySlots: ['weekday_evening'] }, [g], [a], NOW)).toHaveLength(1);
  });
  it('does not let future records contaminate current flow and quality', () => {
    const a = { ...accepted(), registeredAt: NOW + DAY, firstGig: { doneAt: NOW + 2 * DAY, ok: true, onTime: true } };
    expect(metric([a], 'appToActive').value).toBeNull();
    expect(metric([a], 'quality').value).toBeNull();
  });
  it('includes both guardrails and comparable mean in the report', () => {
    const facts = weeklyFacts(generateSeed(NOW), [], NOW).facts;
    expect(facts.some(f => f.id === 'acceptance_rate')).toBe(true);
    expect(facts.some(f => f.id.startsWith('reject_'))).toBe(true);
    expect(facts.some(f => f.id === 'first_drive_quality')).toBe(true);
    expect(facts.some(f => f.id === 'mean_decision_hours')).toBe(true);
  });
  it('does not tell a driver to wait for the post to book a call', () => {
    expect(nudgeMessage(mk({ docs: { ...mk().docs, licence: 'missing', extract: 'pending' } }))).not.toContain('when it arrives and we book');
  });
});

describe('case-consistent Live Ops', () => {
  it('treats immediate keys at check-in as a normal handover without inventing an incident', () => {
    const j = { ...job(), asInCase: false, escalation: undefined, problemAt: undefined, arrivedAt: undefined };
    const handedOver = gotKeys(checkIn(j, j.pickupAt), j.pickupAt);
    expect(handedOver.keysAt).toBe(j.pickupAt);
    expect(handedOver.incident).toBeUndefined();
  });
  it('keeps T-24 and T-60 phone confirmations separate', () => {
    const j = { ...job(), asInCase: false, pickupAt: NOW + HOUR };
    const yesterday = confirmByPhone(j, NOW - 20 * HOUR, '24h');
    expect(pickupChecks(yesterday, NOW + 30 * MIN).find(c => c.key === '60min')!.state).toBe('no_reply');
  });
  it('blocks dispatch without complete contact/key data', () => {
    const j = { ...job(), keyLocation: '' };
    expect(pickupReadinessErrors(j)).toContain('confirmed key location');
    expect(checkIn(j, NOW).arrivedAt).toBe(j.arrivedAt);
    expect(depart({ ...j, keysAt: NOW }, NOW).departedAt).toBeUndefined();
  });
  it('requires pilot account update and a timed booker review before closure', () => {
    const j = setOutcome(job(), 'keys_found', NOW);
    expect(closeIncident(j, { waitPaid: true, feeWaived: true, cause: 'customer_keys' }, NOW).ok).toBe(false);
    expect(closeIncident(tellAccountOwner(j, NOW), { waitPaid: true, feeWaived: true, cause: 'customer_keys' }, NOW).ok).toBe(false);
    const r = closeIncident(tellAccountOwner(j, NOW), { waitPaid: true, feeWaived: true, cause: 'customer_keys', reviewBooked: true, reviewAt: NOW + DAY }, NOW);
    if (!r.ok) throw Error(r.error);
    expect(opsState(r.job, NOW)).toBe('at_pickup');
    expect(incidentClock(r.job, NOW + HOUR).waitedMs).toBe(25 * MIN);
  });
  it('keeps a closed rebooking in attention until a replacement booking exists', () => {
    const j = setOutcome(job(), 'later_today', NOW);
    const r = closeIncident(tellAccountOwner(j, NOW), { waitPaid: true, feeWaived: true, cause: 'customer_keys', reviewBooked: true, reviewAt: NOW + DAY }, NOW);
    if (!r.ok) throw Error(r.error);
    expect(opsState(r.job, NOW)).toBe('check_due');
    const booked = bookReplacement(r.job, NOW + 2 * HOUR, NOW);
    expect(replacementJob(booked)).toMatchObject({ pickupAt: NOW + 2 * HOUR, id: `${j.id}-R` });
    expect(replacementJob(booked)?.bookedAt).toBe(NOW);
    expect(pickupChecks(replacementJob(booked)!, NOW).every(c => c.sentAt >= NOW)).toBe(true);
  });
  it('does not proceed after the last departure without a feasible revised agreement', () => {
    const j = job(); const late = incidentClock(j, NOW).lastDeparture + MIN;
    expect(setOutcome(j, 'keys_found', late)).toBe(j);
    const agreed = agreeDeliveryDeadline(j, late + 3 * HOUR, late);
    expect(setOutcome(agreed, 'keys_found', late).incident?.outcome?.type).toBe('keys_found');
  });
  it('does not invent no-incident quality or positive customer feedback', () => {
    expect(firstDriveResult({ ...job(), incident: undefined, problemAt: NOW, deliveredAt: NOW }).ok).toBe(false);
    const a = { ...accepted(), firstGig: { doneAt: NOW, onTime: true, ok: true } };
    expect(metric([a], 'quality').value).toBeNull();
    expect(metric([a], 'quality').caption).toContain('1 pending customer feedback');
  });
  it('never claims an automatic contact text without a sent-message record', () => {
    const j = { ...job(), asInCase: false, escalation: undefined, problemAt: undefined, texts: undefined, arrivedAt: NOW };
    expect(liveOpsEvents([j], NOW - MIN, NOW).filter(e => e.kind === 'live_assist').every(e => !e.title.includes('texted'))).toBe(true);
  });
  it('materializes sent notifications once so a later state cannot rewrite them', () => {
    const a = materializeAutomation(mk({ registeredAt: NOW - 5 * HOUR, docs: { ...mk().docs, photo: 'missing' } }), NOW);
    const before = automationEvents([a], NOW - 6 * HOUR, NOW).find(e => e.kind === 'nudge' && e.audience === 'driver')!;
    const changed = materializeAutomation(receiveDocument(a, 'photo', 'uploaded', NOW), NOW, true);
    expect(automationEvents([changed], NOW - 6 * HOUR, NOW).find(e => e.kind === 'nudge' && e.audience === 'driver')).toEqual(before);
  });
});
