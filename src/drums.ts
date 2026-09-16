// The kit, as a question asked of each slot of the bar: what, if anything, is
// struck here. The player owns the sound; this owns the pattern.

import { SLOTS_PER_BEAT } from './chord';

export type DrumVoice = 'ride' | 'hihat';

export interface DrumHit {
  voice: DrumVoice;
  /** The strokes a drummer leans on, played a little harder. */
  accent: boolean;
}

// Two slots to the beat, so every other slot is one. The beats the ride leans
// on and the hi-hat foot closes are the even-numbered ones -- two and four in
// 4/4 -- and the slot just after each is where the swung eighth falls.
//
// Worked out from the slot rather than listed, because a bar is no longer
// always eight slots long. In 3/4 the rule leaves the foot on two alone, and
// the ride comes out as the jazz waltz is played: one, two and, three.
function beatOf(slot: number): number {
  return slot / SLOTS_PER_BEAT;
}

/** Whether a slot is a beat the section leans on: two, four, and so on. */
function isBackbeat(slot: number): boolean {
  return slot % SLOTS_PER_BEAT === 0 && beatOf(slot) % 2 === 1;
}

/**
 * The jazz ride pattern -- "ding, ding-da, ding, ding-da": a stroke on every
 * beat, a swung eighth after two and four, and the hi-hat foot closing on
 * those same two beats underneath it.
 *
 * Straight ahead, the swung eighths go: an off-beat stroke without the swing
 * ratio behind it is a shuffle turned square, and a reader following a chart
 * in straight eighths does not want one. The ride and the foot stay, which is
 * enough to count from.
 */
export function drumsForSlot(slot: number, swing: boolean): DrumHit[] {
  const hits: DrumHit[] = [];
  const onBeat = slot % SLOTS_PER_BEAT === 0;
  const backbeat = isBackbeat(slot);

  if (onBeat) hits.push({ voice: 'ride', accent: backbeat });
  if (backbeat) hits.push({ voice: 'hihat', accent: false });
  if (swing && !onBeat && isBackbeat(slot - 1)) {
    hits.push({ voice: 'ride', accent: false });
  }

  return hits;
}
