import { describe, it, expect } from 'vitest';
import {
  beatsOfMeter,
  prettyAccidentals,
  DEFAULT_METER,
  KEY_CHOICES,
  keyChoiceByLabel,
  keyChoiceFor,
  NOTES_FLAT,
  NOTES_SHARP,
  chordDegreeRoot,
  chordToDegree,
  firstChordRoot,
  chordToString,
  noteLabel,
  parseChord,
  parseSong,
  meterFitsSlots,
  meterLabel,
  readMeter,
  resolveKeyRoot,
  sameMeter,
  slotsOf,
  transposeChord,
  transposeSong,
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

  it('leaves the quality to the chord name below it', () => {
    const c = parseChord('G7')!;
    expect(chordToDegree(c, 0, 0)).toBe('V');
  });

  it('minor uses lowercase', () => {
    const c = parseChord('Am7')!;
    expect(chordToDegree(c, 0, 0)).toBe('vi');
  });

  it('maj7 stays uppercase', () => {
    const c = parseChord('Fmaj7')!;
    expect(chordToDegree(c, 0, 0)).toBe('IV');
  });

  // Written with the sign, like the chord name it sits over.
  it('flat degrees', () => {
    const c = parseChord('Db7')!;
    expect(chordToDegree(c, 0, 0)).toBe('♭II');
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

  it('keeps the bass while dropping the quality', () => {
    const c = parseChord('C7/G')!;
    expect(chordToDegree(c, 0, 0)).toBe('I/V');
  });

  it('reads the bass as a degree of the key, not of the chord', () => {
    // Nashville writes the note after the slash as a scale degree: in Bb,
    // C7/G is the II chord over the key's sixth.
    const c = parseChord('C7/G')!;
    expect(chordToDegree(c, 10, 0)).toBe('II/VI');
  });

  it('dim/half-diminished', () => {
    const c = parseChord('Bm7b5')!;
    expect(chordToDegree(c, 0, 0)).toBe('vii');
  });
});

describe('parseSong', () => {
  it('parses simple progression', () => {
    const s = parseSong('|F13|Bb9|F13|F13|');
    expect(s.measures).toHaveLength(4);
    expect(s.measures[0]).toEqual({
      kind: 'chords',
      chords: [{ raw: 'F13', root: 5, quality: '13', bass: null }],
      meter: DEFAULT_METER,
      meterMark: false,
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

describe('chordDegreeRoot', () => {
  it('gives the numeral alone', () => {
    const bb7 = parseChord('Bb7')!;
    expect(chordDegreeRoot(bb7, 10, 0)).toBe('I');
    expect(chordToDegree(bb7, 10, 0)).toBe('I');
  });

  it('drops the bass the joined form keeps', () => {
    // The strip is one column per slot: a slash would not fit, and the name
    // above it already carries the bass note.
    const c = parseChord('C/E')!;
    expect(chordDegreeRoot(c, 0, 0)).toBe('I');
    expect(chordToDegree(c, 0, 0)).toBe('I/III');
  });

  it('lowercases a minor chord, as the grid form does', () => {
    expect(chordDegreeRoot(parseChord('Cm7')!, 10, 0)).toBe('ii');
    expect(chordDegreeRoot(parseChord('G7#9')!, 10, 0)).toBe('VI');
  });

  it('reads through a transpose', () => {
    expect(chordDegreeRoot(parseChord('F7')!, 10, 0)).toBe('V');
    // +2 puts F on G, which against C is still a fifth.
    expect(chordDegreeRoot(parseChord('F7')!, 0, 2)).toBe('V');
  });

  it('holds the degree steady when the key moves with the transpose', () => {
    // App derives displayedKey from the first chord plus the transpose, so a
    // transposed song must read as the same numerals it did before.
    const f7 = parseChord('F7')!;
    expect(chordDegreeRoot(f7, 10, 0)).toBe(chordDegreeRoot(f7, 0, 2));
  });
});

describe('firstChordRoot', () => {
  it('takes the root of the opening chord', () => {
    expect(firstChordRoot(parseSong('|F13|Bb9|').measures)).toBe(5);
  });

  it('skips a measure that carries no rooted chord', () => {
    expect(firstChordRoot(parseSong('|N.C.|Bb9|').measures)).toBe(10);
  });

  it('falls back on C when nothing has a root', () => {
    expect(firstChordRoot(parseSong('|N.C.|').measures)).toBe(0);
  });
});

describe('resolveKeyRoot', () => {
  const autumnLeaves = parseSong('|Am7b5|D7|Gm7|Gm7|').measures;

  it('infers the tonic from the first chord when none is pinned', () => {
    expect(resolveKeyRoot(null, autumnLeaves)).toBe(9);
    expect(resolveKeyRoot(undefined, autumnLeaves)).toBe(9);
  });

  it('honours a pinned tonic over the first chord', () => {
    // The tune is in G minor even though it opens on iim7b5.
    expect(resolveKeyRoot(7, autumnLeaves)).toBe(7);
  });

  it('treats a pinned C as a pin, not as absent', () => {
    expect(resolveKeyRoot(0, autumnLeaves)).toBe(0);
  });

  it('turns the opening chord into i once the tonic is pinned', () => {
    const am7b5 = parseChord('Am7b5')!;
    expect(chordDegreeRoot(am7b5, resolveKeyRoot(null, autumnLeaves), 0)).toBe('i');
    expect(chordDegreeRoot(am7b5, resolveKeyRoot(7, autumnLeaves), 0)).toBe('ii');
  });
});

describe('transposeSong', () => {
  it('moves every chord and keeps the bar lines', () => {
    expect(transposeSong('|F13|Bb9|F13|', 3, 'flat')).toBe('|Ab13|Db9|Ab13|');
  });

  it('leaves repeats and within-bar dots alone', () => {
    expect(transposeSong('|C|%|%%|Bb13 . . E9|', 2, 'sharp'))
      .toBe('|D|%|%%|C13 . . F#9|');
  });

  it('keeps the spacing and line breaks the user typed', () => {
    const src = '|C   G|\n|Am  F|';
    expect(transposeSong(src, 1, 'flat')).toBe('|Db   Ab|\n|Bbm  Gb|');
  });

  it('spells the result for the key it lands in', () => {
    expect(transposeSong('|C|', 1, 'flat')).toBe('|Db|');
    expect(transposeSong('|C|', 1, 'sharp')).toBe('|C#|');
  });

  it('carries a slash bass along', () => {
    expect(transposeSong('|C/E|', 5, 'flat')).toBe('|F/A|');
  });

  it('hands back anything it cannot parse', () => {
    expect(transposeSong('|N.C.|C|', 2, 'sharp')).toBe('|N.C.|D|');
    expect(transposeSong('|zzz|C|', 2, 'sharp')).toBe('|zzz|D|');
  });

  it('is a no-op at zero semitones, spelling aside', () => {
    expect(transposeSong('|F13|Bb9|', 0, 'flat')).toBe('|F13|Bb9|');
  });

  it('holds the degrees still, which is the point of a hard transpose', () => {
    // A blues in F rewritten into Ab: the numerals must not budge.
    const src = '|F13|Bb9|F13|D7#9|';
    const moved = transposeSong(src, 3, 'flat');
    const degrees = (text: string, key: number) =>
      parseSong(text).measures.flatMap(m =>
        m.kind === 'chords' ? m.chords.map(c => chordDegreeRoot(c, key, 0)) : []);
    expect(degrees(moved, 8)).toEqual(degrees(src, 5));
  });
});

// The key list is yt-loop's, entry for entry: a sheet transcribed there and
// played here has to be named the same in both, and a key missing from one of
// the two lists is a sheet that cannot say what it is in.
describe('KEY_CHOICES', () => {
  const spellings = (minor: boolean) =>
    KEY_CHOICES.filter(k => k.minor === minor).map(k => k.label);

  it('holds the twelve majors yt-loop offers, in its order', () => {
    expect(spellings(false)).toEqual(
      ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'],
    );
  });

  it('holds the twelve minors yt-loop offers, in its order', () => {
    expect(spellings(true)).toEqual(
      ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm'],
    );
  });

  // Where do sits. yt-loop counts a minor key from its relative major, and the
  // degrees under a chord have to come out the same in both apps.
  it('counts a minor key from its relative major', () => {
    expect(keyChoiceByLabel('Am')?.tonic).toBe(0);
    expect(keyChoiceByLabel('F#m')?.tonic).toBe(9);
    expect(keyChoiceByLabel('Ebm')?.tonic).toBe(6);
    expect(keyChoiceByLabel('Bb')?.tonic).toBe(10);
  });

  it('reads the spellings a link can carry', () => {
    expect(keyChoiceByLabel('F♯m')?.label).toBe('F#m');
    expect(keyChoiceByLabel(' bb ')?.label).toBe('Bb');
    expect(keyChoiceByLabel('H')).toBeNull();
    expect(keyChoiceByLabel('')).toBeNull();
  });

  // A tonic belongs to two entries -- a major and its relative minor -- so which
  // one a sheet is on is carried, not guessed.
  it('picks the entry a sheet is being read as', () => {
    expect(keyChoiceFor(0, false).label).toBe('C');
    expect(keyChoiceFor(0, true).label).toBe('Am');
    expect(keyChoiceFor(9, true).label).toBe('F#m');
  });
});

// ---------------------------------------------------------------------------
// Time signatures
//
// Written as `T34` at the head of a bar and standing from there until another
// one is written, which is how a stave carries the sign.
// ---------------------------------------------------------------------------

describe('readMeter', () => {
  it('reads the quarter-note meters', () => {
    expect(readMeter('T24')).toEqual({ num: 2, den: 4 });
    expect(readMeter('T34')).toEqual({ num: 3, den: 4 });
    expect(readMeter('T44')).toEqual({ num: 4, den: 4 });
    expect(readMeter('T54')).toEqual({ num: 5, den: 4 });
  });

  // The count and the note run together, so the note is what comes off the
  // end. No two note values split one token two ways -- 28 is not a note, and
  // neither is 6 -- so there is nothing to guess at.
  it('reads the other note values, count and all', () => {
    expect(readMeter('T22')).toEqual({ num: 2, den: 2 });
    expect(readMeter('T38')).toEqual({ num: 3, den: 8 });
    expect(readMeter('T68')).toEqual({ num: 6, den: 8 });
    expect(readMeter('T128')).toEqual({ num: 12, den: 8 });
    expect(readMeter('T216')).toEqual({ num: 2, den: 16 });
    expect(readMeter('T1216')).toEqual({ num: 12, den: 16 });
  });

  it('reads the two-digit counts yt-loop can write', () => {
    expect(readMeter('T994')).toEqual({ num: 99, den: 4 });
  });

  it('refuses a note value nobody counts in', () => {
    expect(readMeter('T36')).toBeNull();
    expect(readMeter('T31')).toBeNull();
  });

  // The note comes off the end, so a token that looks like a thirty-second is
  // read as a two -- `T332` is 33/2. Worth pinning down rather than leaving to
  // be discovered: it is the one place the notation surprises a reader, and
  // yt-loop reads it the same way.
  it('takes the note off the end and leaves the rest as the count', () => {
    expect(readMeter('T332')).toEqual({ num: 33, den: 2 });
    expect(readMeter('T164')).toEqual({ num: 16, den: 4 });
  });

  it('refuses a bar of no beats', () => {
    // A signature rules on, so a bar of nought beats would be followed by a
    // sheet of them. Read as a chord by that name instead.
    expect(readMeter('T04')).toBeNull();
  });

  it('is not a chord', () => {
    expect(parseChord('T44')).toBeNull();
    expect(parseChord('T128')).toBeNull();
  });
});

// The app reads and plays a bar over eighth-note slots. A meter that does not
// land on them is refused rather than rounded onto them -- and only an odd
// count of sixteenths comes out that way.
describe('meterFitsSlots', () => {
  it('takes every half, quarter and eighth meter', () => {
    for (const t of ['T22', 'T32', 'T34', 'T54', 'T38', 'T68', 'T78', 'T128']) {
      expect(meterFitsSlots(readMeter(t)!)).toBe(true);
    }
  });

  it('takes an even count of sixteenths and refuses an odd one', () => {
    expect(meterFitsSlots(readMeter('T616')!)).toBe(true);
    expect(meterFitsSlots(readMeter('T1216')!)).toBe(true);
    expect(meterFitsSlots(readMeter('T316')!)).toBe(false);
    expect(meterFitsSlots(readMeter('T516')!)).toBe(false);
  });
});

describe('sameMeter', () => {
  it('tells apart two meters of the same length', () => {
    // 2/4 and 4/8 run for the same time and are not the same bar.
    expect(sameMeter({ num: 2, den: 4 }, { num: 4, den: 8 })).toBe(false);
    expect(sameMeter({ num: 2, den: 4 }, { num: 2, den: 4 })).toBe(true);
  });
});

// The beats the bass plays from and the count strikes: quarter notes, with the
// last one short where the meter does not fill it.
describe('beatsOf', () => {
  const beats = (t: string) => beatsOfMeter(readMeter(t)!);

  it('counts a quarter-note meter as it is written', () => {
    expect(beats('T34')).toBe(3);
    expect(beats('T44')).toBe(4);
  });

  it('counts the other meters in quarters, rounding a part-beat up', () => {
    expect(beats('T22')).toBe(4);
    expect(beats('T68')).toBe(3);
    // A beat and a half. The half is still a place the bass plays from.
    expect(beats('T38')).toBe(2);
    expect(beats('T18')).toBe(1);
  });
});

describe('parseSong with time signatures', () => {
  const metersOf = (sheet: string) =>
    parseSong(sheet).measures.map(m => meterLabel(m.meter));
  const marksOf = (sheet: string) => parseSong(sheet).measures.map(m => m.meterMark);

  it('reads a sheet with no sign at all as 4/4', () => {
    expect(metersOf('|C|D|')).toEqual(['4/4', '4/4']);
    expect(marksOf('|C|D|')).toEqual([false, false]);
  });

  it('holds the meter from where it is written until it changes', () => {
    expect(metersOf('|T34 C|D|T44 E|F|')).toEqual(['3/4', '3/4', '4/4', '4/4']);
  });

  it('marks only the bar that declared it, which is the bar that draws it', () => {
    expect(marksOf('|T34 C|D|T44 E|F|')).toEqual([true, false, true, false]);
  });

  it('gives a bar the slots its meter asks for', () => {
    const { measures } = parseSong('|T24 C|T34 D|T44 E|');
    expect(measures.map(slotsOf)).toEqual([4, 6, 8]);
  });

  it('measures the other note values over the same slots', () => {
    // Two slots to the quarter, whatever the beat is written as: 2/2 is a bar
    // of four quarters, 3/8 a bar of three eighths.
    const { measures } = parseSong('|T22 C|T68 D|T38 E|T616 F|');
    expect(measures.map(slotsOf)).toEqual([8, 6, 3, 3]);
  });

  it('refuses a meter that does not land on the slots', () => {
    const s = parseSong('|T316 C|');
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]).toContain('does not divide');
    // The bar is still read, in the meter that was in force.
    expect(metersOf('|T316 C|')).toEqual(['4/4']);
  });

  it('carries the meter into empty bars and repeat marks', () => {
    expect(metersOf('|T34 C|%|')).toEqual(['3/4', '3/4']);
    expect(metersOf('|T34 C||')).toEqual(['3/4', '3/4']);
  });

  it('wants the sign at the head of the bar, where it is engraved', () => {
    const s = parseSong('|C T34 D|');
    expect(s.errors).toEqual([
      'measure 1: a time signature belongs at the head of the bar',
    ]);
    // The bar is still read; the sign is what was refused.
    expect(meterLabel(s.measures[0].meter)).toBe('4/4');
  });

  it('says so when the sign is one it cannot read', () => {
    const s = parseSong('|T36 C|');
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]).toContain('not a time signature');
    expect(meterLabel(s.measures[0].meter)).toBe('4/4');
  });

  // A repeat sign copies the bar before it, and four chords do not fit a bar
  // of three beats. A stave does not write one across a change of meter
  // either, so this is the sheet being wrong rather than something to rescale.
  it('refuses a repeat mark that reaches across a change of meter', () => {
    const s = parseSong('|C D E F|T34 %|');
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]).toContain('repeats');
  });

  it('refuses a repeat mark across two meters of the same length', () => {
    // 2/4 and 4/8 run for the same time. A stave still does not write a repeat
    // sign across the change, and the bar underneath is not the same bar.
    const s = parseSong('|T24 C D|T48 %|');
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]).toContain('repeats');
  });

  it('allows a repeat mark where the meter has not changed', () => {
    expect(parseSong('|T34 C D E|%|').errors).toEqual([]);
    expect(parseSong('|T34 C D E|%|%%|').errors).toEqual([]);
  });

  it('counts an overfull bar against its own meter', () => {
    const s = parseSong('|T24 A B C D E|');
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]).toContain('5 chords in one bar of 2/4');
    // The same five chords are nothing to complain about in 4/4.
    expect(parseSong('|A B C D E|').errors).toEqual([]);
  });

  it('leaves the sign alone when the sheet is transposed', () => {
    expect(transposeSong('|T34 Cm7|T24 F7 Bb/D|', 2, 'sharp'))
      .toBe('|T34 Dm7|T24 G7 C/E|');
    expect(transposeSong('|T128 Cm7|T216 F7|', 2, 'sharp'))
      .toBe('|T128 Dm7|T216 G7|');
  });

  // What yt-loop writes out is what is read here: the bars it found short are
  // signed, and the rest carry on in the meter in force.
  it('reads a sheet yt-loop wrote with mixed meters', () => {
    const s = parseSong('|C|T24 Dm7|T44 G7|T38 C|Am7|');
    expect(s.errors).toEqual([]);
    expect(s.measures.map(slotsOf)).toEqual([8, 4, 8, 3, 3]);
    expect(s.measures.map(m => m.meterMark))
      .toEqual([false, true, true, true, false]);
  });
});

