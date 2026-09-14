// A seeded random generator (mulberry32), and a way to turn a sheet into a
// seed. The bass line is drawn from one of these rather than from
// Math.random: a line that came out different on every play would be a new
// thing to learn each time the loop came round, and the point of vamping on a
// chart is that the ground under it holds still.

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Uniformly pick one item. */
  pick<T>(items: readonly T[]): T;
  /** Pick one item, where weights[i] is the relative weight of items[i]. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (n: number): number => Math.floor(next() * n);

  return {
    next,
    int,
    pick: (items) => items[int(items.length)],
    weighted: (items, weights) => {
      const total = weights.reduce((a, b) => a + b, 0);
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r < 0) return items[i];
      }
      return items[items.length - 1];
    },
  };
}

// FNV-1a. The chords a sheet is made of, read as one string, are what decides
// the line -- so editing a bar changes that bar's walk and leaves the rest of
// the chart where it was.
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
