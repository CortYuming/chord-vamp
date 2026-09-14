import { describe, it, expect } from 'vitest';
import { chordTones, scaleFor, degreeLabel } from './tones';
import { parseChord } from './chord';

const tonesOf = (q: string) => chordTones(q).tones;

describe('chordTones', () => {
  it('resolves the plain qualities', () => {
    expect(tonesOf('')).toEqual([0, 4, 7]);
    expect(tonesOf('m')).toEqual([0, 3, 7]);
    expect(tonesOf('7')).toEqual([0, 4, 7, 10]);
    expect(tonesOf('m7')).toEqual([0, 3, 7, 10]);
    expect(tonesOf('maj7')).toEqual([0, 4, 7, 11]);
    expect(tonesOf('dim7')).toEqual([0, 3, 6, 9]);
  });

  it('prefers the longest matching quality', () => {
    expect(tonesOf('m7b5')).toEqual([0, 3, 6, 10]);   // not m7 + b5
    expect(tonesOf('13sus4')).toEqual([0, 2, 5, 7, 9, 10]);
  });

  it('spells the extended dominants', () => {
    expect(tonesOf('9')).toEqual([0, 2, 4, 7, 10]);
    expect(tonesOf('13')).toEqual([0, 2, 4, 5, 7, 9, 10]);
  });

  it('reads alterations written after the quality', () => {
    expect(tonesOf('7#9')).toEqual([0, 3, 4, 7, 10]);
    expect(tonesOf('7b9')).toEqual([0, 1, 4, 7, 10]);
    expect(chordTones('7#9').tensions).toEqual([{ n: 9, sign: '♯', adjusted: 3 }]);
  });

  it('lets an altered fifth replace the natural one', () => {
    expect(tonesOf('7b5')).toEqual([0, 4, 6, 10]);
    expect(tonesOf('7#5')).toEqual([0, 4, 8, 10]);
  });

  it('expands alt to all four alterations', () => {
    expect(tonesOf('7alt')).toEqual([0, 1, 3, 4, 6, 8, 10]);
  });

  it('accepts the unicode accidentals the parser leaves in place', () => {
    expect(tonesOf('7♯9')).toEqual(tonesOf('7#9'));
  });

  it('falls back to a major triad on nonsense', () => {
    expect(tonesOf('zzz')).toEqual([0, 4, 7]);
  });
});

describe('scaleFor', () => {
  it('picks a scale from the chord tones alone', () => {
    expect(scaleFor('7').name).toBe('mixolydian');
    expect(scaleFor('m7').name).toBe('dorian');
    expect(scaleFor('maj7').name).toBe('ionian');
    expect(scaleFor('m7b5').name).toBe('locrian');
    expect(scaleFor('dim7').name).toBe('wholeHalf');
    expect(scaleFor('mM7').name).toBe('melodicMinor');
  });

  it('goes altered when the symbol spells an alteration', () => {
    expect(scaleFor('7#9').name).toBe('altered');
    expect(scaleFor('7b9').name).toBe('altered');
    expect(scaleFor('7alt').name).toBe('altered');
  });

  it('leaves a plain dominant alone', () => {
    expect(scaleFor('13').name).toBe('mixolydian');
    expect(scaleFor('7sus4').name).toBe('mixolydian');
  });

  it('returns seven notes for the modes', () => {
    expect(scaleFor('7').notes).toHaveLength(7);
    expect(scaleFor('dim7').notes).toHaveLength(8);
  });
});

describe('degreeLabel', () => {
  it('names the plain degrees', () => {
    expect(degreeLabel(0, '7')).toBe('R');
    expect(degreeLabel(4, '7')).toBe('3');
    expect(degreeLabel(10, '7')).toBe('♭7');
  });

  it('spells an alteration as the symbol writes it', () => {
    expect(degreeLabel(3, '7#9')).toBe('♯9');
    expect(degreeLabel(3, '7')).toBe('♭3');
    expect(degreeLabel(1, '7b9')).toBe('♭9');
  });

  it('wears ♯5 on a dominant and ♭6 on a minor chord', () => {
    expect(degreeLabel(8, '7')).toBe('♯5');
    expect(degreeLabel(8, 'm7')).toBe('♭6');
  });

  it('names the diminished seventh as a double flat', () => {
    expect(degreeLabel(9, 'dim7')).toBe('♭♭7');
    expect(degreeLabel(9, '13')).toBe('6');
  });
});

describe('with the real parser', () => {
  it('resolves a bar of jazz blues', () => {
    const cases: [string, number[]][] = [
      ['Bb7', [10, 2, 5, 8]],
      ['Eb7', [3, 7, 10, 1]],
      ['Fm7', [5, 8, 0, 3]],
      ['G7#9', [7, 10, 11, 2, 5]],
      ['Cm7', [0, 3, 7, 10]],
    ];
    for (const [sym, expected] of cases) {
      const c = parseChord(sym);
      expect(c, sym).not.toBeNull();
      const abs = chordTones(c!.quality).tones
        .map((t) => (c!.root! + t) % 12)
        .sort((a, b) => a - b);
      expect(abs, sym).toEqual([...expected].sort((a, b) => a - b));
    }
  });
});

// The triangle comes in two characters that look alike: `Δ` (U+0394, the Greek
// letter) and `∆` (U+2206, what a keyboard gives). A sheet written with either
// is the same chord.
describe('the major-seventh triangle', () => {
  it('reads both spellings of the triangle as maj7', () => {
    expect(chordTones('∆').tones).toEqual(chordTones('Δ').tones);
    expect(chordTones('∆7').tones).toEqual(chordTones('maj7').tones);
    expect(chordTones('∆9').tones).toEqual(chordTones('maj9').tones);
  });

  it('keeps the seventh a major seventh', () => {
    expect(chordTones('∆').tones).toContain(11);
  });
});
