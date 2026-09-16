import type { Chord, Measure, Song as ParsedSong } from './chord';
import { beatsOf, slotsOf } from './chord';

// Reading a sheet into the slots a bar is played and drawn over. No sound and
// no markup here: the player sequences what comes out of this, and the two
// grids draw it, and neither should have to reach through the other to get it.

export interface ExpandedMeasure {
  /**
   * The quarter-note beats the bar hands the bass and the count -- the last
   * one short where the meter does not fill it. Not the length of the bar:
   * that is `slots.length`, and in 3/8 the two are a beat and a half apart.
   */
  beats: number;
  // One entry per eighth-note slot, two to the beat -- not one per beat. A
  // chord that lands off the beat keeps its own slot here so the grid can
  // print it; the bass then skips it. That is how a chart is actually read:
  // every chord is seen, fewer are sounded.
  slots: (Chord | null)[];
  sourceIndex: number;
}

function resolveMeasureChords(measures: Measure[], idx: number): Chord[] {
  let cur = idx;
  const guard = new Set<number>();
  while (cur >= 0 && !guard.has(cur)) {
    guard.add(cur);
    const m = measures[cur];
    if (!m) return [];
    if (m.kind === 'chords') return m.chords;
    if (m.kind === 'repeat1') cur -= 1;
    else if (m.kind === 'repeat2') cur -= 2;
    else break;
  }
  return [];
}

// A bar's chords laid out over its slots, `n` of them -- eight in 4/4, six in
// 3/4. Written evenly, so the four chords of `|C D E F|` still take a beat
// each; a count that does not divide the bar leaves the longer slots at the
// front, the way `|C D E|` has always been read as 3 + 3 + 2.
export function splitToSlots(chords: Chord[], n: number): (Chord | null)[] {
  if (chords.length === 0) return Array(n).fill(null);
  if (chords.length >= n) return chords.slice(0, n);
  const slotsPerChord = n / chords.length;
  const slots: (Chord | null)[] = [];
  for (let s = 0; s < n; s++) {
    const idx = Math.floor(s / slotsPerChord);
    slots.push(chords[Math.min(idx, chords.length - 1)]);
  }
  return slots;
}

export interface SlotRun {
  chord: Chord | null;
  start: number;
  span: number;
}

// Whether a slot carries on the one before it. Identity alone is not enough:
// `.` parses to a fresh copy of the chord it repeats, so `|C . . .|` would
// read as four separate columns while `|C|` read as one, and the same bar
// would be drawn two ways depending on how it was typed. The flag settles it
// without comparing the two: `.` repeats whatever chord precedes it in its own
// bar, and laying the bar out over its slots never parts a copy from what it
// copies, so a slot carrying the flag is always carrying on its neighbour.
function continues(prev: Chord | null, next: Chord | null): boolean {
  if (prev === next) return true;
  return prev !== null && next !== null && next.isRepeat === true;
}

// Slots collapsed into runs of one chord, which is what both grids draw: a
// run's width says how long the chord is held, so a bar reads as durations
// rather than as a row of evenly spaced names.
export function slotRuns(slots: (Chord | null)[]): SlotRun[] {
  const runs: SlotRun[] = [];
  let i = 0;
  while (i < slots.length) {
    let span = 1;
    while (i + span < slots.length && continues(slots[i + span - 1], slots[i + span])) span++;
    runs.push({ chord: slots[i], start: i, span });
    i += span;
  }
  return runs;
}

// Every bar of a sheet as the runs it is drawn in, or null where there is
// nothing to draw -- an empty bar, or one written as a repeat mark, which the
// grid draws as a sign rather than as chords. Worked out once per sheet: the
// layout needs it to size its lines and the grid needs it to fill them, and
// reading the sheet twice is how the two come to disagree.
export function measureRuns(measures: Measure[]): (SlotRun[] | null)[] {
  return measures.map((m) => (
    m.kind === 'chords' && m.chords.length > 0
      ? slotRuns(splitToSlots(m.chords, slotsOf(m)))
      : null
  ));
}

export function expandSong(
  song: ParsedSong,
  loopStart: number,
  loopEnd: number,
): ExpandedMeasure[] {
  const n = song.measures.length;
  if (n === 0) return [];
  const s = Math.max(0, Math.min(loopStart, n - 1));
  const e = loopEnd < 0 ? n - 1 : Math.max(s, Math.min(loopEnd, n - 1));
  const out: ExpandedMeasure[] = [];
  for (let i = s; i <= e; i++) {
    const measure = song.measures[i];
    const chords = resolveMeasureChords(song.measures, i);
    out.push({
      beats: beatsOf(measure),
      slots: splitToSlots(chords, slotsOf(measure)),
      sourceIndex: i,
    });
  }
  return out;
}

/**
 * Where each bar of a run begins, counted from the top of it -- in slots, and
 * in beats for the walking line. Bars are not all the same length once a sheet
 * changes meter, so nothing about where a bar sits can be divided out of a
 * slot number any more: it is looked up here.
 *
 * Both arrays carry one entry per bar and a last entry for the end, so the
 * length of the whole run is simply the last of them.
 *
 * Kept beside the rest of the sheet arithmetic rather than in the player: it
 * is counting, and counting is the part worth testing.
 */
export interface Timeline {
  slotAt: number[];
  beatAt: number[];
}

export function buildTimeline(expanded: ExpandedMeasure[]): Timeline {
  const slotAt = [0];
  const beatAt = [0];
  for (const m of expanded) {
    slotAt.push(slotAt[slotAt.length - 1] + m.slots.length);
    beatAt.push(beatAt[beatAt.length - 1] + m.beats);
  }
  return { slotAt, beatAt };
}

/** The length of the whole run, in slots. */
export function totalSlots(timeline: Timeline): number {
  return timeline.slotAt[timeline.slotAt.length - 1];
}

/**
 * Which bar of the run a slot falls in. A walk rather than a division, and a
 * short one: a chart is tens of bars, and this is asked once an eighth note.
 */
export function barAtSlot(timeline: Timeline, slot: number): number {
  const at = timeline.slotAt;
  for (let i = 1; i < at.length; i++) if (slot < at[i]) return i - 1;
  return Math.max(0, at.length - 2);
}
