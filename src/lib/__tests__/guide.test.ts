import { describe, expect, it } from 'vitest';
import { guideSteps } from '../guide';
import { generateSeed } from '../seed';
import { applyDecision, receiveDocument } from '../actions';
import { bookCall, createApplicant } from '../driverFlow';
import { DAY } from '../time';
import { computeKpis, kpiDelta } from '../kpis';
import { NOW } from './helpers';

describe('guideSteps', () => {
  const seed = generateSeed(NOW);
  it('starts with nothing done: apply, decide, move time', () => {
    const steps = guideSteps(seed, false);
    expect(steps.map((s) => s.key)).toEqual(['apply', 'accept', 'time']);
    expect(steps.map((s) => s.done)).toEqual([false, false, false]);
    expect(seed.find((a) => a.id === steps[1].targetId)!.name).toBe('Elin Johansson');
  });
  it('marks steps done as the visitor goes', () => {
    let nova = createApplicant({ name: 'Nova Lind', area: 'Solna', licenceYears: 6, meetsMinAge: true, availability: 'full' }, seed, NOW);
    for (const k of ['id', 'licence', 'photo'] as const) nova = receiveDocument(nova, k, k === 'photo' ? 'uploaded' : 'verified', NOW);
    nova = bookCall(receiveDocument(nova, 'extract', 'ready', NOW), NOW + DAY, NOW);
    const withNova = [...seed, nova];
    const steps = guideSteps(withNova, true);
    expect(steps[0].done).toBe(true);
    expect(steps[1].targetId).toBe(nova.id); // the next decision is the visitor's own applicant
    expect(steps[2].done).toBe(true);
    const r = applyDecision({ ...nova, photoApproved: true, extractShown: true }, { type: 'accepted' }, NOW);
    if (!r.ok) throw new Error(r.error);
    expect(guideSteps(withNova.map((a) => (a.id === nova.id ? r.applicant : a)), true)[1].done).toBe(true);
  });
  it('seed decisions by the ops team do not count as done', () => {
    expect(guideSteps(seed, false).some((s) => s.done)).toBe(false);
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
    const r = applyDecision({ ...elin, photoApproved: true, extractShown: true }, { type: 'accepted' }, NOW);
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
