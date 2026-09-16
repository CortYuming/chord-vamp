import type { Chord } from './chord';
import { SLOTS_PER_BEAT } from './chord';
import type { ExpandedMeasure } from './slots';
import { chordTones, scaleFor } from './tones';
import type { Rng } from './random';
import { createRng, hashString } from './random';

// The walking bass line a sheet is played over.
//
// The old line was the root of whatever chord the beat fell on, an octave
// fixed, four to the bar -- so a bar of one chord came out as the same note
// struck four times, and a change of chord jumped wherever the new root
// happened to sit. What a bass player does instead is walk: state the root,
// pick a way through the chord, and arrive at the next root from a step away.
// That last part is what pulls a bar into the one after it.
//
// No sound here, and no Tone.js: this is arithmetic over the sheet, which is
// the part worth testing.

export interface PitchRange {
  min: number;
  max: number;
}

// Where the line lives, as MIDI numbers: E1 to E3 -- an upright's bottom
// string to two octaves above it. Two full octaves rather than the octave and
// a half that would still cover the notes, because every pitch class then has
// two places to sit and the nearest one is never more than a tritone away.
// Squeeze the range and the arithmetic starts forcing leaps the line did not
// ask for.
export const BASS_RANGE: PitchRange = { min: 28, max: 52 };

// Where a line starts before it has anywhere to have come from.
const HOME = Math.round((BASS_RANGE.min + BASS_RANGE.max) / 2);

// How a beat leading into the next chord gets there: from a semitone above,
// from a semitone below, or from its dominant a fifth above. The chromatic
// approaches are the common ones, so they carry twice the weight.
const APPROACH_OFFSETS = [1, -1, 7];
const APPROACH_WEIGHTS = [2, 2, 1];

export function pitchClass(value: number): number {
  return ((value % 12) + 12) % 12;
}

/** The pitch of the given class sitting closest to `target` inside `range`. */
export function nearestPitch(pc: number, target: number, range: PitchRange): number {
  const wanted = pitchClass(pc);
  let best: number | null = null;
  for (let midi = range.min; midi <= range.max; midi++) {
    if (pitchClass(midi) !== wanted) continue;
    if (best === null || Math.abs(midi - target) < Math.abs(best - target)) best = midi;
  }
  // A range narrower than an octave can miss a pitch class entirely; ours
  // cannot, and the fallback keeps the type honest rather than guarding a
  // case the constant rules out.
  return best ?? range.min;
}

/**
 * The chord under each beat of the expanded sheet, in playing order. A bar
 * gives up as many beats as its meter has, so a sheet that changes meter comes
 * out as one line of beats with no gaps in it -- which is what the walk is
 * written over and what the player counts along.
 */
export function beatChords(expanded: ExpandedMeasure[]): (Chord | null)[] {
  const out: (Chord | null)[] = [];
  for (const m of expanded) {
    for (let b = 0; b < m.beats; b++) {
      out.push(m.slots[b * SLOTS_PER_BEAT] ?? null);
    }
  }
  return out;
}

// A chord that lands off the beat is read and not played, so two beats hold
// "the same chord" when they spell the same one -- not when they are the same
// object. `.` parses to a fresh copy, and a bar written `|Bb7|` shares one
// object across its slots; both have to walk the same way.
function sameChord(a: Chord | null, b: Chord | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.root === b.root && a.quality === b.quality && a.bass === b.bass;
}

/** The note the line states on the first beat: a slash chord names its own. */
function bassRootOf(chord: Chord): number | null {
  return chord.bass !== null ? chord.bass : chord.root;
}

// The bones of a chord: third, fifth, seventh, as semitones above the root.
// `chordTones` hands back the tensions too -- a 13th chord is seven notes --
// and a line that walks up the ninths and thirteenths stops sounding like a
// bass and starts sounding like someone else's solo.
export function coreTones(quality: string): number[] {
  const { tones } = chordTones(quality);
  const has = (...wanted: number[]) => tones.find((t) => wanted.includes(t));
  return [
    has(3, 4) ?? has(5),        // third, or the fourth a sus chord has instead
    has(7) ?? has(6, 8),        // fifth, altered if that is all there is
    has(10, 11) ?? has(9),      // seventh, or the sixth of a 6 chord
  ].filter((t): t is number => t !== undefined);
}

