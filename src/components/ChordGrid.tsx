import { useEffect, useMemo, useRef, useState } from 'react';
import type { Measure, Chord, Accidental } from '../chord';
import { chordToString, chordToDegree } from '../chord';
import { measureRuns } from '../slots';
import { spansOf, packRows, rowIndexOf } from '../layout';

interface Props {
  measures: Measure[];
  transpose: number;
  prefer: Accidental;
  keyRoot: number;
  currentMeasure: number;
  loopStart: number | null;
  loopEnd: number | null;
  onMeasureDown: (i: number) => void;
  onMeasureEnter: (i: number) => void;
  onGridUp: () => void;
  /**
   * Where a bar number leads, for a sheet read from yt-loop: back to the video
   * at the second that bar starts. Undefined for a sheet typed here, and null
   * for a bar nobody has timed yet -- the number is then the plain label it has
   * always been.
   */
  barHref?: (i: number) => string | null;
  /**
   * Taking the number, rather than following the link. The video is usually
   * already open in the tab this page came from, and moving that player beats
   * loading a second copy of it -- see ytloop.ts. The href stays underneath for
   * a middle click, and for anyone who wants the address itself.
   */
  onBarJump?: (i: number) => void;
}

// Where the line being played is held on screen: a third of the way down.
// Above it sits the line just finished, and the rest of the window is what
// comes next -- a reader is looking ahead, so most of the glass goes there.
const PLAYHEAD_ANCHOR = 1 / 3;

function SimileMark({ variant }: { variant: 'single' | 'double' }) {
  return (
    <svg
      className="repeat-svg"
      viewBox="0 0 40 32"
      width="46"
      height="36"
      aria-label={variant === 'single' ? 'One-bar repeat' : 'Two-bar repeat'}
    >
      <circle cx="8" cy="22" r="2.6" fill="currentColor" />
      <line
        x1="6" y1="27"
        x2="34" y2="5"
        stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"
      />
      <circle cx="32" cy="10" r="2.6" fill="currentColor" />
      {variant === 'double' && (
        <text
          x="20" y="4"
          fontSize="8"
          textAnchor="middle"
          fontWeight="700"
          fill="currentColor"
          fontFamily="Georgia, serif"
        >2</text>
      )}
    </svg>
  );
}

// The number in the corner of a bar. A plain label for a sheet typed here; for
// one read from yt-loop, the way back to the second of the video that bar was
// transcribed from.
//
// Drawn as a link and not as a hover, so a finger finds it: the tap target is
// padded out around the digits while the digits stay where they were.
// mousedown is taken here rather than left to the bar, which would read the
// press as the start of a loop drag.
function BarNumber({
  index,
  href,
  onJump,
}: {
  index: number;
  href: string | null;
  onJump?: (i: number) => void;
}) {
  if (!href) return <span className="measure-index">{index + 1}</span>;
  return (
    <a
      className="measure-index measure-index-link"
      href={href}
      title={`Open bar ${index + 1} in yt-loop`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (!onJump) return;
        // Leave a modified click to the browser: that is someone asking for the
        // address itself, in a tab or a clipboard.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        onJump(index);
      }}
    >{index + 1}</a>
  );
}

function chordLines(
  chord: Chord,
  transpose: number,
  prefer: Accidental,
  keyRoot: number,
): { degree: string; note: string } {
  if (chord.root === null) return { degree: '', note: chord.raw };
  const degree = chordToDegree(chord, keyRoot, transpose);
  const shifted: Chord = {
    ...chord,
    root: (((chord.root + transpose) % 12) + 12) % 12,
    bass: chord.bass !== null
      ? (((chord.bass + transpose) % 12) + 12) % 12
      : null,
  };
  const note = chordToString(shifted, prefer);
  return { degree, note };
}