describe('prettyAccidentals', () => {
  it('sets a root the way it is read', () => {
    expect(prettyAccidentals('Bb7')).toBe('B♭7');
    expect(prettyAccidentals('F#m7')).toBe('F♯m7');
  });

  it('sets an altered tension too', () => {
    expect(prettyAccidentals('C#m7b5')).toBe('C♯m7♭5');
    expect(prettyAccidentals('G7b9')).toBe('G7♭9');
    expect(prettyAccidentals('Eb13b9')).toBe('E♭13♭9');
  });

  it('sets the bass after a slash', () => {
    expect(prettyAccidentals('Db/Ab')).toBe('D♭/A♭');
  });

  // The b of a quality is a letter, not a sign: the one in sub and the one in
  // a name nobody expected still have to come out the other side.
  it('leaves a lowercase b that is not an accidental alone', () => {
    expect(prettyAccidentals('Cmaj7')).toBe('Cmaj7');
    expect(prettyAccidentals('N.C.')).toBe('N.C.');
  });

  // What goes into a link, a sheet or storage is the ASCII this undoes.
  it('is the other half of what parseChord accepts', () => {
    const pretty = prettyAccidentals('Bbmaj7#11');
    expect(pretty).toBe('B♭maj7♯11');
    const { raw, ...read } = parseChord(pretty)!;
    expect(raw).toBe(pretty);
    const { raw: _ascii, ...same } = parseChord('Bbmaj7#11')!;
    expect(read).toEqual(same);
  });
});
