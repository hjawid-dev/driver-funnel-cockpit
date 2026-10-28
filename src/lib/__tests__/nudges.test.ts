import { describe, expect, it } from 'vitest';
import { isNoResponse, nudgeState, ownerCallAt, ownerCalled, reminderTimes } from '../nudges';
import { DAY, HOUR } from '../time';
import { mk, NOW } from './helpers';

describe('nudgeState', () => {
  it('before the first nudge: none sent, next at +2 h', () => {
    const s = nudgeState(mk({ registeredAt: NOW - 30 * 60_000 }), NOW);
    expect(s.total).toBe(0);
    expect(s.label).toBe('Next nudge in 1 h');
  });
  it('after 30 h: two scheduled nudges sent, the last one on day 7 at a daytime hour', () => {
    // Registered Wednesday 04:00: the 2 h and 24 h reminders wait until 09:00 (no messages at night).
    const s = nudgeState(mk({ registeredAt: NOW - 30 * HOUR }), NOW);
    expect(s.autoSent).toHaveLength(2);
    expect(s.nextAt).toBe(new Date('2026-10-28T09:00:00').getTime());
  });
  it('after day 7: all three nudges sent, then no more', () => {
    const s = nudgeState(mk({ registeredAt: NOW - 8 * DAY }), NOW);
    expect(s.autoSent).toHaveLength(3);
    expect(s.label).toBe('All nudges sent');
  });
  it('manual nudges add to the total', () => {
    const s = nudgeState(mk({ registeredAt: NOW - 8 * DAY, nudges: [NOW - HOUR] }), NOW);
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
    expect(outstandingDocs(a)).toEqual(['photo']);
  });
  it('writes a reminder that names what is left', () => {
    const msg = nudgeMessage(a);
    expect(msg).toMatch(/^Hi Wilma/);
    expect(msg).toContain('One thing left');
    expect(msg).not.toContain('when it arrives');
    expect(msg).toContain('profile photo');
  });
  it('asks the applicant to order the extract, and says no copy is kept', () => {
    const b = mk({ docs: { licence: 'uploaded', id: 'verified', extract: 'missing', photo: 'uploaded' } });
    expect(nudgeMessage(b)).toContain('polisen.se');
    expect(nudgeMessage(b)).toContain('never keep a copy');
  });
});

describe('reminder schedule', () => {
  const at = (iso: string) => new Date(iso).getTime();
  it('sends 2 h, 24 h and day 7 in daytime, at least 12 h apart', () => {
    const t = reminderTimes(mk({ registeredAt: at('2026-11-03T10:30:00') }));
    expect(t).toEqual([at('2026-11-03T12:30:00'), at('2026-11-04T10:30:00'), at('2026-11-10T10:30:00')]);
    const late = reminderTimes(mk({ registeredAt: at('2026-11-03T18:30:00') }));
    expect(new Date(late[0]).getHours()).toBe(9);
    for (let i = 1; i < late.length; i++) expect(late[i] - late[i - 1]).toBeGreaterThanOrEqual(12 * HOUR);
    for (const x of late) expect(new Date(x).getHours()).toBeGreaterThanOrEqual(9);
  });
  it('moves the next reminder on when the driver makes progress', () => {
    const reg = at('2026-11-03T10:30:00');
    const t = reminderTimes(mk({ registeredAt: reg, docTimes: { photo: reg + 20 * HOUR } }));
    // Photo at 06:30 the next morning: the second reminder waits 24 h from then, and for daytime.
    expect(t[1]).toBe(at('2026-11-05T09:00:00'));
  });
  it('has the owner call once, in the first review block at least 3 h after the second reminder', () => {
    const a = mk({ registeredAt: at('2026-11-03T10:30:00') });
    expect(ownerCallAt(a)).toBe(at('2026-11-04T14:00:00'));
    expect(ownerCalled(a)).toBe(false);
    expect(ownerCalled({ ...a, nudges: [at('2026-11-04T14:10:00')] })).toBe(true);
  });
});
