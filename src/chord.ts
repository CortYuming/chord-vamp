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

// The meter a sheet is in until it says otherwise, and how long a bar of it
// runs. Both are the 4/4 case of the general rule and not a fixed property of
// a bar any more: `slotsOf` is what asks a particular bar how long it is.
export const DEFAULT_BEATS = 4;
export const SLOTS_PER_MEASURE = DEFAULT_BEATS * SLOTS_PER_BEAT;

// The most beats a bar can be written with. The token carries one digit for
// the count -- T54 is 5/4 -- so ten is where the notation runs out rather
// than where the music does.
export const MAX_BEATS = 9;

/**
 * A time signature as this app writes it: `T34` at the head of a bar, in force
 * from there until another one is written, which is how a stave carries it.
 * Only quarter-note meters are read; `T68` is refused rather than guessed at,
 * since a compound meter counts in dotted beats and the bass and the kit would
 * both have to be told about it.
 */
const METER_TOKEN = /^T\d/;
const METER = /^T(\d)(\d)$/;

export function isMeterToken(token: string): boolean {
  return METER_TOKEN.test(token);
}

/** The beats a meter token names, or null for one this app cannot read. */
export function readMeter(token: string): number | null {
  const m = METER.exec(token);
  if (!m) return null;
  const beats = Number(m[1]);
  const unit = Number(m[2]);
  if (unit !== 4) return null;
  if (beats < 1 || beats > MAX_BEATS) return null;
  return beats;
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
  /** Beats in the bar. The unit is always a quarter note. */
  beats: number;
  /** Whether this bar is where the meter was written, and so draws the sign. */
  meterMark: boolean;
}

export type Measure =
  | (MeasureCommon & { kind: 'chords'; chords: Chord[] })
  | (MeasureCommon & { kind: 'repeat1' })
  | (MeasureCommon & { kind: 'repeat2' });

/** How many eighth-note slots a bar runs for. */
export function slotsOf(measure: { beats: number }): number {
  return measure.beats * SLOTS_PER_BEAT;
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

const DEGREE_LABELS = [
  'I', 'bII', 'II', 'bIII', 'III', 'IV', 'bV', 'V', 'bVI', 'VI', 'bVII', 'VII',
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
  let beats = DEFAULT_BEATS;

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
          `write 3/4 as T34, and only quarter-note meters up to ${MAX_BEATS} beats`,
        );
        return;
      }
      beats = read;
      meterMark = true;
    });

    const rest = body.join(' ');

    // A repeat sign copies the bar before it, which it can only do when that
    // bar is the same length: four chords do not fit a bar of three beats, and
    // rescaling them would sound a rhythm nobody wrote. A stave does not write
    // one across a change of meter either.
    const checkRepeat = (back: number): void => {
      const source = measures[measures.length - back];
      if (!source || source.beats === beats) return;
      errors.push(
        `measure ${i + 1}: this bar is ${beats}/4 and the bar it repeats is ` +
        `${source.beats}/4 -- write the chords out instead`,
      );
    };

    if (rest === '%') {
      checkRepeat(1);
      measures.push({ kind: 'repeat1', beats, meterMark });
      return;
    }
    if (rest === '%%') {
      checkRepeat(2);
      measures.push({ kind: 'repeat2', beats, meterMark });
      return;
    }
    if (rest === '') {
      measures.push({ kind: 'chords', chords: [], beats, meterMark });
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
    const slots = beats * SLOTS_PER_BEAT;
    if (chords.length > slots) {
      errors.push(
        `measure ${i + 1}: ${chords.length} chords in one bar of ${beats}/4, ` +
        `only ${slots} fit -- the rest will not sound`,
      );
    }
    measures.push({ kind: 'chords', chords, beats, meterMark });
  });

  return { measures, errors };
}
