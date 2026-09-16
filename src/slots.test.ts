import { describe, it, expect } from 'vitest';
import type { Chord } from './chord';
import { parseSong, SLOTS_PER_MEASURE } from './chord';
import {
  barAtSlot, buildTimeline, expandSong, measureRuns, slotRuns, splitToSlots, totalSlots,
} from './slots';

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
      ? song.measures[0].chords : [], SLOTS_PER_MEASURE);
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

// ---------------------------------------------------------------------------
// Bars that are not all the same length
// ---------------------------------------------------------------------------

describe('splitToSlots in other meters', () => {
  const rawOf = (chords: string, n: number) => {
    const m = parseSong(`|${chords}|`).measures[0];
    return splitToSlots(m.kind === 'chords' ? m.chords : [], n).map(s => s?.raw);
  };

  it('gives three chords a beat each in 3/4', () => {
    expect(rawOf('C D E', 6)).toEqual(['C', 'C', 'D', 'D', 'E', 'E']);
  });

  it('gives two chords a beat each in 2/4', () => {
    expect(rawOf('C D', 4)).toEqual(['C', 'C', 'D', 'D']);
  });

  // A count that does not divide the bar leaves the longer slots at the front.
  // This is what 4/4 has always done with three chords -- 3 + 3 + 2 -- and not
  // something the shorter bar introduced.
  it('leaves the longer slots at the front when the count does not divide', () => {
    expect(rawOf('C D E F', 6)).toEqual(['C', 'C', 'D', 'E', 'E', 'F']);
    expect(rawOf('C D E', 8)).toEqual(['C', 'C', 'C', 'D', 'D', 'D', 'E', 'E']);
  });
});

describe('expandSong across a change of meter', () => {
  it('gives each bar the slots its own meter asks for', () => {
    const ex = expandSong(parseSong('|T34 C|T44 D|T24 E|'), 0, -1);
    expect(ex.map(m => m.slots.length)).toEqual([6, 8, 4]);
    expect(ex.map(m => m.beats)).toEqual([3, 4, 2]);
  });

  // The sign is written once and stands, so a loop that starts after it still
  // has to be played in that meter. Resolving the meter when the sheet is
  // parsed is what makes this work: there is nothing left to walk back to.
  it('keeps the meter for a loop that starts past the sign', () => {
    const song = parseSong('|T34 C|D|E|F|');
    const ex = expandSong(song, 2, 3);
    expect(ex.map(m => m.beats)).toEqual([3, 3]);
    expect(ex.map(m => m.slots.length)).toEqual([6, 6]);
  });
});

describe('expandSong in meters counted in other notes', () => {
  it('measures a bar by its meter and not by its count', () => {
    const ex = expandSong(parseSong('|T22 C|T68 D|T38 E|T616 F|'), 0, -1);
    expect(ex.map(m => m.slots.length)).toEqual([8, 6, 3, 3]);
    // Quarter-note beats, the last one short where the meter does not fill it.
    expect(ex.map(m => m.beats)).toEqual([4, 3, 2, 2]);
  });
});

describe('buildTimeline', () => {
  const of = (sheet: string) => buildTimeline(expandSong(parseSong(sheet), 0, -1));

  it('adds bars of one meter up the way dividing used to', () => {
    const t = of('|C|D|E|');
    expect(t.slotAt).toEqual([0, 8, 16, 24]);
    expect(t.beatAt).toEqual([0, 4, 8, 12]);
    expect(totalSlots(t)).toBe(24);
  });

  it('adds up bars of mixed length', () => {
    const t = of('|C|T24 D|T34 E|T44 F|');
    expect(t.slotAt).toEqual([0, 8, 12, 18, 26]);
    expect(t.beatAt).toEqual([0, 4, 6, 9, 13]);
    expect(totalSlots(t)).toBe(26);
  });

  // A bar of 3/8 runs for three slots and gives two beats. The two are added
  // up separately on purpose: adding the beats up in slots would put every bar
  // after it half a beat late, and the playhead with it.
  it('adds a part-beat bar up by its slots, not by its beats', () => {
    const t = of('|T38 C|D|T44 E|');
    expect(t.slotAt).toEqual([0, 3, 6, 14]);
    expect(t.beatAt).toEqual([0, 2, 4, 8]);
    expect(totalSlots(t)).toBe(14);
  });

  it('has a run of no length for an empty sheet', () => {
    const t = buildTimeline([]);
    expect(totalSlots(t)).toBe(0);
  });
});

describe('barAtSlot', () => {
  const t = buildTimeline(expandSong(parseSong('|C|T24 D|T34 E|'), 0, -1));

  it('finds the bar a slot falls in', () => {
    expect(barAtSlot(t, 0)).toBe(0);
    expect(barAtSlot(t, 7)).toBe(0);
    expect(barAtSlot(t, 8)).toBe(1);   // the 2/4 bar starts here
    expect(barAtSlot(t, 11)).toBe(1);
    expect(barAtSlot(t, 12)).toBe(2);  // and the 3/4 bar here
    expect(barAtSlot(t, 17)).toBe(2);
  });

  it('holds at the last bar rather than running off the end', () => {
    expect(barAtSlot(t, 18)).toBe(2);
    expect(barAtSlot(t, 999)).toBe(2);
  });
});
