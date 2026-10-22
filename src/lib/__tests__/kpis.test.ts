import { describe, expect, it } from 'vitest';
import { computeFunnel, computeKpis, median } from '../kpis';
import type { Applicant } from '../types';
import { DAY, HOUR } from '../time';
import { mk, NOW } from './helpers';

const kpi = (apps: Applicant[], key: string) => computeKpis(apps, NOW).find((k) => k.key === key)!;
const accepted = (decAgoDays: number, gigAfterDays?: number, over: Partial<Applicant> = {}) => {
  const at = NOW - decAgoDays * DAY;
  return mk({
    registeredAt: at - 5 * DAY,
    docsCompleteAt: at - 30 * HOUR,
    decision: { type: 'accepted', at, by: 'x' },
    ...(gigAfterDays !== undefined ? { firstGig: { doneAt: at + gigAfterDays * DAY, onTime: true, ok: true } } : {}),
    ...over,
  });
};

describe('median', () => {
  it('handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('document completion', () => {
  it('only counts people registered ≥ 7 days ago', () => {
    const apps = [
      mk({ registeredAt: NOW - 10 * DAY, docsCompleteAt: NOW - 8 * DAY }),
      mk({ registeredAt: NOW - 10 * DAY }),
      mk({ registeredAt: NOW - 1 * DAY }), // too fresh, ignored
    ];
    const k = kpi(apps, 'docCompletion');
    expect(k.value).toBe(50);
    expect(k.caption).toContain('1 of 2');
    expect(k.status).toBe('off');
  });
  it('a no-response close never reached documents', () => {
    const apps = [mk({ registeredAt: NOW - 20 * DAY, decision: { type: 'rejected', reason: 'no_response_14d', at: NOW - 5 * DAY, by: 'x' } })];
    expect(kpi(apps, 'docCompletion').value).toBe(0);
  });
});

describe('time to decision', () => {
  it('median hours from complete file to decision, and share within 48 h', () => {
    const mkD = (h: number) => mk({ docsCompleteAt: NOW - 200 * HOUR, decision: { type: 'accepted', at: NOW - 200 * HOUR + h * HOUR, by: 'x' } });
    const k = kpi([mkD(10), mkD(40), mkD(100)], 'timeToDecision');
    expect(k.value).toBe(40);
    expect(k.sub).toContain('67% within 48 h');
    expect(k.status).toBe('on');
  });
});

describe('activation rate', () => {
  it('counts first gig within 14 days among those accepted ≥ 14 days ago', () => {
    const apps = [accepted(20, 3), accepted(20, 16), accepted(20), accepted(5)];
    const k = kpi(apps, 'activation');
    expect(k.caption).toContain('1 of 3');
    expect(Math.round(k.value!)).toBe(33);
  });
});

describe('application → active (north star)', () => {
  it('new active drivers ÷ new applications in the last 30 days', () => {
    const apps = [accepted(10, 2), mk({ registeredAt: NOW - DAY }), mk({ registeredAt: NOW - 2 * DAY }), mk({ registeredAt: NOW - 40 * DAY })];
    const k = kpi(apps, 'appToActive');
    expect(k.northStar).toBe(true);
    expect(k.caption).toContain('1 new active ÷ 3 applications');
  });
});

describe('first-gig quality', () => {
  it('on time and ok', () => {
    const late = accepted(20, 3);
    late.firstGig!.onTime = false;
    expect(kpi([accepted(20, 3), late], 'quality').value).toBe(50);
  });
});

describe('acceptance rate', () => {
  it('excludes no-response closes and lists top reject reasons', () => {
    const rej = (reason: 'background_failed' | 'no_response_14d') =>
      mk({ docsCompleteAt: reason === 'no_response_14d' ? undefined : NOW - 3 * DAY, decision: { type: 'rejected', reason, at: NOW - DAY, by: 'x' } });
    const k = kpi([accepted(3), rej('background_failed'), rej('no_response_14d')], 'acceptance');
    expect(k.value).toBe(50);
    expect(k.sub).toContain('Background ×1');
  });
});

describe('computeFunnel', () => {
  it('cumulative tiles, auto-queued edge and biggest drop', () => {
    const apps = [mk(), mk(), mk(), accepted(3), accepted(20, 2)];
    const f = computeFunnel(apps);
    expect(f.tiles.map((t) => t.reached)).toEqual([5, 2, 2, 2, 1]);
    expect(f.edges.find((e) => e.to === 'review')!.autoQueued).toBe(true);
    expect(f.edges.find((e) => e.biggestDrop)!.to).toBe('docs');
  });
});
