// Chord symbols to the notes they actually contain, and to the scale that sits
// over them. `parseChord` in chord.ts stops at the quality string -- 'm7',
// '7#9', '13' -- because the grid only ever needed to print it. Reading a
// progression against the twelve notes of the key needs the notes themselves.
//
// The quality table mirrors guitar-chord-viewer's chord.ts so a chord spelled
// in one app resolves to the same set here.

export interface Tension {
  n: number;            // as written: 9, 11, 13, 5 ...
  sign: '♯' | '♭';
  adjusted: number;     // semitones above the root
}

export interface ChordTones {
  tones: number[];      // semitones above the root, chord tones only
  tensions: Tension[];  // alterations, kept so a degree can be spelled as written
}

const AUG5: Tension[] = [{ n: 5, sign: '♯', adjusted: 8 }];

const ALT_TENSIONS: Tension[] = [
  { n: 9, sign: '♭', adjusted: 1 },
  { n: 9, sign: '♯', adjusted: 3 },
  { n: 5, sign: '♭', adjusted: 6 },
  { n: 5, sign: '♯', adjusted: 8 },
];

type QualityValue = number[] | { tones: number[]; tensions: Tension[] };

const QUALITY_MAP: Record<string, QualityValue> = {
  '': [0, 4, 7], 'maj': [0, 4, 7], 'M': [0, 4, 7],
  'm': [0, 3, 7], 'min': [0, 3, 7], '-': [0, 3, 7],
  'dim': [0, 3, 6], '°': [0, 3, 6],
  'aug': { tones: [0, 4], tensions: AUG5 },
  'sus2': [0, 2, 7], 'sus4': [0, 5, 7], 'sus': [0, 5, 7],
  '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9], 'min6': [0, 3, 7, 9],
  '7': [0, 4, 7, 10],
  'M7': [0, 4, 7, 11], 'maj7': [0, 4, 7, 11], 'Δ7': [0, 4, 7, 11], 'Δ': [0, 4, 7, 11],
  'm7': [0, 3, 7, 10], 'min7': [0, 3, 7, 10], '-7': [0, 3, 7, 10],
  'mM7': [0, 3, 7, 11], 'mmaj7': [0, 3, 7, 11], 'mΔ7': [0, 3, 7, 11],
  'm7b5': [0, 3, 6, 10], 'ø': [0, 3, 6, 10], 'ø7': [0, 3, 6, 10],
  'dim7': [0, 3, 6, 9], '°7': [0, 3, 6, 9],
  'aug7': { tones: [0, 4, 10], tensions: AUG5 },
  '9': [0, 4, 7, 10, 2],
  'M9': [0, 4, 7, 11, 2], 'maj9': [0, 4, 7, 11, 2], 'Δ9': [0, 4, 7, 11, 2],
  'm9': [0, 3, 7, 10, 2],
  '11': [0, 4, 7, 10, 2, 5],
  'm11': [0, 3, 7, 10, 2, 5],
  '13': [0, 4, 7, 10, 2, 5, 9],
  'M13': [0, 4, 7, 11, 2, 5, 9], 'maj13': [0, 4, 7, 11, 2, 5, 9], 'Δ13': [0, 4, 7, 11, 2, 5, 9],
  'm13': [0, 3, 7, 10, 2, 5, 9],

  'add9': [0, 4, 7, 2], 'add11': [0, 4, 7, 5], 'add13': [0, 4, 7, 9],
  'madd9': [0, 3, 7, 2], 'madd11': [0, 3, 7, 5], 'madd13': [0, 3, 7, 9],

  '6/9': [0, 4, 7, 9, 2], '69': [0, 4, 7, 9, 2],
  'm6/9': [0, 3, 7, 9, 2], 'm69': [0, 3, 7, 9, 2],

  '7sus4': [0, 5, 7, 10], '7sus': [0, 5, 7, 10],
  '9sus4': [0, 5, 7, 10, 2], '9sus': [0, 5, 7, 10, 2],
  '13sus4': [0, 5, 7, 10, 2, 9], '13sus': [0, 5, 7, 10, 2, 9],

  'alt': { tones: [0, 4, 10], tensions: ALT_TENSIONS },
  '7alt': { tones: [0, 4, 10], tensions: ALT_TENSIONS },
};

// Longest first, so 'm7b5' wins over 'm7' and '13sus4' over '13'.
const QUALITY_KEYS = Object.keys(QUALITY_MAP).sort((a, b) => b.length - a.length);

const TENSION_NAT: Record<number, number> = {
  2: 2, 4: 5, 5: 7, 6: 9, 7: 10, 9: 2, 11: 5, 13: 9,
};

// Scales, as semitones above the chord root.
export const SCALES = {
  ionian:       [0, 2, 4, 5, 7, 9, 11],
  lydian:       [0, 2, 4, 6, 7, 9, 11],
  mixolydian:   [0, 2, 4, 5, 7, 9, 10],
  altered:      [0, 1, 3, 4, 6, 8, 10],
  dorian:       [0, 2, 3, 5, 7, 9, 10],
  aeolian:      [0, 2, 3, 5, 7, 8, 10],
  locrian:      [0, 1, 3, 5, 6, 8, 10],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  wholeHalf:    [0, 2, 3, 5, 6, 8, 9, 11],
  wholeTone:    [0, 2, 4, 6, 8, 10],
} as const;