interface Segment {
  /** Index of the first beat of the run. */
  start: number;
  length: number;
  chord: Chord | null;
}

/** Beats grouped into the runs one chord is held for. */
export function segments(beats: (Chord | null)[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < beats.length; i++) {
    const last = out[out.length - 1];
    if (last && sameChord(last.chord, beats[i])) last.length++;
    else out.push({ start: i, length: 1, chord: beats[i] });
  }
  return out;
}

/**
 * The note the line is walking towards: the root of the next run that sounds,
 * wrapping past the end of the sheet because the sheet loops. Null when
 * nothing else in the line sounds at all.
 */
function nextRoot(segs: Segment[], from: number): number | null {
  for (let step = 1; step <= segs.length; step++) {
    const chord = segs[(from + step) % segs.length].chord;
    const root = chord === null ? null : bassRootOf(chord);
    if (root !== null) return root;
  }
  return null;
}

/**
 * One MIDI note per beat, or null where the line rests -- an empty bar, or
 * N.C., which has no root to state.
 *
 * The same sheet always walks the same way. The seed is the chords themselves,
 * so a line is a property of the chart rather than of the moment Play was
 * pressed, and editing one bar leaves the rest of the walk where it was.
 */
export function generateBassLine(expanded: ExpandedMeasure[]): (number | null)[] {
  const beats = beatChords(expanded);
  const line: (number | null)[] = new Array(beats.length).fill(null);
  if (beats.length === 0) return line;

  const segs = segments(beats);
  const rng = createRng(hashString(beats.map((c) => c?.raw ?? '-').join(' ')));
  let previous: number | null = null;

  segs.forEach((seg, segIdx) => {
    const chord = seg.chord;
    if (chord === null || chord.root === null) return;
    const harmonyRoot = chord.root;
    const root = bassRootOf(chord);
    if (root === null) return;

    const core = coreTones(chord.quality).map((t) => pitchClass(harmonyRoot + t));
    const scale = scaleFor(chord.quality).notes.map((t) => pitchClass(harmonyRoot + t));
    const target = nextRoot(segs, segIdx);

    for (let i = 0; i < seg.length; i++) {
      const isLast = i === seg.length - 1;
      let pc: number;
      if (i === 0) {
        // Beat one states the chord. A run only one beat long is all root:
        // there is no room to leave and come back.
        pc = pitchClass(root);
      } else if (isLast && target !== null) {
        pc = approachTo(target, previous, rng);
      } else if (i === 1) {
        // The beat after the root outlines the chord itself; the scale can
        // wait until there is more room than this.
        pc = pickAway(core, previous, rng);
      } else {
        pc = pickAway([...core, ...scale], previous, rng);
      }
      const midi = nearestPitch(pc, previous ?? HOME, BASS_RANGE);
      line[seg.start + i] = midi;
      previous = midi;
    }
  });

  return line;
}

/** A step into the next root, avoiding the note just played. */
function approachTo(
  nextRoot: number,
  previous: number | null,
  rng: Rng,
): number {
  const all = APPROACH_OFFSETS.map((o) => pitchClass(nextRoot + o));
  const keep: number[] = [];
  const weights: number[] = [];
  all.forEach((pc, i) => {
    if (previous !== null && pc === pitchClass(previous)) return;
    keep.push(pc);
    weights.push(APPROACH_WEIGHTS[i]);
  });
  if (keep.length === 0) return rng.weighted(all, APPROACH_WEIGHTS);
  return rng.weighted(keep, weights);
}

/** Pick a pitch class, preferring one that is not where the line already is. */
function pickAway(
  candidates: number[],
  previous: number | null,
  rng: Rng,
): number {
  const fresh = previous === null
    ? candidates
    : candidates.filter((pc) => pc !== pitchClass(previous));
  return rng.pick(fresh.length > 0 ? fresh : candidates);
}
