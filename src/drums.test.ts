import { describe, it, expect } from 'vitest';
import { drumsForSlot } from './drums';
import { SLOTS_PER_MEASURE } from './chord';

function bar(swing: boolean): string[][] {
  const out: string[][] = [];
  for (let slot = 0; slot < SLOTS_PER_MEASURE; slot++) {
    out.push(drumsForSlot(slot, swing).map((h) => (h.accent ? `${h.voice}!` : h.voice)));
  }
  return out;
}

describe('drumsForSlot', () => {
  it('rides every beat and closes the foot on two and four', () => {
    expect(bar(false)).toEqual([
      ['ride'],           // 1
      [],
      ['ride!', 'hihat'], // 2
      [],
      ['ride'],           // 3
      [],
      ['ride!', 'hihat'], // 4
      [],
    ]);
  });

  it('adds the swung eighth after two and four, and nowhere else', () => {
    expect(bar(true)).toEqual([
      ['ride'],
      [],
      ['ride!', 'hihat'],
      ['ride'],           // the "da" of ding-da
      ['ride'],
      [],
      ['ride!', 'hihat'],
      ['ride'],
    ]);
  });

  it('accents the backbeats only', () => {
    const accented = [0, 1, 2, 3, 4, 5, 6, 7]
      .filter((slot) => drumsForSlot(slot, true).some((h) => h.accent));
    expect(accented).toEqual([2, 6]);
  });

});
