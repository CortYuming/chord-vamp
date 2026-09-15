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

// A bar is read in eighth-note slots -- eight of them in 4/4. Four was the
// old resolution, and it could not hold a chord that lands off the beat: an
// anticipation had to be dropped from the sheet to keep the bar parseable.
export const SLOTS_PER_MEASURE = 8;

export interface Chord {
  raw: string;
  root: number | null;
  quality: string;
  bass: number | null;
  isRepeat?: boolean;
}

export type Measure =
  | { kind: 'chords'; chords: Chord[] }
  | { kind: 'repeat1' }
  | { kind: 'repeat2' };

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

  cells.forEach((cell, i) => {
    const t = cell.trim();
    if (t === '%') {
      measures.push({ kind: 'repeat1' });
      return;
    }
    if (t === '%%') {
      measures.push({ kind: 'repeat2' });
      return;
    }
    if (t === '') {
      measures.push({ kind: 'chords', chords: [] });
      return;
    }
    const tokens = t.split(/\s+/);
    const chords: Chord[] = [];
    for (const tk of tokens) {
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
    if (chords.length > SLOTS_PER_MEASURE) {
      errors.push(
        `measure ${i + 1}: ${chords.length} chords in one bar, only ` +
        `${SLOTS_PER_MEASURE} fit -- the rest will not sound`,
      );
    }
    measures.push({ kind: 'chords', chords });
  });

  return { measures, errors };
}
