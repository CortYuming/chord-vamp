export const NOTES_SHARP = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;

export const NOTES_FLAT = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
] as const;

// Canonical spelling of each key (0-11). Jazz/pop convention:
// flat keys → flat labels, sharp keys → sharp labels.
// C is neutral; we default to sharp accidentals for chromatic tones.
export const KEY_NAMES = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
] as const;

const ROOT_MAP: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/**
 * The keys on offer, and how they are spelled -- the same list yt-loop puts in
 * its own Key select, in the same order, so a sheet read in one app is named
 * the same in the other.
 *
 * `tonic` is where do sits, which for a minor key is its relative major: yt-loop
 * counts Am from C, and the two apps have to count from the same place or the
 * degrees under a chord say different things about one sheet.
 *
 * `label` is the spelling that travels in a link (`Bb`, `F#m`); `text` is the
 * spelling a reader gets (`B♭`, `F♯m`).
 */
export interface KeyChoice {
  label: string;
  text: string;
  tonic: number;
  minor: boolean;
}

const MAJOR_KEYS: [string, string][] = [
  ['C', 'C'], ['G', 'G'], ['D', 'D'], ['A', 'A'], ['E', 'E'], ['B', 'B'],
  ['F#', 'F♯'], ['Db', 'D♭'], ['Ab', 'A♭'], ['Eb', 'E♭'], ['Bb', 'B♭'], ['F', 'F'],
];

const MINOR_KEYS: [string, string][] = [
  ['Am', 'Am'], ['Em', 'Em'], ['Bm', 'Bm'], ['F#m', 'F♯m'], ['C#m', 'C♯m'], ['G#m', 'G♯m'],
  ['Ebm', 'E♭m'], ['Bbm', 'B♭m'], ['Fm', 'Fm'], ['Cm', 'Cm'], ['Gm', 'Gm'], ['Dm', 'Dm'],
];

function keyTonic(label: string, minor: boolean): number {
  const letter = label[0].toUpperCase();
  const sign = label[1] === '#' ? 1 : label[1] === 'b' ? -1 : 0;
  const semi = (ROOT_MAP[letter] + sign + 12) % 12;
  return minor ? (semi + 3) % 12 : semi;
}

export const KEY_CHOICES: KeyChoice[] = [
  ...MAJOR_KEYS.map(([label, text]) => ({ label, text, tonic: keyTonic(label, false), minor: false })),
  ...MINOR_KEYS.map(([label, text]) => ({ label, text, tonic: keyTonic(label, true), minor: true })),
];

/** The key a link names, or null for a spelling this list does not hold. */
export function keyChoiceByLabel(label: string): KeyChoice | null {
  const want = normalizeAccidental(label.trim());
  return KEY_CHOICES.find(k => k.label.toLowerCase() === want.toLowerCase()) ?? null;
}

/**
 * Which entry a sheet is sitting on. Two entries share every tonic -- a major
 * key and its relative minor are one set of notes -- so which of the pair is
 * meant is carried alongside rather than worked out from the music.
 */
export function keyChoiceFor(tonic: number, minor: boolean): KeyChoice {
  const semi = ((tonic % 12) + 12) % 12;
  return KEY_CHOICES.find(k => k.tonic === semi && k.minor === minor)
    ?? KEY_CHOICES.find(k => k.tonic === semi)!;
}

export type Accidental = 'sharp' | 'flat';

const KEY_PREFER: Accidental[] = [
  'sharp', 'flat', 'sharp', 'flat', 'sharp', 'flat',
  'flat',  'sharp','flat',  'sharp','flat',  'sharp',
];

export function keyPreferFor(semi: number): Accidental {
  const i = (((semi % 12) + 12) % 12);
  return KEY_PREFER[i];
}

// A bar is read in eighth-note slots -- two to the beat. Four slots to the bar
// was the old resolution, and it could not hold a chord that lands off the
// beat: an anticipation had to be dropped from the sheet to keep the bar
// parseable.
export const SLOTS_PER_BEAT = 2;

