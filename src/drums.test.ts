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

// The pattern is worked out from the slot rather than listed, so a bar that is
// not eight slots long is played by the same rule. In 3/4 that rule leaves the
// foot on two alone and the ride comes out as a jazz waltz is played:
// one, two and, three.
describe('a bar of 3/4', () => {
  const waltz = (swing: boolean) => {
    const out: string[][] = [];
    for (let slot = 0; slot < 6; slot++) {
      out.push(drumsForSlot(slot, swing).map((h) => (h.accent ? `${h.voice}!` : h.voice)));
    }
    return out;
  };

  it('rides every beat and closes the foot on two', () => {
    expect(waltz(false)).toEqual([
      ['ride'],            // 1
      [],
      ['ride!', 'hihat'],  // 2
      [],
      ['ride'],            // 3
      [],
    ]);
  });

  it('swings the eighth after two, and nowhere else', () => {
    expect(waltz(true)).toEqual([
      ['ride'],
      [],
      ['ride!', 'hihat'],
      ['ride'],            // the and of two
      ['ride'],
      [],
    ]);
  });
});

describe('a bar of 2/4', () => {
  it('has one backbeat, on two', () => {
    expect(drumsForSlot(0, false).map(h => h.voice)).toEqual(['ride']);
    expect(drumsForSlot(2, false).map(h => h.voice)).toEqual(['ride', 'hihat']);
  });
});
