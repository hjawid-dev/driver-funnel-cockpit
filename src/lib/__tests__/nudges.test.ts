import { describe, expect, it } from 'vitest';
import { isNoResponse, nudgeState } from '../nudges';
import { DAY, HOUR } from '../time';
import { mk, NOW } from './helpers';

describe('nudgeState', () => {
  it('before the first nudge: none sent, next at +2 h', () => {
    const s = nudgeState(mk({ registeredAt: NOW - 30 * 60_000 }), NOW);
    expect(s.total).toBe(0);
    expect(s.label).toBe('Next nudge in 1 h');
  });
  it('after 30 h: two scheduled nudges sent, next at +72 h', () => {
    const s = nudgeState(mk({ registeredAt: NOW - 30 * HOUR }), NOW);
    expect(s.autoSent).toHaveLength(2);
    expect(s.nextAt).toBe(NOW - 30 * HOUR + 72 * HOUR);
    expect(s.label).toBe('Next nudge in 42 h');
  });
  it('after 72 h: all nudges sent', () => {
    const s = nudgeState(mk({ registeredAt: NOW - 4 * DAY }), NOW);
    expect(s.autoSent).toHaveLength(3);
    expect(s.label).toBe('All nudges sent');
  });
  it('manual nudges add to the total', () => {
    const s = nudgeState(mk({ registeredAt: NOW - 4 * DAY, nudges: [NOW - HOUR] }), NOW);
    expect(s.total).toBe(4);
  });
  it('scheduled nudges stop once the file is complete', () => {
    const reg = NOW - 5 * DAY;
    const s = nudgeState(mk({ registeredAt: reg, docsCompleteAt: reg + 10 * HOUR }), NOW);
    expect(s.autoSent).toHaveLength(1);
    expect(s.nextAt).toBeNull();
  });
});

describe('isNoResponse', () => {
  it('flags incomplete files older than 14 days', () => {
    expect(isNoResponse(mk({ registeredAt: NOW - 15 * DAY }), NOW)).toBe(true);
    expect(isNoResponse(mk({ registeredAt: NOW - 13 * DAY }), NOW)).toBe(false);
    expect(isNoResponse(mk({ registeredAt: NOW - 15 * DAY, docsCompleteAt: NOW - DAY }), NOW)).toBe(false);
  });
});

import { nudgeMessage, outstandingDocs } from '../nudges';

describe('outstandingDocs and nudgeMessage', () => {
  const a = mk({ name: 'Wilma Eriksson', docs: { licence: 'uploaded', id: 'verified', extract: 'pending', photo: 'missing' } });
  it('lists the extract first', () => {
    expect(outstandingDocs(a)).toEqual(['extract', 'photo']);
  });
  it('writes a reminder that names what is left', () => {
    const msg = nudgeMessage(a);
    expect(msg).toMatch(/^Hi Wilma/);
    expect(msg).toContain('2 things left');
    expect(msg).toContain('on its way from Polisen');
    expect(msg).toContain('profile photo');
  });
  it('asks the applicant to order the extract, and says no copy is kept', () => {
    const b = mk({ docs: { licence: 'uploaded', id: 'verified', extract: 'missing', photo: 'uploaded' } });
    expect(nudgeMessage(b)).toContain('polisen.se');
    expect(nudgeMessage(b)).toContain('never keep a copy');
  });
});