/**
 * A time signature, held as the two numbers a reader sees rather than as a
 * length: 3/8 and 3/16 are not one bar played at two speeds, and only the pair
 * says which is meant. The same shape yt-loop writes, so a sheet handed over
 * by the link is read here without being translated.
 */
export interface Meter {
  num: number;
  den: number;
}

/** How many eighth-note slots a meter runs for. */
export function slotsOfMeter(meter: Meter): number {
  return (meter.num * 4 * SLOTS_PER_BEAT) / meter.den;
}

// The notes a beat can be counted in. A list rather than a pattern spelled out
// in the regexp, since the token is read by taking one of these off the end.
export const NOTE_VALUES = [2, 4, 8, 16];

// The largest count a meter can be written with. Two digits, which is the
// limit yt-loop writes under, so whatever can be written there is read here.
export const MAX_NUM = 99;

// The meter a sheet is in until it says otherwise, and how long a bar of it
// runs. Both are the 4/4 case of the general rule and not a fixed property of
// a bar any more: `slotsOf` is what asks a particular bar how long it is.
export const DEFAULT_METER: Meter = { num: 4, den: 4 };
export const SLOTS_PER_MEASURE = slotsOfMeter(DEFAULT_METER);

/**
 * A time signature as this app writes it: `T34` at the head of a bar, in force
 * from there until another one is written, which is how a stave carries it.
 * `T22` is cut time, `T128` is 12/8, `T216` is 2/16 -- the count, then the note
 * it is counted in, run together with nothing between them. That is never
 * ambiguous: no two note values split one token two ways, since 28 is not a
 * note and neither is 6.
 *
 * The count starts at one, a bar of no beats being no bar: `T04` is read as a
 * chord by that name, the way anything else at the head of a bar is.
 */
const METER_TOKEN = /^T\d/;
const METER = new RegExp(`^T([1-9]\\d?)(${NOTE_VALUES.join('|')})$`);

export function isMeterToken(token: string): boolean {
  return METER_TOKEN.test(token);
}

/** The meter a token names, or null for a token that does not name one. */
export function readMeter(token: string): Meter | null {
  const m = METER.exec(token);
  if (!m) return null;
  // The pattern is what rules on both parts: one or two digits with no
  // leading zero is 1 to MAX_NUM, and the note has already been matched
  // against the list. Nothing left to check here.
  return { num: Number(m[1]), den: Number(m[2]) };
}

/**
 * Whether a meter lands on the eighth-note grid the app is read and played
 * over. Only an odd count of sixteenths does not -- 3/16 is a slot and a half,
 * and half a slot is neither drawn nor struck. Every half, quarter and eighth
 * meter fits, and so do 6/16 and 12/16.
 */
export function meterFitsSlots(meter: Meter): boolean {
  return Number.isInteger(slotsOfMeter(meter));
}

/** A meter as a reader says it: 3/4. */
export function meterLabel(meter: Meter): string {
  return `${meter.num}/${meter.den}`;
}

export function sameMeter(a: Meter, b: Meter): boolean {
  return a.num === b.num && a.den === b.den;
}

export interface Chord {
  raw: string;
  root: number | null;
  quality: string;
  bass: number | null;
  isRepeat?: boolean;
}

/**
 * What every bar carries whatever is written in it: the meter it is read in,
 * and whether it is the bar that declared it.
 *
 * The meter is resolved here, at parse time, rather than being worked out by
 * whoever walks the sheet later. A time signature holds from where it is
 * written, so working it out later means walking backwards -- and the player
 * does not have the bars before the loop to walk back through.
 */
interface MeasureCommon {
  /** The meter the bar is read in. */
  meter: Meter;
  /** Whether this bar is where the meter was written, and so draws the sign. */
  meterMark: boolean;
}