export function ChordGrid({
  measures,
  transpose,
  prefer,
  keyRoot,
  currentMeasure,
  loopStart,
  loopEnd,
  onMeasureDown,
  onMeasureEnter,
  onGridUp,
  barHref,
  onBarJump,
}: Props) {
  // The grid's own width, watched rather than read once: the page is as wide
  // as the window now, so this changes without the sheet changing.
  const gridRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Read the sheet once. The playhead re-renders this component on every
  // eighth note, and working the runs out in the body of the render would
  // redo every bar of the sheet each time.
  const barRuns = useMemo(() => measureRuns(measures), [measures]);
  const spans = useMemo(() => spansOf(barRuns), [barRuns]);
  const rows = useMemo(() => packRows(spans, width), [spans, width]);

  // Follow the playhead down the page. The line is what moves, not the bar:
  // scrolling on every eighth would shuffle the page under a reader four
  // times a bar to no purpose, and the bars of a line are all read from the
  // same place anyway.
  const rowEls = useRef(new Map<number, HTMLDivElement | null>());
  const lastRow = useRef(-1);
  useEffect(() => {
    const row = rowIndexOf(rows, currentMeasure);
    if (row < 0) {
      lastRow.current = -1;
      return;
    }
    if (row === lastRow.current) return;
    // A row before the one just played means the loop has come round. That is
    // a jump rather than a journey: sliding the whole chart back past the
    // reader's eye is a worse interruption than simply being there.
    const wrapped = row < lastRow.current;
    lastRow.current = row;

    const el = rowEls.current.get(row);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const top = el.getBoundingClientRect().top + window.scrollY
      - window.innerHeight * PLAYHEAD_ANCHOR;
    window.scrollTo({
      top: Math.max(0, top),
      behavior: wrapped || reduce ? 'auto' : 'smooth',
    });
  }, [currentMeasure, rows]);

  const loopLo = loopStart !== null && loopEnd !== null ? Math.min(loopStart, loopEnd) : null;
  const loopHi = loopStart !== null && loopEnd !== null ? Math.max(loopStart, loopEnd) : null;

  return (
    <div
      className="chord-grid"
      ref={gridRef}
      onMouseUp={onGridUp}
      onMouseLeave={onGridUp}
    >
      {rows.length === 0 && (
        <div className="grid-empty">Enter chord progression above</div>
      )}
      {rows.map((row, rowIdx) => (
        <div
          key={row.start}
          className="chord-row-line"
          ref={(el) => { rowEls.current.set(rowIdx, el); }}
          style={{ gridTemplateColumns: `repeat(${row.perRow}, 1fr)` }}
        >
          {measures.slice(row.start, row.start + row.perRow).map((m, i) => {
            const index = row.start + i;
            const inLoop = loopLo !== null && loopHi !== null && index >= loopLo && index <= loopHi;
            const isCurrent = index === currentMeasure;
            const cls = [
              'measure',
              isCurrent ? 'measure-current' : '',
              inLoop ? 'measure-loop' : '',
            ].filter(Boolean).join(' ');

            let content: React.ReactNode;
            if (m.kind === 'repeat1') {
              content = (
                <span className="chord-row" aria-label="repeat previous bar">
                  {[0, 1, 2, 3].map((n) => (
                    <span key={n} className="chord chord-repeat">/</span>
                  ))}
                </span>
              );
            } else if (m.kind === 'repeat2') {
              content = <SimileMark variant="double" />;
            } else if (m.chords.length === 0) {
              content = <span className="measure-empty">·</span>;
            } else {
              // The same runs the layout sized this line from, so what is
              // drawn and what the line was measured for cannot drift apart.
              const runs = barRuns[index] ?? [];
              content = (
                <span className="chord-line">
                  {runs.map((r, idx) => (
                    <span
                      key={idx}
                      className="chord-run"
                      style={{ flexGrow: r.span }}
                    >
                      {r.chord && (() => {
                        const { degree, note } = chordLines(r.chord, transpose, prefer, keyRoot);
                        return (
                          <span className="chord">
                            <span className="chord-degree">{degree || ' '}</span>
                            <span className="chord-note">{note}</span>
                          </span>
                        );
                      })()}
                    </span>
                  ))}
                </span>
              );
            }

            return (
              <div
                key={index}
                className={cls}
                onMouseDown={(e) => { e.preventDefault(); onMeasureDown(index); }}
                onMouseEnter={() => onMeasureEnter(index)}
              >
                <BarNumber
                  index={index}
                  href={barHref ? barHref(index) : null}
                  onJump={onBarJump}
                />
                {content}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
