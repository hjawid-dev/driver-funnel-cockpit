import { describe, expect, it } from 'vitest';
import { allDocsSubmitted, deriveStage } from '../stage';
import { mk, NOW } from './helpers';

describe('deriveStage', () => {
  it('registered when the file is incomplete', () => {
    expect(deriveStage(mk())).toBe('registered');
  });
  it('review once docs are complete', () => {
    expect(deriveStage(mk({ docsCompleteAt: NOW }))).toBe('review');
  });
  it('accepted for every accept variant', () => {
    for (const type of ['accepted', 'accepted_simple', 'accepted_flagged'] as const) {
      expect(deriveStage(mk({ docsCompleteAt: NOW, decision: { type, at: NOW, by: 'x' } }))).toBe('accepted');
    }
  });
  it('active once the first gig is done', () => {
    expect(deriveStage(mk({ docsCompleteAt: NOW, decision: { type: 'accepted', at: NOW, by: 'x' }, firstGig: { doneAt: NOW } }))).toBe('active');
  });
  it('rejected wins over everything', () => {
    expect(deriveStage(mk({ docsCompleteAt: NOW, decision: { type: 'rejected', reason: 'other', at: NOW, by: 'x' } }))).toBe('rejected');
  });
});

describe('allDocsSubmitted', () => {
  it('pending and missing are not submitted; ready, remark and failed are', () => {
    expect(allDocsSubmitted(mk())).toBe(true);
    expect(allDocsSubmitted(mk({ docs: { licence: 'verified', id: 'verified', extract: 'pending', photo: 'uploaded' } }))).toBe(false);
    expect(allDocsSubmitted(mk({ docs: { licence: 'verified', id: 'failed', extract: 'ready', photo: 'remark' } }))).toBe(true);
  });
});
