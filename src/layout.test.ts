import { describe, it, expect } from 'vitest';
import { parseSong, SLOTS_PER_MEASURE } from './chord';
import { measureRuns } from './slots';
import {
  spansOf, fitsPerRow, packRows,
  ROW_WIDTHS, GRID_GAP_PX, MIN_RUN_PX,
} from './layout';

const spansFor = (sheet: string) => spansOf(measureRuns(parseSong(sheet).measures));

// The width at which a bar holding a chord of `finest` slots is exactly wide
// enough, laid out `perRow` to a line. Tests either side of it rather than
// quoting pixel numbers that would go stale with the type size.
function thresholdWidth(perRow: number, finest: number): number {
  return (MIN_RUN_PX * SLOTS_PER_MEASURE * perRow) / finest + GRID_GAP_PX * (perRow - 1);
}

describe('spansOf', () => {
  it('reads a whole-bar chord as the full bar', () => {
    expect(spansFor('|C|')).toEqual([SLOTS_PER_MEASURE]);
  });

  it('is not fooled by dots into calling a held chord short', () => {
    expect(spansFor('|C . . .|')).toEqual([SLOTS_PER_MEASURE]);
  });

  it('reads four chords as a beat each', () => {
    expect(spansFor('|C D E F|')).toEqual([2]);
  });

  it('reads a chord on the off-beat as one slot', () => {
    expect(spansFor('|Cm9 . . Gb13 F13 . F7+ Bb7|')).toEqual([1]);
  });

  it('constrains nothing for an empty bar or a repeat mark', () => {
    expect(spansFor('|C D E F||')).toEqual([2, SLOTS_PER_MEASURE]);
    expect(spansFor('|C D E F|%|%%|')).toEqual([2, SLOTS_PER_MEASURE, SLOTS_PER_MEASURE]);
  });

  it('reports each bar on its own, not the sheet as a whole', () => {
    expect(spansFor('|C|C D E F|Cm9 . . Gb13 F13 . F7+ Bb7|'))
      .toEqual([SLOTS_PER_MEASURE, 2, 1]);
  });
});

describe('fitsPerRow', () => {
  // thresholdWidth inverts the same arithmetic fitsPerRow uses, so on its own
  // it would agree with a wrong formula. One worked case pins the numbers:
  // four bars over 1200px leave (1200 - 3 gaps of 6) / 4 = 295.5 each, and a
  // chord held two of the eight slots gets 73.9 of that -- clear of the 70 it
  // needs. Take 200px off the window and the same chord gets 61.4 and does not.
  it('measures a worked case in pixels', () => {
    expect(fitsPerRow(1200, 4, 2)).toBe(true);
    expect(fitsPerRow(1000, 4, 2)).toBe(false);
  });

  it('fits at the threshold and not a pixel below', () => {
    const w = thresholdWidth(4, 2);
    expect(fitsPerRow(w, 4, 2)).toBe(true);
    expect(fitsPerRow(w - 1, 4, 2)).toBe(false);
  });

  it('needs more width the finer the chord', () => {
    expect(thresholdWidth(4, 1)).toBeGreaterThan(thresholdWidth(4, 2));
  });

  it('needs more width the more bars share the line', () => {
    expect(thresholdWidth(4, 1)).toBeGreaterThan(thresholdWidth(2, 1));
  });
});

describe('packRows', () => {
  // Every bar lands on exactly one line, in order, with no gap or overlap.
  const covers = (spans: number[], width: number) => {
    const rows = packRows(spans, width);
    const seen: number[] = [];
    for (const r of rows) {
      expect(ROW_WIDTHS).toContain(r.perRow);
      for (let i = r.start; i < Math.min(r.start + r.perRow, spans.length); i++) {
        seen.push(i);
      }
    }
    expect(seen).toEqual(spans.map((_, i) => i));
    return rows;
  };

  it('uses the widest layout before the grid has been measured', () => {
    const rows = packRows(Array(8).fill(1), 0);
    expect(rows.map(r => r.perRow)).toEqual([4, 4]);
  });

  it('puts four plain bars on a line when they fit', () => {
    const spans = Array(8).fill(SLOTS_PER_MEASURE);
    const rows = covers(spans, thresholdWidth(4, SLOTS_PER_MEASURE));
    expect(rows.map(r => r.perRow)).toEqual([4, 4]);
  });

  it('narrows only the line holding the finely written bar', () => {
    // Eight plain bars with one eighth-note bar fifth. At this width four fit
    // unless the line holds that bar, which needs two.
    const spans = Array(8).fill(SLOTS_PER_MEASURE);
    spans[4] = 1;
    const rows = covers(spans, thresholdWidth(2, 1));
    expect(rows).toEqual([
      { start: 0, perRow: 4 },
      { start: 4, perRow: 2 },
      { start: 6, perRow: 4 },
    ]);
  });

  it('falls back to one bar a line when nothing else fits', () => {
    const rows = covers([1, 1, 1], 10);
    expect(rows.map(r => r.perRow)).toEqual([1, 1, 1]);
  });

  it('leaves the last line short rather than padding it', () => {
    const spans = Array(6).fill(SLOTS_PER_MEASURE);
    const rows = covers(spans, thresholdWidth(4, SLOTS_PER_MEASURE));
    expect(rows).toEqual([
      { start: 0, perRow: 4 },
      { start: 4, perRow: 4 },
    ]);
  });

  it('has nothing to lay out for an empty sheet', () => {
    expect(packRows([], 1000)).toEqual([]);
  });
});
