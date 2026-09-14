import { describe, it, expect } from 'vitest';
import { parseSong } from './chord';
import { expandSong } from './slots';
import {
  BASS_RANGE,
  beatChords,
  coreTones,
  generateBassLine,
  nearestPitch,
  pitchClass,
  segments,
} from './bass';

function lineFor(sheet: string): (number | null)[] {
  return generateBassLine(expandSong(parseSong(sheet), 0, -1));
}

describe('nearestPitch', () => {
  it('picks the octave closest to where the line already is', () => {
    // C is 36 and 48 inside the range; from 45 the higher one is nearer.
    expect(nearestPitch(0, 45, BASS_RANGE)).toBe(48);
    expect(nearestPitch(0, 37, BASS_RANGE)).toBe(36);
  });

  it('stays inside the range', () => {
    for (let pc = 0; pc < 12; pc++) {
      const midi = nearestPitch(pc, BASS_RANGE.min, BASS_RANGE);
      expect(midi).toBeGreaterThanOrEqual(BASS_RANGE.min);
      expect(midi).toBeLessThanOrEqual(BASS_RANGE.max);
    }
  });
});

describe('coreTones', () => {
  it('takes third, fifth and seventh out of a dominant', () => {
    expect(coreTones('7')).toEqual([4, 7, 10]);
  });

  it('leaves the tensions of a 13th chord alone', () => {
    // 13 is [0,2,4,5,7,9,10]: the 9th, 11th and 13th are not bass notes.
    expect(coreTones('13')).toEqual([4, 7, 10]);
  });

  it('reads the fourth of a sus chord as its third', () => {
    expect(coreTones('7sus4')).toEqual([5, 7, 10]);
  });

  it('keeps an altered fifth when there is no perfect one', () => {
    expect(coreTones('7b5')).toEqual([4, 6, 10]);
  });

  it('takes the sixth of a 6 chord as its seventh', () => {
    expect(coreTones('6')).toEqual([4, 7, 9]);
  });

  it('reads a diminished seventh as its own three notes', () => {
    expect(coreTones('dim7')).toEqual([3, 6, 9]);
  });
});

describe('beatChords and segments', () => {
  it('reads one chord per beat, ignoring what lands off it', () => {
    const ex = expandSong(parseSong('|Bb13 . . . . . E9 .|'), 0, -1);
    expect(beatChords(ex).map((c) => c?.raw)).toEqual(['Bb13', 'Bb13', 'Bb13', 'E9']);
  });

  it('groups beats holding the same chord, however it was typed', () => {
    const ex = expandSong(parseSong('|C|C . . .|'), 0, -1);
    const segs = segments(beatChords(ex));
    expect(segs).toHaveLength(1);
    expect(segs[0].length).toBe(8);
  });

  it('splits a bar of two chords into two runs', () => {
    const segs = segments(beatChords(expandSong(parseSong('|Dm7 G7|'), 0, -1)));
    expect(segs.map((s) => [s.start, s.length])).toEqual([[0, 2], [2, 2]]);
  });
});

describe('generateBassLine', () => {
  it('states the root on the first beat of a chord', () => {
    const line = lineFor('|C|F|');
    expect(pitchClass(line[0]!)).toBe(0);
    expect(pitchClass(line[4]!)).toBe(5);
  });

  it('walks instead of repeating the root four times', () => {
    const line = lineFor('|C|F|');
    const bar = line.slice(0, 4);
    expect(new Set(bar).size).toBeGreaterThan(1);
  });

  it('approaches the next root by a step or from its dominant', () => {
    const line = lineFor('|C|F|');
    const approach = pitchClass(line[3]!);
    const nextRoot = 5;
    expect([
      pitchClass(nextRoot + 1),
      pitchClass(nextRoot - 1),
      pitchClass(nextRoot + 7),
    ]).toContain(approach);
  });

  it('approaches the top of the loop from the last beat', () => {
    const line = lineFor('|C|F|');
    const approach = pitchClass(line[7]!);
    expect([1, 11, 7]).toContain(approach);
  });

  it('plays the root alone when the chord lasts one beat', () => {
    const line = lineFor('|C D E F|');
    expect(line.map((m) => pitchClass(m!))).toEqual([0, 2, 4, 5]);
  });

  it('keeps every note inside the bass range', () => {
    const line = lineFor('|Bb13|Eb9|Bb7|Fm7 Bb7+5+9|Eb9|Edim7|Bb7 G7b5|C7sus4|');
    for (const midi of line) {
      expect(midi).not.toBeNull();
      expect(midi!).toBeGreaterThanOrEqual(BASS_RANGE.min);
      expect(midi!).toBeLessThanOrEqual(BASS_RANGE.max);
    }
  });

  it('never leaps more than a tritone between beats', () => {
    const line = lineFor('|Bb13|Eb9|Bb7|Fm7 Bb7+5+9|Eb9|F7#9|Bb7|Ab13 Db13|');
    for (let i = 1; i < line.length; i++) {
      expect(Math.abs(line[i]! - line[i - 1]!)).toBeLessThanOrEqual(6);
    }
  });

  it('gives the same sheet the same line every time', () => {
    const sheet = '|Cm9 . . Gb13 F13 . F7+ Bb7|Bb9 . . . G7b5 . . .|';
    expect(lineFor(sheet)).toEqual(lineFor(sheet));
  });

  it('states the bass of a slash chord, not the chord root', () => {
    const line = lineFor('|C/E|F|');
    expect(pitchClass(line[0]!)).toBe(4);
  });

  it('rests over N.C. and over an empty bar', () => {
    expect(lineFor('|N.C.|C|').slice(0, 4)).toEqual([null, null, null, null]);
    expect(lineFor('||C|').slice(0, 4)).toEqual([null, null, null, null]);
  });

  it('returns nothing for an empty sheet', () => {
    expect(generateBassLine([])).toEqual([]);
  });

  it('walks a sheet of one chord without anywhere to go', () => {
    const line = lineFor('|C|');
    expect(line).toHaveLength(4);
    expect(pitchClass(line[0]!)).toBe(0);
    // The loop comes back to C, so the last beat still approaches it.
    expect([1, 11, 7]).toContain(pitchClass(line[3]!));
  });
});
