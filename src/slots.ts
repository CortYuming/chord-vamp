import type { Chord, Measure, Song as ParsedSong } from './chord';
import { SLOTS_PER_MEASURE } from './chord';

// Reading a sheet into the slots a bar is played and drawn over. No sound and
// no markup here: the player sequences what comes out of this, and the two
// grids draw it, and neither should have to reach through the other to get it.

export interface ExpandedMeasure {
  // One entry per eighth-note slot, eight to the bar -- not one per beat. A
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

// A bar's chords laid out over its eight slots. Written evenly, so the four
// chords of `|C D E F|` still take a beat each and sound exactly as they did
// at the old four-slot resolution; what is new is that a fifth and a sixth
// chord now have somewhere to go instead of being dropped.
export function splitToSlots(chords: Chord[]): (Chord | null)[] {
  const n = SLOTS_PER_MEASURE;
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
      ? slotRuns(splitToSlots(m.chords))
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
    const chords = resolveMeasureChords(song.measures, i);
    out.push({
      slots: splitToSlots(chords),
      sourceIndex: i,
    });
  }
  return out;
}
