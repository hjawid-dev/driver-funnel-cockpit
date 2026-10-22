import { describe, expect, it } from 'vitest';
import { slaStatus } from '../sla';
import { HOUR, MIN } from '../time';
import { NOW } from './helpers';

describe('slaStatus', () => {
  it('< 24 h is green with time left', () => {
    const s = slaStatus(NOW - 17 * HOUR, NOW);
    expect(s.bucket).toBe('ok');
    expect(s.label).toBe('31 h left');
  });
  it('24–48 h is amber', () => {
    const s = slaStatus(NOW - 39 * HOUR, NOW);
    expect(s.bucket).toBe('warn');
    expect(s.label).toBe('9 h left');
  });
  it('exactly 24 h flips to amber', () => {
    expect(slaStatus(NOW - 24 * HOUR, NOW).bucket).toBe('warn');
  });
  it('> 48 h is red and shows how overdue', () => {
    const s = slaStatus(NOW - 51 * HOUR, NOW);
    expect(s.bucket).toBe('overdue');
    expect(s.label).toBe('Overdue 3 h');
  });
  it('under an hour shows minutes', () => {
    expect(slaStatus(NOW - (48 * HOUR - 25 * MIN), NOW).label).toBe('25 min left');
    expect(slaStatus(NOW - (48 * HOUR + 10 * MIN), NOW).label).toBe('Overdue 10 min');
  });
});

import { nextReviewSlot } from '../sla';

describe('nextReviewSlot', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 22, h, m).getTime();
  it('before 09:00 → 09:00 today', () => expect(nextReviewSlot(at(7)).label).toBe('09:00 today'));
  it('between slots → 14:00 today', () => expect(nextReviewSlot(at(10, 30)).label).toBe('14:00 today'));
  it('after 14:00 → 09:00 tomorrow', () => {
    const s = nextReviewSlot(at(16));
    expect(s.label).toBe('09:00 tomorrow');
    expect(new Date(s.at).getDate()).toBe(23);
  });
});
