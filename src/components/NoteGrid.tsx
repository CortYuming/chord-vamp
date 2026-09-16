import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Measure, Chord, Accidental } from '../chord';
import { chordDegreeRoot, noteLabel, SLOTS_PER_MEASURE } from '../chord';
import { expandSong, slotRuns } from '../slots';
import {
  chordTones, scaleFor, degreeLabel,
  SOLFEGE_SHARP, SOLFEGE_FLAT, KEY_DEGREE,
} from '../tones';

export type { NoteLabelMode } from '../storage';
import type { NoteLabelMode } from '../storage';

interface Props {
  measures: Measure[];
  transpose: number;
  prefer: Accidental;
  keyRoot: number;
  mode: NoteLabelMode;
  currentMeasure: number;
  /** Whether the music is running, which decides how the strip is followed. */
  playing: boolean;
  /** Where the music is, in fractional bars. See Player.position(). */
  position: () => number | null;
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
  span: number;       // in eighth-note slots
  barStart: boolean;
}

const pc = (n: number) => (((n % 12) + 12) % 12);

// Eight slots to the bar, so an off-beat chord gets a column of its own here
// too -- and a column that narrow cannot be read. The strip is as wide as its
// finest column needs and no wider: a sheet of whole-bar chords keeps the
// width it always had, and one written in eighths gets twice it. The strip
// scrolls, so width costs nothing but the scrolling.
const MIN_COL_PX = 27;
const BAR_MIN_PX = 108;

// What one slot has to be worth for the finest column on the strip to stay
// readable. Held in slots rather than in bars, because a bar of 2/4 is half
// the bar of 4/4 beside it and the strip is what shows that.
function slotWidthPx(finestSpan: number): number {
  return Math.max(MIN_COL_PX / finestSpan, BAR_MIN_PX / SLOTS_PER_MEASURE);
}

function buildCols(measures: Measure[]): Col[] {
  const expanded = expandSong({ measures, errors: [] }, 0, -1);
  const cols: Col[] = [];
  for (const m of expanded) {
    for (const run of slotRuns(m.slots)) {
      cols.push({
        bar: m.sourceIndex,
        chord: run.chord,
        span: run.span,
        barStart: run.start === 0,
      });
    }
  }
  return cols;
}

