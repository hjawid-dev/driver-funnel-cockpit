import { describe, expect, it } from 'vitest';
import { evaluate, noteLooksSensitive, reviewChips, validateDecision } from '../criteria';
import { DAY } from '../time';
import { inReview, mk, NOW } from './helpers';

describe('evaluate: must-haves', () => {
  it('clean file with photo approved and extract shown passes everything', () => {
    const ev = evaluate(inReview());
    expect(ev.mustHaves.map((m) => m.result)).toEqual(['pass', 'pass', 'pass', 'pass']);
    expect(ev.acceptBlockedBy).toEqual([]);
    expect(ev.acceptType).toBe('accepted');
  });
  it('photo and extract need a manual tick before accepting', () => {
    const ev = evaluate(inReview({ photoApproved: undefined, extractShown: undefined }));
    expect(ev.mustHaves.find((m) => m.key === 'photo')!.result).toBe('manual');
    expect(ev.mustHaves.find((m) => m.key === 'extract')!.result).toBe('manual');
    expect(ev.acceptBlockedBy).toHaveLength(2);
  });
  it('an extract that is only ordered blocks review decisions', () => {
    const ev = evaluate(inReview({ extractShown: undefined, docs: { licence: 'verified', id: 'verified', extract: 'pending', photo: 'uploaded' } }));
    expect(ev.mustHaves.find((m) => m.key === 'extract')!.result).toBe('fail');
  });
  it('licence < 1 year fails and suggests the licence reason', () => {
    const ev = evaluate(inReview({ licenceYears: 0.8 }));
    expect(ev.mustHaves[0].result).toBe('fail');
    expect(ev.suggestedReject).toBe('no_valid_licence');
  });
  it('ID must be verified with BankID', () => {
    const ev = evaluate(inReview({ docs: { licence: 'verified', id: 'uploaded', extract: 'ready', photo: 'uploaded' } }));
    expect(ev.mustHaves[1].result).toBe('fail');
    expect(ev.suggestedReject).toBe('id_unverified');
  });
  it('never suggests a reason that could reveal an offence', () => {
    const ev = evaluate(inReview({ extractShown: undefined }));
    expect(ev.suggestedReject).toBeUndefined();
  });
});

describe('evaluate: borderline rules', () => {
  it('licence 1–2 years → simple drives first', () => {
    const ev = evaluate(inReview({ licenceYears: 1.5 }));
    expect(ev.borderline.map((b) => b.key)).toEqual(['licence_1_2']);
    expect(ev.acceptType).toBe('accepted_simple');
    expect(ev.acceptBlockedBy).toEqual([]);
  });
  it('limited availability → accept + flag, never reject', () => {
    const ev = evaluate(inReview({ availability: 'limited' }));
    expect(ev.acceptType).toBe('accepted_flagged');
    expect(ev.acceptBlockedBy).toEqual([]);
  });
  it('licence exactly 2 years is not borderline', () => {
    expect(evaluate(inReview({ licenceYears: 2 })).borderline).toEqual([]);
  });
  it('licence exactly 1 year is borderline, not a fail', () => {
    expect(evaluate(inReview({ licenceYears: 1 })).acceptType).toBe('accepted_simple');
  });
});

describe('validateDecision', () => {
  it('reject needs a reason code', () => {
    expect(validateDecision(inReview(), { type: 'rejected' }, NOW)).toMatch(/reason/);
  });
  it('"Other" needs a note (whitespace does not count)', () => {
    expect(validateDecision(inReview(), { type: 'rejected', reason: 'other', note: '   ' }, NOW)).toMatch(/note/);
    expect(validateDecision(inReview(), { type: 'rejected', reason: 'other', note: 'Duplicate account' }, NOW)).toBeNull();
  });
  it('a suitability rejection needs a second reviewer', () => {
    expect(validateDecision(inReview(), { type: 'rejected', reason: 'requirements_not_met' }, NOW)).toMatch(/second reviewer/);
    expect(validateDecision(inReview(), { type: 'rejected', reason: 'requirements_not_met', secondReviewer: '  ' }, NOW)).toMatch(/second reviewer/);
    expect(validateDecision(inReview(), { type: 'rejected', reason: 'requirements_not_met', secondReviewer: 'Backup' }, NOW)).toBeNull();
  });
  it('plain accept is refused when a borderline rule applies', () => {
    expect(validateDecision(inReview({ licenceYears: 1.5 }), { type: 'accepted' }, NOW)).toMatch(/simple drives first/);
    expect(validateDecision(inReview({ licenceYears: 1.5 }), { type: 'accepted_simple' }, NOW)).toBeNull();
  });
  it('cannot accept while a must-have fails', () => {
    expect(validateDecision(inReview({ licenceYears: 0.8 }), { type: 'accepted' }, NOW)).toMatch(/Can't accept/);
  });
  it('cannot decide someone who is not under review', () => {
    expect(validateDecision(mk(), { type: 'accepted' }, NOW)).toMatch(/under review/);
    expect(validateDecision(mk(), { type: 'rejected', reason: 'other', note: 'x' }, NOW)).toMatch(/under review/);
  });
  it('no-response close only for incomplete files older than 14 days', () => {
    expect(validateDecision(mk({ registeredAt: NOW - 15 * DAY }), { type: 'rejected', reason: 'no_response_14d' }, NOW)).toBeNull();
    expect(validateDecision(mk({ registeredAt: NOW - 10 * DAY }), { type: 'rejected', reason: 'no_response_14d' }, NOW)).toMatch(/14 days/);
  });
  it('blocks notes with offence details', () => {
    expect(validateDecision(inReview(), { type: 'rejected', reason: 'other', note: 'Convicted of theft' }, NOW)).toMatch(/offence details/);
  });
});

describe('noteLooksSensitive', () => {
  it.each(['Dömd för stöld', 'brott 2022', 'Belastningsregistret visar…', 'speeding fine', 'criminal record', 'rattfylleri'])('flags "%s"', (n) => {
    expect(noteLooksSensitive(n)).toBe(true);
  });
  it.each(['Duplicate account', 'Moved abroad', 'Asked to withdraw', ''])('allows "%s"', (n) => {
    expect(noteLooksSensitive(n)).toBe(false);
  });
});

describe('reviewChips', () => {
  it('shows borderline, extract-call and photo chips', () => {
    const labels = reviewChips(inReview({ licenceYears: 1.5, photoApproved: undefined, extractShown: undefined })).map((c) => c.label);
    expect(labels).toEqual(['Licence 1.5 yrs', 'Extract call', 'Photo unchecked']);
  });
  it('shows a photo remark as "Photo unclear"', () => {
    const a = inReview({ photoApproved: undefined, docs: { licence: 'verified', id: 'verified', extract: 'ready', photo: 'remark' } });
    expect(reviewChips(a).map((c) => c.label)).toContain('Photo unclear');
  });
});
