import { describe, expect, it } from 'vitest';
import { activationBucket, activationFlags } from '../activation';
import { DAY } from '../time';
import { mk, NOW } from './helpers';

describe('activationBucket', () => {
  it.each([
    [1, 'on_track'],
    [6.9, 'on_track'],
    [7, 'book'],
    [12, 'book'],
    [14, 'call'],
    [29, 'call'],
    [30, 'dormant'],
    [34, 'dormant'],
  ])('%s days after acceptance → %s', (d, expected) => {
    expect(activationBucket(NOW - d * DAY, NOW)).toBe(expected);
  });
});

describe('activationFlags', () => {
  it('reads the decision type and availability', () => {
    expect(activationFlags(mk({ decision: { type: 'accepted_simple', at: NOW, by: 'x' } })).simpleDrivesFirst).toBe(true);
    expect(activationFlags(mk({ decision: { type: 'accepted_flagged', at: NOW, by: 'x' } })).activationFollowUp).toBe(true);
    expect(activationFlags(mk({ availability: 'limited', decision: { type: 'accepted_simple', at: NOW, by: 'x' } })).activationFollowUp).toBe(true);
    expect(activationFlags(mk({ decision: { type: 'accepted', at: NOW, by: 'x' } }))).toEqual({ simpleDrivesFirst: false, activationFollowUp: false });
  });
});

import { byActivationPriority, welcomeCallState } from '../activation';
import { HOUR } from '../time';

describe('welcomeCallState', () => {
  const acc = (hAgo: number) => mk({ decision: { type: 'accepted', at: NOW - hAgo * HOUR, by: 'x' } });
  it('due within 24 h of acceptance', () => {
    expect(welcomeCallState(acc(6), NOW)).toEqual({ state: 'due', label: 'Due in 18 h' });
  });
  it('overdue after 24 h', () => {
    expect(welcomeCallState(acc(30), NOW)).toEqual({ state: 'overdue', label: 'Overdue 6 h' });
  });
  it('done once logged', () => {
    expect(welcomeCallState({ ...acc(30), welcomeCallAt: NOW - HOUR }, NOW).state).toBe('done');
  });
});

describe('byActivationPriority', () => {
  it('call, book, on track, dormant', () => {
    const at = (d: number) => mk({ name: String(d), decision: { type: 'accepted', at: NOW - d * DAY, by: 'x' } });
    const sorted = [at(1), at(34), at(9), at(18), at(12), at(4)].sort(byActivationPriority(NOW)).map((a) => a.name);
    expect(sorted).toEqual(['18', '12', '9', '4', '1', '34']);
  });
});
