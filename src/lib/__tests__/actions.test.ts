import { describe, expect, it } from 'vitest';
import { applyDecision, bookFirstGig, closeNoResponse, completeFirstGig, logNudge, logWelcomeCall, receiveDocument, requestNewPhoto, setExtractShown, setPhotoApproved } from '../actions';
import { deriveStage } from '../stage';
import { DAY } from '../time';
import { inReview, mk, NOW } from './helpers';

describe('applyDecision', () => {
  it('accepts, records reviewer and time, and logs it', () => {
    const r = applyDecision(inReview(), { type: 'accepted' }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applicant.decision).toMatchObject({ type: 'accepted', by: 'Hjalmar', at: NOW });
    expect(deriveStage(r.applicant)).toBe('accepted');
    expect(r.applicant.log.at(-1)!.text).toMatch(/Accept/);
    expect(r.message).toBe('Accepted: Test Person. Moved to Awaiting first gig.');
  });
  it('stores reason code and note on reject', () => {
    const r = applyDecision(inReview(), { type: 'rejected', reason: 'other', note: ' Duplicate ' }, NOW);
    expect(r.ok && r.applicant.decision).toMatchObject({ reason: 'other', note: 'Duplicate' });
  });
  it('refuses invalid decisions without changing anything', () => {
    const before = inReview();
    const r = applyDecision(before, { type: 'rejected' }, NOW);
    expect(r.ok).toBe(false);
    expect(before.decision).toBeUndefined();
  });
  it('stores the second reviewer on a suitability rejection', () => {
    const r = applyDecision(inReview(), { type: 'rejected', reason: 'requirements_not_met', secondReviewer: 'Backup' }, NOW);
    expect(r.ok && r.applicant.decision?.secondReviewer).toBe('Backup');
    expect(r.ok && r.applicant.log.at(-1)!.text).toMatch(/confirmed by Backup/);
  });
  it('refuses a note with offence details', () => {
    expect(applyDecision(inReview(), { type: 'rejected', reason: 'other', note: 'Dömd för stöld 2023' }, NOW).ok).toBe(false);
  });
});

describe('requestNewPhoto', () => {
  it('sends the applicant back to missing documents with photo missing', () => {
    const r = requestNewPhoto(inReview(), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(deriveStage(r.applicant)).toBe('registered');
    expect(r.applicant.docs.photo).toBe('missing');
    expect(r.applicant.photoApproved).toBe(false);
  });
});

describe('receiveDocument', () => {
  it('auto-queues the file for review when the last document arrives', () => {
    const a = mk({ docs: { licence: 'verified', id: 'verified', extract: 'pending', photo: 'uploaded' } });
    const next = receiveDocument(a, 'extract', 'ready', NOW);
    expect(next.docsCompleteAt).toBe(NOW);
    expect(deriveStage(next)).toBe('review');
  });
});

describe('nudges and no-response', () => {
  it('logs a manual nudge and says no SMS was sent', () => {
    const r = logNudge(mk(), NOW);
    expect(r.ok && r.applicant.nudges).toEqual([NOW]);
    expect(r.ok && r.message).toMatch(/no SMS sent/);
  });
  it('closes an old incomplete file with the no-response code', () => {
    const r = closeNoResponse(mk({ registeredAt: NOW - 20 * DAY }), NOW);
    expect(r.ok && r.applicant.decision?.reason).toBe('no_response_14d');
    expect(r.ok && deriveStage(r.applicant)).toBe('closed'); // not a decision on the applicant, so not a rejection
  });
});

describe('activation actions', () => {
  const accepted = () => {
    const r = applyDecision(inReview(), { type: 'accepted' }, NOW - 5 * DAY);
    if (!r.ok) throw new Error(r.error);
    return r.applicant;
  };
  it('logs a welcome call and books a first gig', () => {
    const a1 = logWelcomeCall(accepted(), NOW);
    expect(a1.ok && a1.applicant.welcomeCallAt).toBe(NOW);
    const a2 = bookFirstGig(accepted(), NOW + DAY, NOW);
    expect(a2.ok && a2.applicant.firstGig?.bookedFor).toBe(NOW + DAY);
  });
  it('completing the first gig makes the driver active and stores quality', () => {
    const r = completeFirstGig(accepted(), { onTime: false, ok: true }, NOW);
    expect(r.ok && deriveStage(r.applicant)).toBe('active');
    expect(r.ok && r.applicant.firstGig).toMatchObject({ doneAt: NOW, onTime: false, ok: true });
  });
  it('an incident on the first gig needs a cause and a note about the drive', () => {
    expect(completeFirstGig(accepted(), { onTime: true, ok: false }, NOW)).toEqual({ ok: false, error: 'Say what happened: pick a cause and write a short note about the drive.' });
    expect(completeFirstGig(accepted(), { onTime: true, ok: false, issue: { cause: 'damage', note: '   ' } }, NOW).ok).toBe(false);
    const r = completeFirstGig(accepted(), { onTime: true, ok: false, issue: { cause: 'damage', note: 'Scratch on the rear bumper, reported with photos.' } }, NOW);
    expect(r.ok && r.applicant.firstGig?.issue).toEqual({ cause: 'damage', note: 'Scratch on the rear bumper, reported with photos.' });
    expect(r.ok && r.applicant.log.at(-1)?.text).toContain('incident: damage or an accident, "Scratch on the rear bumper, reported with photos."');
  });
  it('activation actions only apply to accepted drivers', () => {
    expect(logWelcomeCall(inReview(), NOW).ok).toBe(false);
  });
  it('photo approval is logged', () => {
    expect(setPhotoApproved(inReview({ photoApproved: undefined }), true, NOW).photoApproved).toBe(true);
  });
  it('the extract tick records only that it was shown', () => {
    const a = setExtractShown(inReview({ extractShown: undefined }), true, NOW);
    expect(a.extractShown).toBe(true);
    expect(a.log.at(-1)!.text).toMatch(/nothing stored/);
  });
});
