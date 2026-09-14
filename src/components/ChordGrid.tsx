import { useEffect, useMemo, useRef, useState } from 'react';
import type { Measure, Chord, Accidental } from '../chord';
import { chordToString, chordToDegree } from '../chord';
import { measureRuns } from '../slots';
import { spansOf, packRows } from '../layout';

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
}

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
      {rows.map((row) => (
        <div
          key={row.start}
          className="chord-row-line"
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
                <span className="measure-index">{index + 1}</span>
                {content}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
