// The kit, as a question asked of each slot of the bar: what, if anything, is
// struck here. The player owns the sound; this owns the pattern.

export type DrumVoice = 'ride' | 'hihat';

export interface DrumHit {
  voice: DrumVoice;
  /** The strokes a drummer leans on, played a little harder. */
  accent: boolean;
}

// A bar is eight slots, so every other one is a beat. Two and four are the
// beats the ride leans on and the hi-hat foot closes; the slots just after
// them are where the swung eighth falls.
const BACKBEAT_SLOTS = [2, 6];
const SWUNG_SLOTS = [3, 7];

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
  const backbeat = BACKBEAT_SLOTS.includes(slot);

  if (slot % 2 === 0) hits.push({ voice: 'ride', accent: backbeat });
  if (backbeat) hits.push({ voice: 'hihat', accent: false });
  if (swing && SWUNG_SLOTS.includes(slot)) hits.push({ voice: 'ride', accent: false });

  return hits;
}
