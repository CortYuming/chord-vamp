import type { Measure, Chord, Accidental } from '../chord';
import { chordToString, chordToDegree } from '../chord';

export type Notation = 'notes' | 'degrees';

interface Props {
  measures: Measure[];
  transpose: number;
  prefer: Accidental;
  notation: Notation;
  keyRoot: number;
  currentMeasure: number;
  loopStart: number | null;
  loopEnd: number | null;
  onMeasureDown: (i: number) => void;
  onMeasureEnter: (i: number) => void;
  onGridUp: () => void;
}

const MEASURES_PER_ROW = 4;

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

function displayChord(
  chord: Chord,
  transpose: number,
  prefer: Accidental,
  notation: Notation,
  keyRoot: number,
): string {
  if (chord.root === null) return chord.raw;
  if (notation === 'degrees') return chordToDegree(chord, keyRoot, transpose);
  const shifted: Chord = {
    ...chord,
    root: (((chord.root + transpose) % 12) + 12) % 12,
    bass: chord.bass !== null
      ? (((chord.bass + transpose) % 12) + 12) % 12
      : null,
  };
  return chordToString(shifted, prefer);
}

export function ChordGrid({
  measures,
  transpose,
  prefer,
  notation,
  keyRoot,
  currentMeasure,
  loopStart,
  loopEnd,
  onMeasureDown,
  onMeasureEnter,
  onGridUp,
}: Props) {
  const rows: Measure[][] = [];
  for (let i = 0; i < measures.length; i += MEASURES_PER_ROW) {
    rows.push(measures.slice(i, i + MEASURES_PER_ROW));
  }

  const loopLo = loopStart !== null && loopEnd !== null ? Math.min(loopStart, loopEnd) : null;
  const loopHi = loopStart !== null && loopEnd !== null ? Math.max(loopStart, loopEnd) : null;

  return (
    <div
      className="chord-grid"
      onMouseUp={onGridUp}
      onMouseLeave={onGridUp}
    >
      {rows.length === 0 && (
        <div className="grid-empty">Enter chord progression above</div>
      )}
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="chord-row-line">
          {row.map((m, i) => {
            const index = rowIdx * MEASURES_PER_ROW + i;
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
              content = (
                <span className="chord-row">
                  {m.chords.map((c, idx) => (
                    c.isRepeat ? (
                      <span
                        key={idx}
                        className="chord chord-repeat"
                        aria-label="repeat previous chord"
                      >
                        /
                      </span>
                    ) : (
                      <span key={idx} className="chord">
                        {displayChord(c, transpose, prefer, notation, keyRoot)}
                      </span>
                    )
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