export function NoteGrid({
  measures, transpose, prefer, keyRoot, mode,
  currentMeasure, playing, position, selected, onSelect,
}: Props) {
  const cols = useMemo(() => buildCols(measures), [measures]);
  // The bars of the strip and how long each one runs, added up from the columns
  // it was drawn in. The strip is built from the same runs the player
  // sequences, so a bar's length here is its own meter rather than a second
  // reading of the sheet. Columns arrive in bar order, so one pass groups them.
  const barList = useMemo(() => {
    const out: { bar: number; slots: number }[] = [];
    for (const c of cols) {
      const last = out[out.length - 1];
      if (last && last.bar === c.bar) last.slots += c.span;
      else out.push({ bar: c.bar, slots: c.span });
    }
    return out;
  }, [cols]);
  const bars = useMemo(() => barList.map((b) => b.bar), [barList]);
  const flat = prefer === 'flat';

  // Follow the playhead. The strip is wider than the screen by design, so a
  // bar past the right edge would otherwise be unreachable while playing.
  // The current bar sits a third in rather than centred: what is coming is
  // worth more room than what has just gone by.
  const wrapRef = useRef<HTMLDivElement>(null);
  const barEls = useRef(new Map<number, HTMLDivElement>());

  // The line the music passes under. Drawn over the strip rather than in it, so
  // it can stand wherever the moment falls inside a bar instead of on the bar
  // line: what this view is for is what is sounding now, and at the tempos it
  // gets read at a bar is two or three seconds of it.
  const lineRef = useRef<HTMLDivElement>(null);
  const placeLine = useCallback(() => {
    const wrap = wrapRef.current;
    const line = lineRef.current;
    if (!wrap || !line) return;
    const at = playing ? position() : null;
    const bar = at === null ? currentMeasure : Math.floor(at);
    const el = bar >= 0 ? barEls.current.get(bar) : undefined;
    if (!el) {
      line.hidden = true;
      return;
    }
    const into = at === null ? 0 : at - bar;
    line.hidden = false;
    line.style.transform =
      `translateX(${el.offsetLeft + into * el.offsetWidth - wrap.scrollLeft}px)`;
  }, [playing, position, currentMeasure]);

  // The strip moves for three reasons -- the frame loop, a jump to a bar, a
  // hand on the scrollbar -- and the line keeps up with all of them.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    wrap.addEventListener('scroll', placeLine, { passive: true });
    return () => wrap.removeEventListener('scroll', placeLine);
  }, [placeLine]);

  useEffect(placeLine, [placeLine]);
  const still = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Moving the playhead by hand, or following it while the music is held: one
  // bar at a time, since there is nothing in between to follow.
  useEffect(() => {
    if (playing && !still) return;
    if (currentMeasure < 0) return;
    const wrap = wrapRef.current;
    const el = barEls.current.get(currentMeasure);
    if (!wrap || !el) return;
    const target = el.offsetLeft - wrap.clientWidth / 3;
    wrap.scrollTo({
      left: Math.max(0, target),
      behavior: still ? 'auto' : 'smooth',
    });
  }, [currentMeasure, playing, still]);

  // Playing: the strip travels with the music rather than stepping from bar to
  // bar. A bar takes a bar's worth of time to cross, so the notes pass the same
  // point at the same rate they are heard -- what the eye is doing while
  // reading is the same thing the ear is doing, and a jump every four beats
  // keeps interrupting it.
  useEffect(() => {
    if (!playing || still) return;
    let frame = 0;
    const follow = () => {
      frame = requestAnimationFrame(follow);
      const wrap = wrapRef.current;
      const at = position();
      if (!wrap || at === null) return;
      const bar = Math.floor(at);
      const el = barEls.current.get(bar);
      if (!el) return;
      const x = el.offsetLeft + (at - bar) * el.offsetWidth - wrap.clientWidth / 3;
      wrap.scrollLeft = Math.max(0, x);
      placeLine();
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [playing, position, still, placeLine]);

  if (cols.length === 0) return null;

  const totalSlots = cols.reduce((n, c) => n + c.span, 0);
  // The narrowest column the strip has to draw, which is what sets its width.
  // Seeded from the first column rather than from a bar of 4/4: a sheet whose
  // bars all run longer than that would have been measured against a bar it
  // does not contain.
  const finest = cols.reduce((n, c) => Math.min(n, c.span), cols[0].span);

  // A note's reading. Names and solfege count from the key; degrees count from
  // the chord, because a degree only means anything against its own chord.
  const label = (semiFromKey: number, chord: Chord | null): string => {
    if (mode === 'note') return noteLabel(pc(keyRoot + semiFromKey), prefer);
    if (mode === 'solfa') return (flat ? SOLFEGE_FLAT : SOLFEGE_SHARP)[semiFromKey];
    if (!chord || chord.root === null) return KEY_DEGREE[semiFromKey];
    const rel = pc(keyRoot + semiFromKey - (chord.root + transpose));
    return degreeLabel(rel, chord.quality);
  };

  const style = { gridTemplateColumns: `repeat(${totalSlots}, minmax(0, 1fr))` };

  return (
    <div className="note-grid-frame">
      <div className="ng-playhead" ref={lineRef} hidden />
      <div className="note-grid-wrap" ref={wrapRef}>
      <div
        className="note-grid"
        style={{ ...style, minWidth: `${totalSlots * slotWidthPx(finest)}px` }}
      >
        {/* bar numbers */}
        {barList.map(({ bar: b, slots }, i) => (
          <div
            key={`n${b}`}
            ref={(el) => {
              if (el) barEls.current.set(b, el);
              else barEls.current.delete(b);
            }}
            className={'ng-bar-no' + (i % 4 === 0 ? ' ng-rule' : '')
              + (b === currentMeasure ? ' ng-now' : '')}
            style={{ gridColumn: `span ${slots}` }}
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
            <span className="ng-cname">
              {c.chord && c.chord.root !== null
                ? noteLabel(pc(c.chord.root + transpose), prefer) + c.chord.quality
                : '·'}
            </span>
            <span className="ng-roman">
              {c.chord ? chordDegreeRoot(c.chord, keyRoot, transpose) : ''}
            </span>
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
    </div>
  );
}
