import { describe, expect, it } from 'vitest';
import { generateSeed } from '../seed';
import { retention } from '../retention';
import { REJECT_REASONS } from '../types';
import { DAY } from '../time';
import { NOW } from './helpers';

/** Guards for the legal review: no offence data anywhere, generic reasons, retention set. */
const OFFENCE_WORDS = /violation|speeding|convict|criminal|offen[cs]e|dömd|brott|böter|fine\b|background check failed/i;

describe('privacy by design', () => {
  const seed = generateSeed(NOW);

  it('demo data holds no offence details in any field or log line', () => {
    for (const a of seed) {
      const { docNote, ...rest } = a;
      expect(JSON.stringify(rest)).not.toMatch(OFFENCE_WORDS);
      // The only allowed note is the objective photo note; the extract never gets a status beyond "ready".
      expect(Object.keys(docNote ?? {}).filter((k) => k !== 'photo')).toEqual([]);
      expect(['missing', 'pending', 'ready']).toContain(a.docs.extract);
    }
  });

  it('reason codes never name the criminal record or an offence', () => {
    for (const r of REJECT_REASONS) expect(r.label).not.toMatch(OFFENCE_WORDS);
  });

  it('every decided file only records that the extract was shown', () => {
    for (const a of seed.filter((x) => x.docsCompleteAt && x.decision)) {
      expect(a.extractShown).toBe(true);
      expect(a.docs.extract).toBe('ready');
    }
  });

  it('retention: rejected after 2 years, incomplete after 6 months', () => {
    const rejected = seed.find((a) => a.decision?.type === 'rejected' && a.docsCompleteAt)!;
    expect(retention(rejected).deleteAt).toBe(rejected.decision!.at + 730 * DAY);
    const incomplete = seed.find((a) => !a.docsCompleteAt && !a.decision)!;
    expect(retention(incomplete).deleteAt).toBe(incomplete.registeredAt + 183 * DAY);
    const active = seed.find((a) => a.firstGig?.doneAt)!;
    expect(retention(active).deleteAt).toBeNull();
  });
});
