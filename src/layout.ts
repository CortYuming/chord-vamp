import { SLOTS_PER_MEASURE } from './chord';
import type { SlotRun } from './slots';

// How the chord grid decides how many bars go on a line. Pulled out of the
// component because none of it is about drawing: it is arithmetic over the
// sheet and the width on hand, and it is the part worth testing.

// As many bars to a line as will hold their chord names, four being the most
// the grid draws and one what a phone is left with. Lines are packed one at a
// time, so a sheet can change width partway down and the rows below no longer
// start on a four-bar boundary. That is what the bar numbers are for, and why
// they are printed large enough to count from.
export const ROW_WIDTHS = [4, 3, 2, 1];

// Must match the `gap` on .chord-row-line: it is width the bars do not get.
export const GRID_GAP_PX = 6;

// What the shortest chord on the line needs if its name is to stay on one
// line. The widest name this grid draws is something like `Bb7+5+9`, around
// 62px of the 17px Georgia .chord-line sets, and a little air keeps it off its
// neighbour. On a screen too narrow for even one bar to clear it, the last of
// ROW_WIDTHS stands and the names wrap instead -- which the bar height allows
// for at the smaller type a narrow screen switches to.
export const MIN_RUN_PX = 70;

export interface Row {
  /** Index into the sheet of the first bar on this line. */
  start: number;
  /** Columns the line is divided into -- the last line may not fill them. */
  perRow: number;
}

// The fewest slots any one chord in a bar is held for -- the chord the layout
// has to fit, everything else being wider by definition. A bar with nothing to
// draw holds no chord name and so constrains nothing.
export function spansOf(barRuns: (SlotRun[] | null)[]): number[] {
  return barRuns.map((runs) => {
    if (!runs) return SLOTS_PER_MEASURE;
    let finest = SLOTS_PER_MEASURE;
    for (const r of runs) if (r.span < finest) finest = r.span;
    return finest;
  });
}

// Whether a chord held for `finest` slots still clears MIN_RUN_PX when the
// width is split `perRow` ways.
export function fitsPerRow(width: number, perRow: number, finest: number): boolean {
  const barWidth = (width - GRID_GAP_PX * (perRow - 1)) / perRow;
  return (barWidth * finest) / SLOTS_PER_MEASURE >= MIN_RUN_PX;
}

// Each line is packed on its own terms: it takes the most bars it can whose
// chords all still clear MIN_RUN_PX at that many to a line. A run of plain
// bars therefore keeps its four even where a busy bar further down the sheet
// has pushed its own line to two, and a window too narrow for four takes
// fewer whatever the sheet holds.
//
// `width` is the grid's inner width in pixels; 0 means it has not been
// measured yet, and the widest layout stands until it has.
export function packRows(spans: number[], width: number): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < spans.length) {
    let take = ROW_WIDTHS[ROW_WIDTHS.length - 1];
    for (const n of ROW_WIDTHS) {
      const finest = Math.min(...spans.slice(i, i + n));
      if (width === 0 || fitsPerRow(width, n, finest)) {
        take = n;
        break;
      }
    }
    rows.push({ start: i, perRow: take });
    i += take;
  }
  return rows;
}

/**
 * Which line a bar was packed onto, or -1 when it was packed onto none --
 * nothing is playing, or the sheet changed under a playhead that had already
 * moved past its end.
 *
 * Lines take as many bars as they can hold rather than a fixed number, so a
 * bar's line cannot be worked out by dividing: it has to be looked up in the
 * rows the layout actually produced.
 */
export function rowIndexOf(rows: Row[], measure: number): number {
  if (measure < 0) return -1;
  for (let i = 0; i < rows.length; i++) {
    const { start, perRow } = rows[i];
    if (measure >= start && measure < start + perRow) return i;
  }
  return -1;
}
