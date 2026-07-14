import { describe, it, expect } from 'vitest';
import {
  parseChord,
  parseSong,
  transposeChord,
  chordToString,
  chordToDegree,
  noteLabel,
  NOTES_SHARP,
  NOTES_FLAT,
} from './chord';

describe('parseChord', () => {
  it('parses a plain triad', () => {
    const c = parseChord('C');
    expect(c).toEqual({ raw: 'C', root: 0, quality: '', bass: null });
  });

  it('parses sharp root', () => {
    expect(parseChord('F#m7')).toEqual({
      raw: 'F#m7',
      root: 6,
      quality: 'm7',
      bass: null,
    });
  });

  it('parses flat root', () => {
    expect(parseChord('Bb9')).toEqual({
      raw: 'Bb9',
      root: 10,
      quality: '9',
      bass: null,
    });
  });

  it('parses altered dominant', () => {
    expect(parseChord('D7#9')).toEqual({
      raw: 'D7#9',
      root: 2,
      quality: '7#9',
      bass: null,
    });
  });

  it('parses slash bass', () => {
    expect(parseChord('F/A')).toEqual({
      raw: 'F/A',
      root: 5,
      quality: '',
      bass: 9,
    });
  });

  it('parses slash bass with accidentals on both', () => {
    expect(parseChord('Bb/D')).toEqual({
      raw: 'Bb/D',
      root: 10,
      quality: '',
      bass: 2,
    });
  });

  it('parses complex qualities', () => {
    expect(parseChord('F13')?.root).toBe(5);
    expect(parseChord('F#m7b5')?.root).toBe(6);
    expect(parseChord('Cmaj7')?.quality).toBe('maj7');
    expect(parseChord('G7sus4')?.quality).toBe('7sus4');
    expect(parseChord('C7#9b13')?.quality).toBe('7#9b13');
  });

  it('accepts unicode accidentals', () => {
    expect(parseChord('B♭9')?.root).toBe(10);
    expect(parseChord('F♯m7')?.root).toBe(6);
  });

  it('rejects garbage', () => {
    expect(parseChord('')).toBeNull();
    expect(parseChord('xyz')).toBeNull();
    expect(parseChord('H')).toBeNull();
  });

  it('parses N.C. as no-chord', () => {
    const c = parseChord('N.C.');
    expect(c?.raw).toBe('N.C.');
    expect(c?.root).toBeNull();
  });
});

describe('transposeChord', () => {
  it('transposes root up', () => {
    expect(transposeChord('F13', 2, 'sharp')).toBe('G13');
    expect(transposeChord('Bb9', 2, 'sharp')).toBe('C9');
  });

  it('transposes root down', () => {
    expect(transposeChord('D7#9', -2, 'sharp')).toBe('C7#9');
  });

  it('respects prefer flat', () => {
    expect(transposeChord('C', 1, 'flat')).toBe('Db');
    expect(transposeChord('C', 1, 'sharp')).toBe('C#');
  });

  it('preserves quality including tensions', () => {
    expect(transposeChord('F#m7b5', 1, 'sharp')).toBe('Gm7b5');
  });

  it('transposes slash bass too', () => {
    expect(transposeChord('F/A', 2, 'sharp')).toBe('G/B');
    expect(transposeChord('Bb/D', 1, 'flat')).toBe('B/Eb');
  });

  it('wraps octave', () => {
    expect(transposeChord('B', 1, 'sharp')).toBe('C');
    expect(transposeChord('C', -1, 'flat')).toBe('B');
  });

  it('handles N.C.', () => {
    expect(transposeChord('N.C.', 5, 'sharp')).toBe('N.C.');
  });
});

describe('noteLabel', () => {
  it('returns sharp names by default', () => {
    expect(noteLabel(1, 'sharp')).toBe('C#');
    expect(noteLabel(3, 'sharp')).toBe('D#');
  });

  it('returns flat names when preferred', () => {
    expect(noteLabel(1, 'flat')).toBe('Db');
    expect(noteLabel(3, 'flat')).toBe('Eb');
  });

  it('naturals unchanged', () => {
    expect(noteLabel(0, 'sharp')).toBe('C');
    expect(noteLabel(0, 'flat')).toBe('C');
    expect(noteLabel(5, 'sharp')).toBe('F');
  });

  it('table shape', () => {
    expect(NOTES_SHARP).toHaveLength(12);
    expect(NOTES_FLAT).toHaveLength(12);
  });
});

describe('chordToString', () => {
  it('roundtrips simple chords', () => {
    const c = parseChord('Bb9')!;
    expect(chordToString(c, 'flat')).toBe('Bb9');
    expect(chordToString(c, 'sharp')).toBe('A#9');
  });

  it('includes slash bass', () => {
    const c = parseChord('F/A')!;
    expect(chordToString(c, 'sharp')).toBe('F/A');
  });
});

