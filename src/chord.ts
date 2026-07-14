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

export type Accidental = 'sharp' | 'flat';

const KEY_PREFER: Accidental[] = [
  'sharp', 'flat', 'sharp', 'flat', 'sharp', 'flat',
  'flat',  'sharp','flat',  'sharp','flat',  'sharp',
];

export function keyPreferFor(semi: number): Accidental {
  const i = (((semi % 12) + 12) % 12);
  return KEY_PREFER[i];
}

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

export function chordToDegree(
  chord: Chord,
  keyRoot: number,
  transpose: number,
): string {
  if (chord.root === null) return chord.raw;
  const shift = (n: number) => (((n + transpose - keyRoot) % 12) + 12) % 12;
  const rootDeg = DEGREE_LABELS[shift(chord.root)];
  const deg = isMinorish(chord.quality) ? rootDeg.toLowerCase() : rootDeg;
  const bassStr = chord.bass !== null
    ? '/' + DEGREE_LABELS[shift(chord.bass)]
    : '';
  return deg + chord.quality + bassStr;
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
    measures.push({ kind: 'chords', chords });
  });

  return { measures, errors };
}