export type ScaleName = keyof typeof SCALES;

/**
 * Split a quality string into its base chord and any alterations written after
 * it. 'm7b5' resolves from the table; '7#9' resolves '7' from the table and
 * reads '#9' as a tension.
 */
export function chordTones(quality: string): ChordTones {
  const q = (quality ?? '').replace(/♯/g, '#').replace(/♭/g, 'b').trim();

  let key = '';
  let rest = q;
  for (const k of QUALITY_KEYS) {
    if (k && q.startsWith(k)) { key = k; rest = q.slice(k.length); break; }
  }
  // Nothing matched a named quality: a bare root, or leading alterations only.
  if (!key && !QUALITY_MAP[q]) { rest = q; }

  const raw = QUALITY_MAP[key] ?? QUALITY_MAP[''];
  const base = Array.isArray(raw) ? raw : raw.tones;
  const preset: Tension[] = Array.isArray(raw) ? [] : raw.tensions;

  const tones = new Set(base);
  const parsed: Tension[] = [];
  const re = /([+#b])(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) !== null) {
    const natural = TENSION_NAT[parseInt(m[2], 10)];
    if (natural === undefined) continue;
    const isSharp = m[1] === '+' || m[1] === '#';
    parsed.push({
      n: parseInt(m[2], 10),
      sign: isSharp ? '♯' : '♭',
      adjusted: isSharp ? (natural + 1) % 12 : (natural + 11) % 12,
    });
  }

  const tensions = [...preset, ...parsed];
  for (const t of tensions) {
    // An altered fifth or seventh replaces the natural one rather than
    // sitting beside it -- a 7b5 has no perfect fifth left.
    if (t.n === 5) tones.delete(7);
    if (t.n === 7) { tones.delete(10); tones.delete(11); }
    tones.add(t.adjusted);
  }

  return { tones: [...tones].sort((a, b) => a - b), tensions };
}

/**
 * The scale that sits over a chord, chosen from the chord's own tones. No
 * context is read: the same symbol always resolves the same way. A IIm7 that
 * is really the key's Im gets dorian either way, which is a limit worth
 * knowing about rather than papering over.
 */
export function scaleFor(quality: string): { name: ScaleName; notes: number[] } {
  const { tones, tensions } = chordTones(quality);
  const has = (n: number) => tones.includes(n);
  const altered = tensions.some((t) => (t.n === 9 || t.n === 5 || t.n === 11));

  // A ♯9 lands on the same semitone as a ♭3, so "has a minor third" is only
  // true when there is no major third beside it. Without this a 7♯9 reads as
  // a minor chord and gets dorian, which is the opposite of what it wants.
  const minorThird = has(3) && !has(4);

  let name: ScaleName;
  if (minorThird && has(6) && has(9)) {
    name = 'wholeHalf';                       // dim7
  } else if (minorThird && has(6)) {
    name = 'locrian';                         // m7b5
  } else if (minorThird && has(11)) {
    name = 'melodicMinor';                    // mMaj7
  } else if (minorThird) {
    name = 'dorian';                          // any minor seventh family
  } else if (has(10) && altered) {
    name = 'altered';                         // 7alt, 7#9, 7b9, 7#5 ...
  } else if (has(10)) {
    name = 'mixolydian';                      // plain dominant, incl. sus
  } else if (has(11)) {
    name = 'ionian';                          // major seventh family
  } else if (has(8) && !has(7)) {
    name = 'wholeTone';                       // augmented triad
  } else {
    name = 'ionian';                          // bare triads and sixths
  }
  return { name, notes: [...SCALES[name]] };
}

const DEGREE = ['R', '♭9', '9', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', 'Δ7'];

/**
 * Name a semitone against the chord it sits in. An alteration the symbol
 * spells wins: a 7#9 says ♯9 where a plain chord would say ♭3. A dominant
 * wears ♯5 where a minor chord wears ♭6.
 */
export function degreeLabel(semi: number, quality: string): string {
  const s = (((semi % 12) + 12) % 12);
  const { tones, tensions } = chordTones(quality);
  for (const t of tensions) {
    if (t.adjusted === s) return `${t.sign}${t.n}`;
  }
  if (s === 9 && tones.includes(3) && tones.includes(6)) return '♭♭7';   // dim7
  if (s === 8 && !tones.includes(3)) return '♯5';
  return DEGREE[s];
}

// Movable-do solfege, indexed by semitones above whatever is being called do.
// The same two tables guitar-chord-viewer and yt-loop use, so a note read in
// one app is spelled the same here. Naturals are one letter and altered
// syllables two, so the length of a label says whether the note is bent.
export const SOLFEGE_SHARP = ['d', 'di', 'r', 'ri', 'm', 'f', 'fi', 's', 'si', 'l', 'li', 't'];
export const SOLFEGE_FLAT = ['d', 'ro', 'r', 'mo', 'm', 'f', 'sw', 's', 'lo', 'l', 'to', 't'];

// Degrees counted from the key rather than from a chord, for the row labels.
export const KEY_DEGREE = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];
