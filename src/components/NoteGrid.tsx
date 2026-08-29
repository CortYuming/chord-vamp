import { useMemo } from 'react';
import type { Measure, Chord, Accidental } from '../chord';
import { noteLabel } from '../chord';
import { expandSong } from '../player';
import {
  chordTones, scaleFor, degreeLabel,
  SOLFEGE_SHARP, SOLFEGE_FLAT, KEY_DEGREE,
} from '../tones';

export type NoteLabelMode = 'note' | 'interval' | 'solfa';

interface Props {
  measures: Measure[];
  transpose: number;
  prefer: Accidental;
  keyRoot: number;
  mode: NoteLabelMode;
  currentMeasure: number;
  selected: number | null;
  onSelect: (i: number) => void;
}

// One column per run of beats holding the same chord, so a bar keeps its width
// whether it holds one chord or four. Beat resolution comes from the player,
// which already resolves repeat marks -- reading the sheet twice would let the
// two views disagree about what a bar contains.
interface Col {
  bar: number;        // zero-based source measure
  chord: Chord | null;
  span: number;       // in beats
  barStart: boolean;
}

const BEATS = 4;
const pc = (n: number) => (((n % 12) + 12) % 12);

function buildCols(measures: Measure[]): Col[] {
  const expanded = expandSong({ measures, errors: [] }, 0, -1);
  const cols: Col[] = [];
  for (const m of expanded) {
    let i = 0;
    while (i < m.beats.length) {
      const chord = m.beats[i];
      let span = 1;
      while (i + span < m.beats.length && m.beats[i + span] === chord) span++;
      cols.push({ bar: m.sourceIndex, chord, span, barStart: i === 0 });
      i += span;
    }
  }
  return cols;
}

export function NoteGrid({
  measures, transpose, prefer, keyRoot, mode,
  currentMeasure, selected, onSelect,
}: Props) {
  const cols = useMemo(() => buildCols(measures), [measures]);
  const bars = useMemo(
    () => Array.from(new Set(cols.map((c) => c.bar))),
    [cols],
  );
  const flat = prefer === 'flat';

  if (cols.length === 0) return null;

  const totalBeats = bars.length * BEATS;

  // A note's reading. Names and solfege count from the key; degrees count from
  // the chord, because a degree only means anything against its own chord.
  const label = (semiFromKey: number, chord: Chord | null): string => {
    if (mode === 'note') return noteLabel(pc(keyRoot + semiFromKey), prefer);
    if (mode === 'solfa') return (flat ? SOLFEGE_FLAT : SOLFEGE_SHARP)[semiFromKey];
    if (!chord || chord.root === null) return KEY_DEGREE[semiFromKey];
    const rel = pc(keyRoot + semiFromKey - (chord.root + transpose));
    return degreeLabel(rel, chord.quality);
  };

  const style = { gridTemplateColumns: `repeat(${totalBeats}, minmax(0, 1fr))` };

  return (
    <div className="note-grid-wrap">
      <div
        className="note-grid"
        style={{ ...style, minWidth: `${bars.length * 108}px` }}
      >
        {/* bar numbers */}
        {bars.map((b, i) => (
          <div
            key={`n${b}`}
            className={'ng-bar-no' + (i % 4 === 0 ? ' ng-rule' : '')
              + (b === currentMeasure ? ' ng-now' : '')}
            style={{ gridColumn: `span ${BEATS}` }}
          >
            {b + 1}
          </div>
        ))}

        {/* chord names */}
        {cols.map((c, i) => (
          <button
            key={`c${i}`}
            type="button"
            className={'ng-chord' + (c.barStart && bars.indexOf(c.bar) % 4 === 0 ? ' ng-rule' : '')
              + (i === selected ? ' ng-sel' : '')}
            style={{ gridColumn: `span ${c.span}` }}
            onClick={() => onSelect(i)}
          >
            {c.chord && c.chord.root !== null
              ? noteLabel(pc(c.chord.root + transpose), prefer) + c.chord.quality
              : '·'}
          </button>
        ))}

        {/* the key's twelve notes, high at the top */}
        {Array.from({ length: 12 }, (_, r) => 11 - r).map((semi) => (
          cols.map((c, i) => {
            const has = c.chord && c.chord.root !== null;
            let state: 'tone' | 'scale' | 'none' = 'none';
            let rel = 0;
            if (has) {
              rel = pc(keyRoot + semi - (c.chord!.root! + transpose));
              const { tones } = chordTones(c.chord!.quality);
              if (tones.includes(rel)) state = 'tone';
              else if (scaleFor(c.chord!.quality).notes.includes(rel)) state = 'scale';
            }
            return (
              <div
                key={`${semi}-${i}`}
                className={'ng-cell ng-' + state
                  + (c.barStart && bars.indexOf(c.bar) % 4 === 0 ? ' ng-rule' : '')
                  + (state === 'tone' && rel === 0 ? ' ng-root' : '')
                  + (i === selected ? '' : ' ng-dim')}
                style={{ gridColumn: `span ${c.span}`, ['--c' as string]: `var(--deg-${rel})` }}
              >
                {label(semi, c.chord)}
              </div>
            );
          })
        ))}
      </div>
    </div>
  );
}
