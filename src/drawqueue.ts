// Visual events waiting for the frame they belong on.
//
// Tone's own Draw is what this replaces, and it replaces it for one reason: it
// throws away anything it reaches more than a quarter second late (see
// `expiration` in tone/core/util/Draw). Audio keeps its own clock, so a stalled
// main thread -- a re-render, a re-layout, a tab coming back to the front --
// costs the page a beat's update while the sound carries on, and the playhead
// is then pointing at a bar that is no longer sounding.
//
// Late is not the same as wrong. A queue that has fallen behind still knows
// where the music is: it is the last event that has come due. So nothing here
// expires. Frames that pass with several events due collapse into one update,
// which is what a playhead wants anyway -- only its latest position can be
// drawn.

export interface DrawEvent<T> {
  time: number;
  value: T;
}

// Half a frame at 60Hz. An event landing a hair after the frame we are drawing
// is closer to this frame than to the next one, and Tone schedules against the
// audio clock rather than the display's.
export const ANTICIPATION = 0.008;

export class DrawQueue<T> {
  private events: DrawEvent<T>[] = [];

  /** Queue a value to be drawn at an AudioContext time. */
  schedule(value: T, time: number): void {
    this.events.push({ value, time });
  }

  /**
   * The value to draw now: the last one that has come due, with everything
   * before it dropped. Null when nothing is due, so a caller can leave the
   * screen alone rather than redraw what is already there.
   */
  due(now: number): T | null {
    let latest: T | null = null;
    let i = 0;
    while (i < this.events.length && this.events[i].time <= now + ANTICIPATION) {
      latest = this.events[i].value;
      i++;
    }
    if (i > 0) this.events.splice(0, i);
    return latest;
  }

  clear(): void {
    this.events.length = 0;
  }

  get length(): number {
    return this.events.length;
  }
}