describe('chordToDegree', () => {
  it('tonic major', () => {
    const c = parseChord('C')!;
    expect(chordToDegree(c, 0, 0)).toBe('I');
  });

  it('dominant seventh in C', () => {
    const c = parseChord('G7')!;
    expect(chordToDegree(c, 0, 0)).toBe('V7');
  });

  it('minor uses lowercase', () => {
    const c = parseChord('Am7')!;
    expect(chordToDegree(c, 0, 0)).toBe('vim7');
  });

  it('maj7 stays uppercase', () => {
    const c = parseChord('Fmaj7')!;
    expect(chordToDegree(c, 0, 0)).toBe('IVmaj7');
  });

  it('flat degrees', () => {
    const c = parseChord('Db7')!;
    expect(chordToDegree(c, 0, 0)).toBe('bII7');
  });

  it('transposes correctly with key', () => {
    const c = parseChord('D')!;
    expect(chordToDegree(c, 2, 0)).toBe('I');
  });

  it('applies transpose offset', () => {
    const c = parseChord('C')!;
    expect(chordToDegree(c, 0, 2)).toBe('II');
  });

  it('slash bass in degrees', () => {
    const c = parseChord('C/E')!;
    expect(chordToDegree(c, 0, 0)).toBe('I/III');
  });

  it('dim/half-diminished', () => {
    const c = parseChord('Bm7b5')!;
    expect(chordToDegree(c, 0, 0)).toBe('viim7b5');
  });
});

describe('parseSong', () => {
  it('parses simple progression', () => {
    const s = parseSong('|F13|Bb9|F13|F13|');
    expect(s.measures).toHaveLength(4);
    expect(s.measures[0]).toEqual({
      kind: 'chords',
      chords: [{ raw: 'F13', root: 5, quality: '13', bass: null }],
    });
    expect(s.errors).toEqual([]);
  });

  it('parses multiple chords per measure', () => {
    const s = parseSong('|F13 D7#9|G7 C7#9|');
    expect(s.measures).toHaveLength(2);
    if (s.measures[0].kind === 'chords') {
      expect(s.measures[0].chords).toHaveLength(2);
      expect(s.measures[0].chords[0].raw).toBe('F13');
      expect(s.measures[0].chords[1].raw).toBe('D7#9');
    }
  });

  it('parses single-measure repeat %', () => {
    const s = parseSong('|F13|%|%|G7|');
    expect(s.measures[0].kind).toBe('chords');
    expect(s.measures[1].kind).toBe('repeat1');
    expect(s.measures[2].kind).toBe('repeat1');
    expect(s.measures[3].kind).toBe('chords');
  });

  it('parses two-measure repeat %%', () => {
    const s = parseSong('|F13|Bb9|%%|G7|');
    expect(s.measures[2].kind).toBe('repeat2');
  });

  it('tolerates leading/trailing pipes and whitespace', () => {
    expect(parseSong('|C|').measures).toHaveLength(1);
    expect(parseSong('C').measures).toHaveLength(1);
    expect(parseSong('|C |').measures).toHaveLength(1);
    expect(parseSong(' | C | G | ').measures).toHaveLength(2);
  });

  it('reports errors with measure index', () => {
    const s = parseSong('|C|???|G|');
    expect(s.errors.length).toBeGreaterThan(0);
    expect(s.errors[0]).toMatch(/measure 2/i);
  });

  it('ignores blank measures at edges but keeps interior', () => {
    const s = parseSong('|C||G|');
    expect(s.measures).toHaveLength(3);
    expect(s.measures[1].kind).toBe('chords');
    if (s.measures[1].kind === 'chords') {
      expect(s.measures[1].chords).toHaveLength(0);
    }
  });

  it('expands "." to the previous chord in the same measure', () => {
    const s = parseSong('|Bb13 . . E9|');
    expect(s.errors).toEqual([]);
    expect(s.measures).toHaveLength(1);
    if (s.measures[0].kind === 'chords') {
      const chords = s.measures[0].chords;
      expect(chords).toHaveLength(4);
      expect(chords[0].raw).toBe('Bb13');
      expect(chords[1].raw).toBe('Bb13');
      expect(chords[2].raw).toBe('Bb13');
      expect(chords[3].raw).toBe('E9');
    }
  });

  it('does not carry "." across bar lines', () => {
    const s = parseSong('|Bb13|. E9|');
    expect(s.errors.length).toBeGreaterThan(0);
    expect(s.errors[0]).toMatch(/measure 2/i);
    if (s.measures[1].kind === 'chords') {
      expect(s.measures[1].chords).toHaveLength(1);
      expect(s.measures[1].chords[0].raw).toBe('E9');
    }
  });
});
