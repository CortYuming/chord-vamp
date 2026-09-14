import { describe, it, expect } from 'vitest';
import type { Chord } from './chord';
import { parseSong, SLOTS_PER_MEASURE } from './chord';
import { expandSong, splitToSlots, slotRuns, measureRuns } from './slots';

// The bass sounds on the beat slots only -- 0, 2, 4, 6 of the eight.
function bassOf(slots: (Chord | null)[]): (string | undefined)[] {
  return [0, 2, 4, 6].map((i) => slots[i]?.raw);
}

describe('expandSong', () => {
  it('expands plain measures to eight slots each', () => {
    const song = parseSong('|C|G|');
    const ex = expandSong(song, 0, -1);
    expect(ex).toHaveLength(2);
    expect(ex[0].slots).toHaveLength(SLOTS_PER_MEASURE);
    expect(ex[0].slots.every(s => s?.raw === 'C')).toBe(true);
    expect(ex[1].slots.every(s => s?.raw === 'G')).toBe(true);
  });

  it('splits two chords into 4+4 slots', () => {
    const song = parseSong('|C G|');
    const ex = expandSong(song, 0, -1);
    expect(ex[0].slots.map(s => s?.raw))
      .toEqual(['C', 'C', 'C', 'C', 'G', 'G', 'G', 'G']);
  });

  it('splits four chords into 2+2+2+2, one per beat', () => {
    const song = parseSong('|C D E F|');
    const ex = expandSong(song, 0, -1);
    expect(ex[0].slots.map(s => s?.raw))
      .toEqual(['C', 'C', 'D', 'D', 'E', 'E', 'F', 'F']);
  });

  it('keeps the old bass reading for four-chord bars', () => {
    const ex = expandSong(parseSong('|C D E F|'), 0, -1);
    expect(bassOf(ex[0].slots)).toEqual(['C', 'D', 'E', 'F']);
  });

  it('keeps the old bass reading for three-chord bars', () => {
    const ex = expandSong(parseSong('|C D E|'), 0, -1);
    expect(bassOf(ex[0].slots)).toEqual(['C', 'C', 'D', 'E']);
  });

  it('holds a chord that lands off the beat without sounding it', () => {
    // The bar that could not be written before: five chords, two of them
    // anticipations landing on the and of a beat.
    const ex = expandSong(parseSong('|Cm9 . . Gb13 F13 . F7+ Bb7|'), 0, -1);
    expect(ex[0].slots.map(s => s?.raw))
      .toEqual(['Cm9', 'Cm9', 'Cm9', 'Gb13', 'F13', 'F13', 'F7+', 'Bb7']);
    expect(bassOf(ex[0].slots)).toEqual(['Cm9', 'Cm9', 'F13', 'F7+']);
  });

  it('resolves % to previous measure', () => {
    const song = parseSong('|C|%|G|%|');
    const ex = expandSong(song, 0, -1);
    expect(ex[1].slots.every(s => s?.raw === 'C')).toBe(true);
    expect(ex[3].slots.every(s => s?.raw === 'G')).toBe(true);
  });

  it('resolves %% to two measures back', () => {
    const song = parseSong('|A|B|%%|%%|');
    const ex = expandSong(song, 0, -1);
    expect(ex[2].slots[0]?.raw).toBe('A');
    expect(ex[3].slots[0]?.raw).toBe('B');
  });

  it('resolves nested % chains', () => {
    const song = parseSong('|C|%|%|%|');
    const ex = expandSong(song, 0, -1);
    for (const m of ex.slice(1)) {
      expect(m.slots.every(s => s?.raw === 'C')).toBe(true);
    }
  });

  it('respects loop range', () => {
    const song = parseSong('|A|B|C|D|');
    const ex = expandSong(song, 1, 2);
    expect(ex).toHaveLength(2);
    expect(ex[0].sourceIndex).toBe(1);
    expect(ex[1].sourceIndex).toBe(2);
    expect(ex[0].slots[0]?.raw).toBe('B');
  });

  it('empty measure yields null slots', () => {
    const song = parseSong('|C||G|');
    const ex = expandSong(song, 0, -1);
    expect(ex[1].slots.every(s => s === null)).toBe(true);
  });
});

describe('splitToSlots', () => {
  it('takes the first eight when a bar is overfull', () => {
    const song = parseSong('|A B C D E F G A B C|');
    const slots = splitToSlots(song.measures[0].kind === 'chords'
      ? song.measures[0].chords : []);
    expect(slots).toHaveLength(SLOTS_PER_MEASURE);
    expect(slots.map(s => s?.raw)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'A']);
  });
});

describe('measureRuns', () => {
  const raws = (sheet: string) => measureRuns(parseSong(sheet).measures)
    .map((runs) => runs && runs.map((r) => [r.chord?.raw ?? null, r.span]));

  it('reads every bar of the sheet', () => {
    expect(raws('|C|C D E F|')).toEqual([
      [['C', 8]],
      [['C', 2], ['D', 2], ['E', 2], ['F', 2]],
    ]);
  });

  it('has nothing to draw for an empty bar or a repeat mark', () => {
    // The grid draws these as a dot and as a simile sign, not as chords, so
    // there are no runs to hand it and nothing for the layout to fit.
    expect(raws('|C||%|%%|')).toEqual([[['C', 8]], null, null, null]);
  });
});

describe('slotRuns', () => {
  const runsOf = (sheet: string) => {
    const ex = expandSong(parseSong(sheet), 0, -1);
    return slotRuns(ex[0].slots).map(r => [r.chord?.raw ?? null, r.start, r.span]);
  };

  it('reads a whole-bar chord as one run', () => {
    expect(runsOf('|C|')).toEqual([['C', 0, 8]]);
  });

  it('reads dots as continuation, not as separate chords', () => {
    // `|C|` and `|C . . .|` are the same bar and must draw the same.
    expect(runsOf('|C . . .|')).toEqual([['C', 0, 8]]);
  });

  it('gives each run a width equal to how long it is held', () => {
    expect(runsOf('|Cm9 . . Gb13 F13 . F7+ Bb7|')).toEqual([
      ['Cm9', 0, 3],
      ['Gb13', 3, 1],
      ['F13', 4, 2],
      ['F7+', 6, 1],
      ['Bb7', 7, 1],
    ]);
  });

  it('does not merge two separate bars-worth of the same name', () => {
    // Written out rather than dotted, C and C are distinct chords typed twice.
    expect(runsOf('|C C|')).toEqual([['C', 0, 4], ['C', 4, 4]]);
  });

  it('reads an empty bar as one null run', () => {
    expect(runsOf('|C||')[0]).toEqual(['C', 0, 8]);
    const ex = expandSong(parseSong('|C||'), 0, -1);
    expect(slotRuns(ex[1].slots)).toEqual([{ chord: null, start: 0, span: 8 }]);
  });
});