export type Measure =
  | (MeasureCommon & { kind: 'chords'; chords: Chord[] })
  | (MeasureCommon & { kind: 'repeat1' })
  | (MeasureCommon & { kind: 'repeat2' });

/** How many eighth-note slots a bar runs for. */
export function slotsOf(measure: { meter: Meter }): number {
  return slotsOfMeter(measure.meter);
}

/**
 * The quarter-note beats a bar hands the bass and the count-in. The last one
 * is short where the meter does not fill it: 3/8 is a beat and a half, and the
 * half is still a place the line plays from and the count strikes. Rounding it
 * away would leave a bar of 1/8 with no beat at all.
 */
export function beatsOfMeter(meter: Meter): number {
  return Math.ceil(slotsOfMeter(meter) / SLOTS_PER_BEAT);
}

export function beatsOf(measure: { meter: Meter }): number {
  return beatsOfMeter(measure.meter);
}

export interface Song {
  measures: Measure[];
  errors: string[];
}

export function noteLabel(semi: number, prefer: Accidental): string {
  const s = ((semi % 12) + 12) % 12;
  return (prefer === 'flat' ? NOTES_FLAT : NOTES_SHARP)[s];
}

function normalizeAccidental(s: string): string {
  return s.replace(/♯/g, '#').replace(/♭/g, 'b');
}

/**
 * The ASCII a sheet is written in, set the way it is read: `Bb7` becomes
 * `B♭7`, `C#m7b5` becomes `C♯m7♭5`. Display only -- what is stored,
 * transposed and put in a link stays ASCII, which is the spelling the sheet
 * box, the share URL and yt-loop's own parser all speak. Going the other way
 * is `normalizeAccidental` above, which is how a sheet typed with the signs
 * still parses.
 */
