import { describe, expect, it } from 'vitest';
import { guideSteps } from '../guide';
import { generateSeed } from '../seed';
import { applyDecision, closeNoResponse } from '../actions';
import { computeKpis, kpiDelta } from '../kpis';
import { NOW } from './helpers';

describe('guideSteps', () => {
  const seed = generateSeed(NOW);
  it('starts with nothing done and points at the right applicants', () => {
    const steps = guideSteps(seed, NOW);
    expect(steps.map((s) => s.done)).toEqual([false, false, false]);
    expect(seed.find((a) => a.id === steps[0].targetId)!.name).toBe('Elin Johansson');
    expect(steps[2].targetId).not.toBeNull();
  });
  it('marks steps done when the visitor makes the decisions', () => {
    const elin = seed.find((a) => a.name === 'Elin Johansson')!;
    const r = applyDecision({ ...elin, photoApproved: true }, { type: 'accepted' }, NOW);
    const stale = seed.find((a) => a.id === guideSteps(seed, NOW)[2].targetId)!;
    const c = closeNoResponse(stale, NOW);
    if (!r.ok || !c.ok) throw new Error('setup');
    const next = seed.map((a) => (a.id === elin.id ? r.applicant : a.id === stale.id ? c.applicant : a));
    expect(guideSteps(next, NOW).map((s) => s.done)).toEqual([true, false, true]);
  });
  it('seed decisions by the ops team do not count as done', () => {
    expect(guideSteps(seed, NOW).some((s) => s.done)).toBe(false);
  });
});

describe('kpiDelta', () => {
  const seed = generateSeed(NOW);
  const base = computeKpis(seed, NOW);
  it('is null when nothing changed', () => {
    expect(base.map((k) => kpiDelta(k, k))).toEqual(base.map(() => null));
  });
  it('a faster decision lowers time to decision, which is good', () => {
    const elin = seed.find((a) => a.name === 'Elin Johansson')!;
    const r = applyDecision({ ...elin, photoApproved: true }, { type: 'accepted' }, NOW);
    if (!r.ok) throw new Error('setup');
    const after = computeKpis(seed.map((a) => (a.id === elin.id ? r.applicant : a)), NOW);
    const ttd = after.find((k) => k.key === 'timeToDecision')!;
    const d = kpiDelta(base.find((k) => k.key === 'timeToDecision'), ttd)!;
    expect(d.text).toMatch(/^▼ \d+ h$/);
    expect(d.good).toBe(true);
  });
  it('acceptance rate changes are neutral', () => {
    const b = base.find((k) => k.key === 'acceptance')!;
    expect(kpiDelta(b, { ...b, value: b.value! + 5 })).toEqual({ text: '▲ 5 pp', good: null });
  });
});
