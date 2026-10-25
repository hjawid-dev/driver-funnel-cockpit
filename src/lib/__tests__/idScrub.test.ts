import { describe, expect, it } from 'vitest';
import { IdScrubber, MetaSplitter } from '../chat/meta';

const KNOWN = new Set(['pay']);

/** Stream text through in chunks of n characters, as the model does. */
function stream(ids: string[], text: string, n: number): string {
  const s = new MetaSplitter(ids);
  let out = '';
  for (let i = 0; i < text.length; i += n) out += s.push(text.slice(i, i + n));
  return out + s.end(KNOWN).text;
}

describe('internal action ids never reach the driver', () => {
  const failed =
    'Vad roligt att utdraget har kommit, Klara! Tryck på "Mark your extract as arrived" (ARRIVED) nedan så markeras det, och sedan bokar du den 5-minuters videokontrollen innan din första körning.';
  const clean =
    'Vad roligt att utdraget har kommit, Klara! Tryck på "Mark your extract as arrived" nedan så markeras det, och sedan bokar du den 5-minuters videokontrollen innan din första körning.';

  it('removes the id from the answer that failed the eval, whatever the chunk size', () => {
    for (const n of [1, 2, 3, 5, 8, 13, 400]) expect(stream(['ARRIVED', 'X1', 'X2'], failed, n)).toBe(clean);
  });

  it('removes ids in brackets and quotes, with the space before them', () => {
    const ids = ['G3', 'S2', 'LATER_1D'];
    expect(stream(ids, 'Saturday\'s drive [G3] fits.', 2)).toBe("Saturday's drive fits.");
    expect(stream(ids, 'I can book Friday "S2" for you.', 3)).toBe('I can book Friday for you.');
    expect(stream(ids, 'Tomorrow `LATER_1D` works.', 4)).toBe('Tomorrow works.');
  });

  it('leaves text alone that only looks like the start of an id', () => {
    const ids = ['ARRIVED', 'STOP'];
    expect(stream(ids, 'Tap the button (Also fine) below.', 1)).toBe('Tap the button (Also fine) below.');
    expect(stream(ids, 'Press "Accept" when ready.', 2)).toBe('Press "Accept" when ready.');
    expect(stream(ids, 'STOP the car only if it is safe.', 3)).toBe('STOP the car only if it is safe.');
  });

  it('still hides the meta line, and passes text straight through when there are no ids', () => {
    expect(stream(['ARRIVED'], 'Done (ARRIVED).\n<meta>{"sources":["pay"],"handover":null}</meta>', 3)).toBe('Done.\n');
    const s = new IdScrubber([]);
    expect(s.push('Plain (text) "here" ')).toBe('Plain (text) "here" ');
    expect(s.end()).toBe('');
  });
});
