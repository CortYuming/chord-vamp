import { describe, it, expect } from 'vitest';
import { parseSong, slotsOf } from './chord';
import { measureRuns } from './slots';
import {
  finestShares, fitsPerRow, packRows, rowIndexOf,
  ROW_WIDTHS, GRID_GAP_PX, MIN_RUN_PX,
} from './layout';

const sharesFor = (sheet: string) => {
  const { measures } = parseSong(sheet);
  return finestShares(measureRuns(measures), measures.map(slotsOf));
};

// The width at which a bar whose shortest chord holds `share` of it is exactly
// wide enough, laid out `perRow` to a line. Tests either side of it rather than
// quoting pixel numbers that would go stale with the type size.
function thresholdWidth(perRow: number, share: number): number {
  return (MIN_RUN_PX * perRow) / share + GRID_GAP_PX * (perRow - 1);
}

describe('finestShares', () => {
  it('reads a whole-bar chord as the full bar', () => {
    expect(sharesFor('|C|')).toEqual([1]);
  });

  it('is not fooled by dots into calling a held chord short', () => {
    expect(sharesFor('|C . . .|')).toEqual([1]);
  });

  it('reads four chords as a quarter of the bar each', () => {
    expect(sharesFor('|C D E F|')).toEqual([0.25]);
  });

  it('reads a chord on the off-beat as an eighth of the bar', () => {
    expect(sharesFor('|Cm9 . . Gb13 F13 . F7+ Bb7|')).toEqual([0.125]);
  });

  it('constrains nothing for an empty bar or a repeat mark', () => {
    expect(sharesFor('|C D E F||')).toEqual([0.25, 1]);
    expect(sharesFor('|C D E F|%|%%|')).toEqual([0.25, 1, 1]);
  });

  it('reports each bar on its own, not the sheet as a whole', () => {
    expect(sharesFor('|C|C D E F|Cm9 . . Gb13 F13 . F7+ Bb7|'))
      .toEqual([1, 0.25, 0.125]);
  });

  // The share is what makes a short bar comparable with a long one. Two chords
  // fill half a bar whether the bar is 4/4 or 2/4, and the layout has the same
  // width to find for the name either way -- counting slots would have called
  // the 2/4 bar twice as tight and narrowed the line for no reason.
  it('reads a bar by what fills it, not by how long the bar is', () => {
    expect(sharesFor('|T24 C|')).toEqual([1]);
    expect(sharesFor('|T24 C D|')).toEqual(sharesFor('|C D|'));
    // A beat is a third of a bar of 3/4 and a quarter of a bar of 4/4, so the
    // same three chords are wider here than four would be there.
    expect(sharesFor('|T34 C D E|')).toEqual([1 / 3]);
  });
});

describe('fitsPerRow', () => {
  // thresholdWidth inverts the same arithmetic fitsPerRow uses, so on its own
  // it would agree with a wrong formula. One worked case pins the numbers:
  // four bars over 1200px leave (1200 - 3 gaps of 6) / 4 = 295.5 each, and a
  // chord holding a quarter of its bar gets 73.9 of that -- clear of the 70 it
  // needs. Take 200px off the window and the same chord gets 61.4 and does not.
  it('measures a worked case in pixels', () => {
    expect(fitsPerRow(1200, 4, 0.25)).toBe(true);
    expect(fitsPerRow(1000, 4, 0.25)).toBe(false);
  });

  it('fits at the threshold and not a pixel below', () => {
    const w = thresholdWidth(4, 0.25);
    expect(fitsPerRow(w, 4, 0.25)).toBe(true);
    expect(fitsPerRow(w - 1, 4, 0.25)).toBe(false);
  });

  it('needs more width the finer the chord', () => {
    expect(thresholdWidth(4, 0.125)).toBeGreaterThan(thresholdWidth(4, 0.25));
  });

  it('needs more width the more bars share the line', () => {
    expect(thresholdWidth(4, 0.125)).toBeGreaterThan(thresholdWidth(2, 0.125));
  });
});

describe('packRows', () => {
  // Every bar lands on exactly one line, in order, with no gap or overlap.
  const covers = (shares: number[], width: number) => {
    const rows = packRows(shares, width);
    const seen: number[] = [];
    for (const r of rows) {
      expect(ROW_WIDTHS).toContain(r.perRow);
      for (let i = r.start; i < Math.min(r.start + r.perRow, shares.length); i++) {
        seen.push(i);
      }
    }
    expect(seen).toEqual(shares.map((_, i) => i));
    return rows;
  };

  it('uses the widest layout before the grid has been measured', () => {
    const rows = packRows(Array(8).fill(0.125), 0);
    expect(rows.map(r => r.perRow)).toEqual([4, 4]);
  });

  it('puts four plain bars on a line when they fit', () => {
    const shares = Array(8).fill(1);
    const rows = covers(shares, thresholdWidth(4, 1));
    expect(rows.map(r => r.perRow)).toEqual([4, 4]);
  });

  it('narrows only the line holding the finely written bar', () => {
    // Eight plain bars with one eighth-note bar fifth. At this width four fit
    // unless the line holds that bar, which needs two.
    const shares = Array(8).fill(1);
    shares[4] = 0.125;
    const rows = covers(shares, thresholdWidth(2, 0.125));
    expect(rows).toEqual([
      { start: 0, perRow: 4 },
      { start: 4, perRow: 2 },
      { start: 6, perRow: 4 },
    ]);
  });

  it('falls back to one bar a line when nothing else fits', () => {
    const rows = covers([0.125, 0.125, 0.125], 10);
    expect(rows.map(r => r.perRow)).toEqual([1, 1, 1]);
  });

  it('leaves the last line short rather than padding it', () => {
    const shares = Array(6).fill(1);
    const rows = covers(shares, thresholdWidth(4, 1));
    expect(rows).toEqual([
      { start: 0, perRow: 4 },
      { start: 4, perRow: 4 },
    ]);
  });

  it('has nothing to lay out for an empty sheet', () => {
    expect(packRows([], 1000)).toEqual([]);
  });
});

describe('rowIndexOf', () => {
  const rows = [
    { start: 0, perRow: 4 },
    { start: 4, perRow: 2 },
    { start: 6, perRow: 3 },
  ];

  it('finds the line a bar was packed onto', () => {
    expect(rowIndexOf(rows, 0)).toBe(0);
    expect(rowIndexOf(rows, 3)).toBe(0);
    expect(rowIndexOf(rows, 4)).toBe(1);
    expect(rowIndexOf(rows, 5)).toBe(1);
    expect(rowIndexOf(rows, 6)).toBe(2);
    expect(rowIndexOf(rows, 8)).toBe(2);
  });

  it('has no line for a bar off either end', () => {
    expect(rowIndexOf(rows, -1)).toBe(-1);
    expect(rowIndexOf(rows, 9)).toBe(-1);
  });

  it('has no line at all when nothing is laid out', () => {
    expect(rowIndexOf([], 0)).toBe(-1);
  });
});