export function prettyAccidentals(s: string): string {
  return s
    .replace(/#/g, '♯')
    // An altered tension: the b of b5, b9, b13.
    .replace(/b(?=\d)/g, '♭')
    // A flattened note name -- the root, or the bass after a slash.
    .replace(/([A-G])b/g, '$1♭');
}

function parseRoot(str: string): { semi: number; length: number } | null {
  if (!str) return null;
  const upper = str[0].toUpperCase();
  if (!(upper in ROOT_MAP)) return null;
  let semi = ROOT_MAP[upper];
  let length = 1;
  const sec = str[1];
  if (sec === '#') { semi = (semi + 1) % 12; length = 2; }
  else if (sec === 'b') {
    if (str.length > 2 && /[A-G0-9#]/.test(str[2])) {
      semi = (semi + 11) % 12; length = 2;
    } else if (str.length === 2) {
      semi = (semi + 11) % 12; length = 2;
    } else {
      semi = (semi + 11) % 12; length = 2;
    }
  }
  return { semi, length };
}

export function parseChord(input: string): Chord | null {
  const raw = input.trim();
  if (!raw) return null;

  if (raw === 'N.C.' || raw === 'NC' || raw.toLowerCase() === 'n.c.') {
    return { raw, root: null, quality: '', bass: null };
  }

  const normalized = normalizeAccidental(raw);
  const rootParse = parseRoot(normalized);
  if (!rootParse) return null;

  const afterRoot = normalized.slice(rootParse.length);
  const slashIdx = afterRoot.indexOf('/');
  let quality: string;
  let bass: number | null = null;

  if (slashIdx >= 0) {
    quality = afterRoot.slice(0, slashIdx);
    const bassStr = afterRoot.slice(slashIdx + 1);
    const bassParse = parseRoot(bassStr);
    if (!bassParse || bassParse.length !== bassStr.length) return null;
    bass = bassParse.semi;
  } else {
    quality = afterRoot;
  }

  return { raw, root: rootParse.semi, quality, bass };
}

export function chordToString(chord: Chord, prefer: Accidental): string {
  if (chord.root === null) return chord.raw;
  const rootLabel = noteLabel(chord.root, prefer);
  const bassLabel = chord.bass !== null ? '/' + noteLabel(chord.bass, prefer) : '';
  return rootLabel + chord.quality + bassLabel;
}

export function transposeChord(input: string, semitones: number, prefer: Accidental): string {
  const c = parseChord(input);
  if (!c) return input;
  if (c.root === null) return c.raw;
  const shift = (n: number) => (((n + semitones) % 12) + 12) % 12;
  const transposed: Chord = {
    raw: c.raw,
    root: shift(c.root),
    quality: c.quality,
    bass: c.bass !== null ? shift(c.bass) : null,
  };
  return chordToString(transposed, prefer);
}

// Hard transposition: rewrites the sheet text itself, the way iReal Pro's
// "Set and Transpose" rewrites a chart. Only chord tokens are touched -- bar
// lines, repeats, line breaks and the user's own spacing survive byte for
// byte, since anything unparsable is handed back unchanged.
export function transposeSong(
  text: string,
  semitones: number,
  prefer: Accidental,
): string {
  return text.replace(/[^\s|]+/g, (token) => {
    if (token === '%' || token === '%%' || token === '.') return token;
    if (isMeterToken(token)) return token;
    return transposeChord(token, semitones, prefer);
  });
}

// Written with the sign rather than a lowercase b: these sit directly over the
// chord names, which wear ♭ and ♯, and a numeral spelled bIII under a B♭7 reads
// as two different sheets. Lowercased for a minor chord, which the sign ignores.
const DEGREE_LABELS = [
  'I', '♭II', 'II', '♭III', 'III', 'IV', '♭V', 'V', '♭VI', 'VI', '♭VII', 'VII',
] as const;

function isMinorish(quality: string): boolean {
  if (!quality) return false;
  if (quality.startsWith('maj') || quality[0] === 'M') return false;
  if (quality[0] === 'm') return true;
  if (quality.startsWith('dim') || quality.startsWith('°') || quality.startsWith('ø')) return true;
  return false;
}

// The roman numeral of the root alone: no quality, and no bass either. The
// note grid's strip is one column per slot and has room for nothing more.
export function chordDegreeRoot(
  chord: Chord,
  keyRoot: number,
  transpose: number,
): string {
  if (chord.root === null) return '';
  const shift = (((chord.root + transpose - keyRoot) % 12) + 12) % 12;
  const deg = DEGREE_LABELS[shift];
  return isMinorish(chord.quality) ? deg.toLowerCase() : deg;
}

// The numeral as the chord grid prints it, over the chord name: the degree,
// and the bass degree when the chord names one.
//
// The quality is left off on purpose. It is already spelled out in the name on
// the line below -- II13b9 over C13b9 says "13b9" twice, and the second saying
// costs the bar the width a long name needs.
//
// The bass stays, because every way of numbering a chart keeps it. The
// Nashville Number System writes it after a slash as a degree of the key --
// 1/3, 4/1 -- which is the figure this computes; classical analysis moves it
// into figured bass instead (I6). Neither throws the note away.
export function chordToDegree(
  chord: Chord,
  keyRoot: number,
  transpose: number,
): string {
  if (chord.root === null) return chord.raw;
  const deg = chordDegreeRoot(chord, keyRoot, transpose);
  if (chord.bass === null) return deg;
  const shift = (((chord.bass + transpose - keyRoot) % 12) + 12) % 12;
  return deg + '/' + DEGREE_LABELS[shift];
}

// The root of the first chord that has one. Stands in for the key when the
// user has not pinned one: right for a blues that starts on I, wrong for a
// tune like Autumn Leaves that starts on iim7b5.
export function firstChordRoot(measures: Measure[]): number {
  for (const m of measures) {
    if (m.kind === 'chords') {
      for (const c of m.chords) if (c.root !== null) return c.root;
    }
  }
  return 0;
}

// The tonic the sheet is read against, before transposition. A pinned keyRoot
// wins; 0 (C) is a real answer, so only null/undefined falls back.
export function resolveKeyRoot(
  keyRoot: number | null | undefined,
  measures: Measure[],
): number {
  return keyRoot ?? firstChordRoot(measures);
}

export function parseSong(text: string): Song {
  const errors: string[] = [];
  const measures: Measure[] = [];

  const trimmed = text.trim();
  if (!trimmed) return { measures, errors };

  const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  const cells = stripped.split('|');

  // The meter in force. It starts at 4/4 and changes where a bar says so,
  // which is how a stave reads: the sign appears once and stands until the
  // next one.
  let meter = DEFAULT_METER;

  cells.forEach((cell, i) => {
    const t = cell.trim();
    const tokens = t === '' ? [] : t.split(/\s+/);

    // The time signature comes off the front of the bar before anything else
    // is read, the way it is engraved: after the bar line, before the music.
    let meterMark = false;
    const body: string[] = [];
    tokens.forEach((tk, pos) => {
      if (!isMeterToken(tk)) {
        body.push(tk);
        return;
      }
      if (pos !== 0) {
        errors.push(
          `measure ${i + 1}: a time signature belongs at the head of the bar`,
        );
        return;
      }
      const read = readMeter(tk);
      if (read === null) {
        errors.push(
          `measure ${i + 1}: "${tk}" is not a time signature this app reads -- ` +
          `write 3/4 as T34 and 6/8 as T68, counting 1 to ${MAX_NUM} in ` +
          'halves, quarters, eighths or sixteenths',
        );
        return;
      }
      // A meter off the eighth-note grid is refused rather than rounded onto
      // it: half a slot is neither a place a chord can be drawn nor one the
      // player can strike, and rounding would sound a bar nobody wrote.
      if (!meterFitsSlots(read)) {
        errors.push(
          `measure ${i + 1}: ${meterLabel(read)} does not divide into the ` +
          'eighth-note slots this app reads and plays over -- an odd count ' +
          'of sixteenths is the one shape that does not fit',
        );
        return;
      }
      meter = read;
      meterMark = true;
    });

    const rest = body.join(' ');

    // A repeat sign copies the bar before it, which it can only do when that
    // bar is the same length: four chords do not fit a bar of three beats, and
    // rescaling them would sound a rhythm nobody wrote. A stave does not write
    // one across a change of meter either.
    const checkRepeat = (back: number): void => {
      const source = measures[measures.length - back];
      if (!source || sameMeter(source.meter, meter)) return;
      errors.push(
        `measure ${i + 1}: this bar is ${meterLabel(meter)} and the bar it ` +
        `repeats is ${meterLabel(source.meter)} -- write the chords out instead`,
      );
    };

    if (rest === '%') {
      checkRepeat(1);
      measures.push({ kind: 'repeat1', meter, meterMark });
      return;
    }
    if (rest === '%%') {
      checkRepeat(2);
      measures.push({ kind: 'repeat2', meter, meterMark });
      return;
    }
    if (rest === '') {
      measures.push({ kind: 'chords', chords: [], meter, meterMark });
      return;
    }

    const chords: Chord[] = [];
    for (const tk of body) {
      if (tk === '.') {
        const prev = chords[chords.length - 1];
        if (!prev) {
          errors.push(`measure ${i + 1}: "." has no previous chord in this measure`);
        } else {
          chords.push({ ...prev, isRepeat: true });
        }
        continue;
      }
      const c = parseChord(tk);
      if (!c) {
        errors.push(`measure ${i + 1}: could not parse "${tk}"`);
      } else {
        chords.push(c);
      }
    }
    const slots = slotsOfMeter(meter);
    if (chords.length > slots) {
      errors.push(
        `measure ${i + 1}: ${chords.length} chords in one bar of ` +
        `${meterLabel(meter)}, only ${slots} fit -- the rest will not sound`,
      );
    }
    measures.push({ kind: 'chords', chords, meter, meterMark });
  });

  return { measures, errors };
}
