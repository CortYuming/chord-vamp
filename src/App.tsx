import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  KEY_CHOICES, keyChoiceFor, keyPreferFor, noteLabel, parseSong, resolveKeyRoot, transposeSong,
} from './chord';
import { ChordGrid } from './components/ChordGrid';
import { NoteGrid, type NoteLabelMode } from './components/NoteGrid';
import { useSongs } from './hooks/useSongs';
import type { PlayerState } from './player';
import { Player } from './player';
import { BEATS_PER_MEASURE } from './bass';
import * as Tone from 'tone';
import {
  loadCurrent, loadPrefs, loadSongs, loadYtPrefs, newSong, saveCurrent, savePrefs, saveYtPrefs,
  type Song,
} from './storage';
import { barUrl, jumpToBar, readYtSource } from './ytloop';

const NOTE_MODES: [NoteLabelMode, string][] = [
  ['note', 'Notes'],
  ['interval', 'Intervals'],
  ['solfa', 'Solfege'],
];

interface KeySnapshot {
  chordsRaw: string;
  keyRoot: number | null;
  keyMinor: boolean;
  transpose: number;
}

const DEFAULT_CHORDS = '|F13|Bb9|F13|F13|Bb9|Bb9|F13|D7#9|G7|C7#9|F13 D7#9|G7#9|';

// Inputs that hold words. A key pressed in one of these is being typed, never
// a shortcut. Every other input -- a number, a slider, a checkbox -- is set
// rather than written in, and the shortcuts stay live over it.
const TEXT_ENTRY_TYPES = new Set(['text', 'search', 'url', 'email', 'password', 'tel']);


// A sheet handed over by yt-loop, read from the URL this page was opened with.
// The link is the whole of the handover, and the page keeps the one it landed
// on, so this is read once at load rather than watched: read it again on every
// render and the app would be re-deciding what it is showing four times a bar.
// Null for an ordinary visit, which is every other line below's "not in that
// mode".
const YT_SOURCE = readYtSource(window.location.search);
// What this app was last set to for that video -- tempo, transposition, the
// bars being worked on. The sheet is yt-loop's; these are ours.
const YT_PREFS = YT_SOURCE ? loadYtPrefs(YT_SOURCE.videoId) : null;

function App() {
  const { songs, upsert, remove } = useSongs();
  // The note grid is a second reading of the same sheet, off by default: it is
  // for studying what the chords are made of, not for playing from.
  const [showNotes, setShowNotes] = useState(() => loadPrefs().showAnalysis);
  // The sheet text is what the grid was built from, not what is read while the
  // tune goes past, so it starts folded away. It opens under the grid, where
  // the button that opens it is -- an editor that appeared a screen above the
  // button would leave the eye hunting for what had changed.
  const [showSheet, setShowSheet] = useState(false);
  const [noteMode, setNoteMode] = useState<NoteLabelMode>(() => loadPrefs().noteMode);
  const [noteSel, setNoteSel] = useState<number | null>(null);
  const [currentSong, setCurrentSong] = useState<Song>(() => {
    // A sheet from yt-loop is not a song of this app's: it is not in the list,
    // it is not saved, and it is not what the next ordinary visit opens on. It
    // wears the Song shape because that is what the player and the grid read.
    if (YT_SOURCE) {
      return newSong({
        name: YT_SOURCE.title,
        chordsRaw: YT_SOURCE.chords,
        keyRoot: YT_SOURCE.keyRoot,
        keyMinor: YT_SOURCE.keyMinor,
        bpm: YT_PREFS?.bpm ?? 85,
        transpose: YT_PREFS?.transpose ?? 0,
        countIn: true,
      });
    }
    const songId = new URLSearchParams(window.location.search).get('song');
    if (songId) {
      const found = loadSongs().find(s => s.id === songId);
      if (found) return found;
    }
    const saved = loadCurrent();
    if (saved) return saved;
    return newSong({
      chordsRaw: DEFAULT_CHORDS,
      bpm: 85,
      countIn: true,
    });
  });

  useEffect(() => {
    // Not while reading a sheet from yt-loop: whatever song was being worked on
    // here is still the one to come back to, and a transcription opened for ten
    // minutes must not take its place.
    if (YT_SOURCE) return;
    saveCurrent(currentSong);
  }, [currentSong]);
  // Three states, not two: stopped is at the top of the chart, paused is
  // standing in the middle of it. Space moves between playing and paused, and
  // Stop is what goes back to the top.
  const [playState, setPlayState] = useState<PlayerState>('stopped');
  const isPlaying = playState === 'playing';
  // Playing or paused: the player is built either way, so a tempo or a part
  // changed while the music is held still applies to it.
  const isRunning = playState !== 'stopped';
  // The playhead: the bar that is sounding, or -- stopped -- the bar the next
  // Play will start from. Moved by the arrows and by clicking a bar, so it
  // outlives a run rather than being wiped when the music stops. -1 is a chart
  // nobody has pointed at yet, which starts from the top.
  const [currentMeasure, setCurrentMeasure] = useState(-1);
  // The count-in, as the number of beats that have been struck: null while
  // there is no count to show, then 0 the moment Play is pressed and one more
  // on every click. A count that is counted up rather than taken away survives
  // a frame busy enough to carry two beats at once.
  const [countInBeat, setCountInBeat] = useState<number | null>(null);
  const [loopStart, setLoopStart] = useState<number | null>(YT_PREFS?.loopStart ?? null);
  const [loopEnd, setLoopEnd] = useState<number | null>(YT_PREFS?.loopEnd ?? null);
  const [theme, setTheme] = useState<'light' | 'dark' | null>(() => loadPrefs().theme);
  const [volume, setVolume] = useState<number>(() => loadPrefs().volume);
  const [swing, setSwing] = useState<boolean>(() => loadPrefs().swing);
  const [bassOn, setBassOn] = useState<boolean>(() => loadPrefs().bass);
  const [drumsOn, setDrumsOn] = useState<boolean>(() => loadPrefs().drums);

  // A key edit is staged, not applied on selection: the select holds a pending
  // choice until Set or Set and transpose commits it, so a stray scroll over
  // the dropdown cannot transpose the song. Every commit pushes the key state
  // it replaced, which is what Undo walks back.
  const [pendingSel, setPendingSel] = useState<number | null>(null);
  const [keyHistory, setKeyHistory] = useState<KeySnapshot[]>([]);

  useEffect(() => {
    savePrefs({ volume, swing, theme, showAnalysis: showNotes, noteMode, bass: bassOn, drums: drumsOn });
    const db = volume <= 0 ? -Infinity : 20 * Math.log10(volume / 100);
    Tone.getDestination().volume.rampTo(db, 0.05);
  }, [volume, swing, theme, showNotes, noteMode, bassOn, drumsOn]);

  useEffect(() => {
    if (isRunning) playerRef.current?.setSwing(swing);
  }, [swing, isRunning]);

  useEffect(() => {
    if (isRunning) playerRef.current?.setParts(bassOn, drumsOn);
  }, [bassOn, drumsOn, isRunning]);


  const playerRef = useRef<Player | null>(null);
  if (!playerRef.current) playerRef.current = new Player();

  const parsed = useMemo(() => parseSong(currentSong.chordsRaw), [currentSong.chordsRaw]);

  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
  }, [theme]);

  useEffect(() => {
    return () => {
      playerRef.current?.stop();
    };
  }, []);

  const update = useCallback((patch: Partial<Song>) => {
    setCurrentSong(prev => ({ ...prev, ...patch }));
  }, []);

  // Our side of a yt-loop sheet, kept per video: the tempo it is being worked
  // at, how far it has been moved, and the bars being gone over. Next week the
  // same button opens it where it was left instead of at 85 and no loop.
  useEffect(() => {
    if (!YT_SOURCE) return;
    saveYtPrefs(YT_SOURCE.videoId, {
      bpm: currentSong.bpm,
      transpose: currentSong.transpose,
      loopStart,
      loopEnd,
    });
  }, [currentSong.bpm, currentSong.transpose, loopStart, loopEnd]);

  // Written key: what the sheet says, before transposition.
  const tonicRoot = useMemo(
    () => resolveKeyRoot(currentSong.keyRoot, parsed.measures),
    [currentSong.keyRoot, parsed],
  );
  // Sounding key: what comes out of the speakers.
  const displayedKey = (((tonicRoot + currentSong.transpose) % 12) + 12) % 12;
  const prefer = keyPreferFor(displayedKey);

  // Where the select is sitting: the sounding key, read as major or minor
  // according to what the sheet was said to be in.
  const currentChoice = keyChoiceFor(displayedKey, currentSong.keyMinor);
  const currentSel = KEY_CHOICES.indexOf(currentChoice);
  const pending = pendingSel === null ? null : KEY_CHOICES[pendingSel];
  const pendingKey = pending ? pending.tonic : null;
  const pendingActive = pending !== null && pendingSel !== currentSel;

  const pushKeyHistory = () => {
    setKeyHistory(prev => [
      ...prev,
      {
        chordsRaw: currentSong.chordsRaw,
        keyRoot: currentSong.keyRoot ?? null,
        keyMinor: currentSong.keyMinor,
        transpose: currentSong.transpose,
      },
    ]);
  };

  // Set: the chords stay exactly as typed, and the sheet is read against the
  // chosen key. iReal Pro's Set, and the fix for a tune that opens off the
  // tonic.
  const handleSetKey = () => {
    if (pending === null || pendingKey === null) return;
    pushKeyHistory();
    update({
      keyRoot: (((pendingKey - currentSong.transpose) % 12) + 12) % 12,
      keyMinor: pending.minor,
    });
    setPendingSel(null);
  };

  // Set and transpose: a hard transposition, as in iReal Pro's editor. The
  // sheet text is rewritten into the chosen key and the soft transpose is
  // cleared, so the input box and the grid agree again. The degrees hold still.
  const handleSetAndTranspose = () => {
    if (pending === null || pendingKey === null) return;
    pushKeyHistory();
    const semitones = (((pendingKey - tonicRoot) % 12) + 12) % 12;
    update({
      chordsRaw: transposeSong(currentSong.chordsRaw, semitones, keyPreferFor(pendingKey)),
      keyRoot: pendingKey,
      keyMinor: pending.minor,
      transpose: 0,
    });
    setPendingSel(null);
  };

  const handleUndoKey = () => {
    const prev = keyHistory[keyHistory.length - 1];
    if (!prev) return;
    setKeyHistory(h => h.slice(0, -1));
    update({
      chordsRaw: prev.chordsRaw,
      keyRoot: prev.keyRoot,
      keyMinor: prev.keyMinor,
      transpose: prev.transpose,
    });
    setPendingSel(null);
  };

  const undoTitle = (() => {
    const prev = keyHistory[keyHistory.length - 1];
    if (!prev) return '';
    const root = resolveKeyRoot(prev.keyRoot, parsed.measures);
    const sounding = (((root + prev.transpose) % 12) + 12) % 12;
    const sign = prev.transpose >= 0 ? '+' : '';
    const rewritten = prev.chordsRaw !== currentSong.chordsRaw ? ', restoring the chords' : '';
    return `Back to ${noteLabel(root, keyPreferFor(root))} / sounding `
      + `${noteLabel(sounding, keyPreferFor(sounding))} (${sign}${prev.transpose})${rewritten}`;
  })();

  /**
   * The bars the playhead may stand on: the loop when there is one, otherwise
   * the whole sheet. An empty sheet gives an empty range, which every move
   * below checks for.
   */
  const pointRange = useMemo<[number, number]>(() => {
    if (loopStart !== null && loopEnd !== null) {
      return [Math.min(loopStart, loopEnd), Math.max(loopStart, loopEnd)];
    }
    return [0, parsed.measures.length - 1];
  }, [loopStart, loopEnd, parsed.measures.length]);

  // Where the music has got to, for a view that follows it between beats.
  // Stable across renders: the strip's frame loop holds on to it.
  const playPosition = useCallback(() => playerRef.current?.position() ?? null, []);

  // Put the playhead on a bar. While the music is running it takes the sound
  // with it; stopped, it is where Play will begin.
  const movePoint = (measureIdx: number) => {
    const [lo, hi] = pointRange;
    if (hi < lo || measureIdx < lo || measureIdx > hi) return;
    setCurrentMeasure(measureIdx);
    playerRef.current?.seek(measureIdx);
  };

  // One bar left or right, round the ends of the loop -- or of the sheet, when
  // there is no loop. A playhead that is nowhere yet starts from the first bar.
  const stepPoint = (delta: number) => {
    const [lo, hi] = pointRange;
    if (hi < lo) return;
    const span = hi - lo + 1;
    const from = currentMeasure >= lo && currentMeasure <= hi ? currentMeasure : lo;
    movePoint(lo + ((((from - lo + delta) % span) + span) % span));
  };

  // From the playhead, with the count if the song asks for one. Pressing Play
  // on a chart that has never been pointed at starts it at the top.
  const startRun = async () => {
    if (parsed.measures.length === 0) return;
    const player = playerRef.current!;
    const hasLoop = loopStart !== null && loopEnd !== null;
    const useCountIn = currentSong.countIn && !hasLoop;
    const [lo, hi] = pointRange;
    const from = currentMeasure >= lo && currentMeasure <= hi ? currentMeasure : lo;
    setCurrentMeasure(from);
    setPlayState('playing');
    setCountInBeat(useCountIn ? 0 : null);
    await player.start({
      song: parsed,
      bpm: currentSong.bpm,
      countIn: useCountIn,
      loopStart: loopStart ?? 0,
      loopEnd: loopEnd ?? -1,
      transpose: currentSong.transpose,
      startMeasure: from,
      swing,
      bass: bassOn,
      drums: drumsOn,
      // The count leaves the playhead where it is: the bar about to sound is
      // the one to be looking at while the four beats go by.
      onBeat: (mIdx, bIdx, isCountIn) => {
        if (isCountIn) {
          setCountInBeat(bIdx + 1);
        } else {
          setCurrentMeasure(mIdx);
          setCountInBeat(null);
        }
      },
      onStop: () => {
        setPlayState('stopped');
        setCountInBeat(null);
      },
    });
  };

  // The one button, and the space bar behind it: play, hold, go on from where
  // it was held. Getting back to the top is the rewind button's job.
  const handlePlay = async () => {
    const player = playerRef.current!;
    if (playState === 'playing') {
      player.pause();
      setPlayState('paused');
      // Held during the count: the beats struck so far are given back, since
      // the count starts over on the way in.
      if (countInBeat !== null) setCountInBeat(0);
      return;
    }
    if (playState === 'paused') {
      // Two beats counted and then a pause is not a count-in. Anything held
      // during the count goes back to the start of it rather than picking the
      // four up halfway.
      if (countInBeat !== null) {
        await startRun();
        return;
      }
      setPlayState('playing');
      await player.resume();
      return;
    }
    await startRun();
  };

  // Back to the top, standing still: the run is torn down and the playhead is
  // put on the first bar of what is being played -- the loop's first bar when
  // there is a loop.
  const handleRewind = () => {
    playerRef.current?.stop();
    setCurrentMeasure(pointRange[0]);
  };

  useEffect(() => {
    if (isRunning) playerRef.current?.setBpm(currentSong.bpm);
  }, [currentSong.bpm, isRunning]);

  useEffect(() => {
    if (isRunning) playerRef.current?.setTranspose(currentSong.transpose);
  }, [currentSong.transpose, isRunning]);

  const nameTrimmed = currentSong.name.trim();
  const savedVersion = useMemo(
    () => songs.find(s => s.id === currentSong.id) ?? null,
    [songs, currentSong.id],
  );

  const isDirty = useMemo(() => {
    if (!savedVersion) return true;
    return (
      savedVersion.name !== currentSong.name ||
      savedVersion.chordsRaw !== currentSong.chordsRaw ||
      savedVersion.bpm !== currentSong.bpm ||
      savedVersion.transpose !== currentSong.transpose ||
      (savedVersion.keyRoot ?? null) !== (currentSong.keyRoot ?? null) ||
      savedVersion.countIn !== currentSong.countIn
    );
  }, [savedVersion, currentSong]);

  const canSave = isDirty && nameTrimmed.length > 0;
  const isInList = savedVersion !== null;
  const nameInvalid = isDirty && !nameTrimmed;

  // Keep the ?song=<id> URL param in sync so a saved song is deep-linkable
  // (survives renames since it uses the stable id, not the title).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (isInList) {
      url.searchParams.set('song', currentSong.id);
    } else {
      url.searchParams.delete('song');
    }
    window.history.replaceState(null, '', url);
  }, [isInList, currentSong.id]);

  const handleSave = () => {
    if (!canSave) return;
    upsert({ ...currentSong, name: nameTrimmed });
  };

  const handleNew = () => {
    playerRef.current?.stop();
    setCurrentSong(newSong({
      chordsRaw: '',
      bpm: 85,
      countIn: true,
    }));
    setLoopStart(null);
    setLoopEnd(null);
    setPendingSel(null);
    setKeyHistory([]);
  };

  const handleLoad = (id: string) => {
    const s = songs.find(x => x.id === id);
    if (!s) return;
    playerRef.current?.stop();
    setCurrentSong(s);
    setLoopStart(null);
    setLoopEnd(null);
    setPendingSel(null);
    setKeyHistory([]);
  };

  const handleDelete = () => {
    if (!songs.find(s => s.id === currentSong.id)) return;
    if (!window.confirm(`Delete "${currentSong.name}"?`)) return;
    remove(currentSong.id);
    handleNew();
  };

  // One press on the bars means two things, told apart by whether the pointer
  // travelled: let go on the bar it started on and it is a click, which moves
  // the playhead; drag across bars and it is a loop. Kept in refs because a
  // drag reads them between renders -- the loop drawn as it goes is the state
  // that does re-render.
  const dragFrom = useRef<number | null>(null);
  const dragged = useRef(false);

  const handleMeasureDown = (i: number) => {
    dragFrom.current = i;
    dragged.current = false;
  };

  const handleMeasureEnter = (i: number) => {
    const from = dragFrom.current;
    if (from === null) return;
    if (i === from && !dragged.current) return;
    dragged.current = true;
    setLoopStart(from);
    setLoopEnd(i);
  };

  const handleGridUp = () => {
    const from = dragFrom.current;
    if (from === null) return;
    dragFrom.current = null;
    if (dragged.current) {
      // The loop is not the one the run was built on any more, so the run goes,
      // and the playhead moves to the first bar of what was just marked out.
      if (isRunning) playerRef.current?.stop();
      if (loopStart !== null && loopEnd !== null) {
        setCurrentMeasure(Math.min(loopStart, loopEnd));
      }
      return;
    }
    movePoint(from);
  };

  const clearLoop = () => {
    setLoopStart(null);
    setLoopEnd(null);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target;
      // A field being typed into keeps every key it is sent.
      if (target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLInputElement && TEXT_ENTRY_TYPES.has(target.type)) return;
      const known = e.key === 'ArrowLeft' || e.key === 'ArrowRight'
        || e.key === ' ' || e.key === 'e' || e.key === 'E';
      if (!known) return;
      // The arrows step BPM and the volume slider, so those two keep them.
      // Every control here holds focus once it has been used, though, and the
      // browser then claims the rest for it -- space opens a dropdown, presses
      // a button again, ticks a checkbox. Space belongs to Play wherever it is
      // pressed, so drop focus and take the key.
      const stepped = target instanceof HTMLInputElement
        && (target.type === 'number' || target.type === 'range');
      if (stepped && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
      e.preventDefault();
      if (target instanceof HTMLElement) target.blur();
      if (e.key === 'ArrowLeft') stepPoint(-1);
      else if (e.key === 'ArrowRight') stepPoint(1);
      else if (e.key === ' ') handlePlay();
      else setShowSheet(v => !v);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const toggleTheme = () => {
    const cur = theme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(cur === 'dark' ? 'light' : 'dark');
  };

  const [copyUrlLabel, setCopyUrlLabel] = useState('🔗 URL');
  const [copyMdLabel, setCopyMdLabel] = useState('📝 MD');

  const handleCopyURL = () => {
    navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => {
        setCopyUrlLabel('✓ Copied');
        setTimeout(() => setCopyUrlLabel('🔗 URL'), 1400);
      })
      .catch(() => {
        setCopyUrlLabel('(failed)');
        setTimeout(() => setCopyUrlLabel('🔗 URL'), 1400);
      });
  };

  const handleCopyMarkdown = () => {
    const label = currentSong.name.trim() || 'Chord Vamp';
    const md = `[${label}](${window.location.href})`;
    navigator.clipboard
      ?.writeText(md)
      .then(() => {
        setCopyMdLabel('✓ Copied');
        setTimeout(() => setCopyMdLabel('📝 MD'), 1400);
      })
      .catch(() => {
        setCopyMdLabel('(failed)');
        setTimeout(() => setCopyMdLabel('📝 MD'), 1400);
      });
  };

  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const handleTap = () => {
    const now = performance.now();
    const next = [...tapTimes, now].slice(-4);
    setTapTimes(next);
    if (next.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < next.length; i++) intervals.push(next[i] - next[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avg);
      if (bpm >= 40 && bpm <= 300) update({ bpm });
    }
  };

  const hasLoop = loopStart !== null && loopEnd !== null;

  // A bar number leads back to the video it was transcribed from. Held in a
  // local so its type still says "there is a source" inside the two closures.
  const yt = YT_SOURCE;
  const barHref = yt ? (i: number) => barUrl(yt, i, window.location.href) : undefined;
  const handleBarJump = yt ? (i: number) => { jumpToBar(yt, i); } : undefined;

  return (
    <div className="app">
      <header className="header">
        <h1 className="brand">🎷 Chord Vamp</h1>
        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={handleCopyURL}
            disabled={!isInList}
            title={isInList ? 'Copy link to this song' : 'Save the song first to get a shareable link'}
          >{copyUrlLabel}</button>
          <button
            className="icon-btn"
            onClick={handleCopyMarkdown}
            disabled={!isInList}
            title={isInList ? 'Copy Markdown link' : 'Save the song first to get a shareable link'}
          >{copyMdLabel}</button>
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">◐</button>
        </div>
      </header>

      {YT_SOURCE ? (
        // Where the sheet came from, and that it is not ours to change. The
        // song controls are gone rather than disabled: none of saving, loading
        // or renaming means anything for a transcription that lives elsewhere.
        <section className="yt-source">
          <span className="yt-source-from">yt-loop</span>
          <span className="yt-source-name">{YT_SOURCE.title || YT_SOURCE.videoId}</span>
          <span className="yt-source-ro">read only</span>
          {/* Why the bar numbers are plain numbers here. A sheet can be written
              as chords alone -- nobody has caught the times yet, or the tune was
              written down away from the video -- and then there is nowhere for a
              number to lead. Said out loud rather than left as an absence: a
              link that is simply missing reads as a broken one. */}
          {!YT_SOURCE.bars.some(b => b.start !== null) && (
            <span className="yt-source-note">
              no bar times in this sheet — mark them in yt-loop to jump from a bar number
            </span>
          )}
        </section>
      ) : (
      <section className={`song-meta${nameInvalid ? ' song-meta-with-hint' : ''}`}>
        <div className="song-name-wrap">
          <input
            className={`song-name${nameInvalid ? ' song-name-invalid' : ''}`}
            value={currentSong.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Song name"
            aria-invalid={nameInvalid}
            title={nameInvalid ? 'Enter a name to enable Save' : undefined}
          />
          {nameInvalid && (
            <span className="save-hint" role="status">Enter a name to save</span>
          )}
        </div>
        <select
          value={isInList ? currentSong.id : ''}
          onChange={(e) => handleLoad(e.target.value)}
          disabled={songs.length === 0}
        >
          <option value="" disabled hidden>
            {songs.length === 0 ? '(no saved songs)' : 'Load saved…'}
          </option>
          {songs.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {canSave && (
          <button
            className={`save-btn${isInList ? ' save-btn-update' : ''}`}
            onClick={handleSave}
            title={isInList ? 'Update saved song' : 'Save as new'}
          >💾 {isInList ? 'Update' : 'Save'}</button>
        )}
        <button onClick={handleNew} title="New song">＋ New</button>
        {isInList && (
          <button onClick={handleDelete} title="Delete">🗑 Delete</button>
        )}
      </section>
      )}

      <section className="key-section">
        <div className="ctrl">
          <label>Key</label>
          <select
            className={pendingActive ? 'key-pending' : undefined}
            value={pendingSel ?? currentSel}
            onChange={(e) => setPendingSel(parseInt(e.target.value, 10))}
          >
            <optgroup label="Major">
              {KEY_CHOICES.map((k, i) => !k.minor && (
                <option key={k.label} value={i}>{k.text}</option>
              ))}
            </optgroup>
            <optgroup label="Minor">
              {KEY_CHOICES.map((k, i) => k.minor && (
                <option key={k.label} value={i}>{k.text}</option>
              ))}
            </optgroup>
          </select>
        </div>
        {pendingActive && (
          <>
            <button
              className="key-commit"
              onClick={handleSetKey}
              title="Read the chart in this key. The chords stay as they are."
            >Set</button>
            {/* Rewriting the chords is out while the sheet is yt-loop's: the
                text is not ours to change. ♭/♯ and Set both stand -- neither
                touches a character of it. */}
            {!YT_SOURCE && (
              <button
                onClick={handleSetAndTranspose}
                title="Rewrite every chord into this key."
              >Set and transpose</button>
            )}
            <button className="key-cancel" onClick={() => setPendingSel(null)}>cancel</button>
          </>
        )}
        {keyHistory.length > 0 && (
          <button className="key-undo" onClick={handleUndoKey} title={undoTitle}>↩ Undo</button>
        )}
      </section>

      <section className="transport">
        {/* Two buttons that never move: the space bar's own button, and the
            way back to the top on its left. Nothing to go back from while the
            chart sits at the top, so there it is simply not available. */}
        <div className="transport-buttons">
          <button
            className="rewind-btn"
            onClick={handleRewind}
            disabled={playState === 'stopped'}
            title="Back to the top"
            aria-label="Back to the top"
          >⏮</button>
          <button
            className={'play-btn ' + (playState === 'stopped' ? '' : playState)}
            onClick={handlePlay}
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
        </div>

        <div className="ctrl">
          <label>BPM</label>
          <input
            type="number"
            min={40}
            max={300}
            value={currentSong.bpm}
            onChange={(e) => update({ bpm: parseInt(e.target.value, 10) || 85 })}
          />
          <button onClick={handleTap} title="Tap tempo">TAP</button>
        </div>

        <div className="ctrl volume-ctrl">
          <label>Vol</label>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(parseInt(e.target.value, 10))}
            aria-label="Volume"
          />
          <span className="volume-value">{volume}</span>
        </div>

        <div className="ctrl">
          <div className="part-seg" role="group" aria-label="Rhythm section">
            <button
              type="button"
              className={'part-btn' + (bassOn ? ' on' : '')}
              aria-pressed={bassOn}
              onClick={() => setBassOn(v => !v)}
              title="Walking bass"
            >
              <span className="part-lamp" aria-hidden="true" />Bass
            </button>
            <button
              type="button"
              className={'part-btn' + (drumsOn ? ' on' : '')}
              aria-pressed={drumsOn}
              onClick={() => setDrumsOn(v => !v)}
              title="Ride and hi-hat"
            >
              <span className="part-lamp" aria-hidden="true" />Cymbals
            </button>
          </div>
        </div>

        <div className="ctrl">
          <label>
            <input
              type="checkbox"
              checked={swing}
              onChange={(e) => setSwing(e.target.checked)}
            />
            Swing
          </label>
        </div>

        <div className="ctrl">
          <label>
            <input
              type="checkbox"
              checked={currentSong.countIn}
              onChange={(e) => update({ countIn: e.target.checked })}
              disabled={hasLoop}
            />
            Count-in
          </label>
        </div>
      </section>

      {/* The count, over the middle of the page rather than off in the corner
          of the controls: four beats is not long enough to go looking for it.
          The chart underneath keeps working -- this is something to watch, not
          something to dismiss -- and the bars stay visible through it, so the
          eye can be on the first one before it sounds. Silent to a screen
          reader: the clicks are the count, and this only draws it. */}
      {countInBeat !== null && (
        <div className="count-in" aria-hidden="true">
          <div className="count-in-dots">
            {Array.from({ length: BEATS_PER_MEASURE }, (_, i) => (
              <span
                key={i}
                className={'count-in-dot' + (i < countInBeat ? ' lit' : '')}
              />
            ))}
          </div>
        </div>
      )}

      {hasLoop && (
        <div className="loop-status">
          Loop: bars {Math.min(loopStart!, loopEnd!) + 1} – {Math.max(loopStart!, loopEnd!) + 1}
          <span className="loop-note">(count-in skipped)</span>
          <button onClick={clearLoop}>Clear</button>
        </div>
      )}

      <ChordGrid
        measures={parsed.measures}
        transpose={currentSong.transpose}
        prefer={prefer}
        keyRoot={displayedKey}
        currentMeasure={currentMeasure}
        loopStart={loopStart}
        loopEnd={loopEnd}
        onMeasureDown={handleMeasureDown}
        onMeasureEnter={handleMeasureEnter}
        onGridUp={handleGridUp}
        barHref={barHref}
        onBarJump={handleBarJump}
      />

      <section className="chord-input-section">
        <button
          type="button"
          className="sheet-toggle"
          aria-expanded={showSheet}
          aria-controls="chord-input"
          onClick={() => setShowSheet(v => !v)}
          title={`${showSheet ? 'Hide' : 'Show'} the sheet (e)`}
        >
          {showSheet ? 'Hide sheet' : YT_SOURCE ? 'Show sheet' : 'Edit sheet'}
          <kbd>e</kbd>
        </button>
        {showSheet && (
          <textarea
            id="chord-input"
            className={`chord-input${YT_SOURCE ? ' chord-input-ro' : ''}`}
            value={currentSong.chordsRaw}
            onChange={(e) => update({ chordsRaw: e.target.value })}
            placeholder="|F13|Bb9|F13|F13|Bb9|Bb9|F13|D7#9|..."
            spellCheck={false}
            rows={12}
            readOnly={!!YT_SOURCE}
            title={YT_SOURCE ? 'This sheet is yt-loop’s — edit it there' : undefined}
          />
        )}
        {/* Errors stay out of the fold. A sheet that failed to parse is the one
            time the text matters most, and hiding the reason with the editor
            would leave a bar simply missing from the grid with nothing said. */}
        {parsed.errors.length > 0 && (
          <div className="errors">
            {parsed.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
          </div>
        )}
      </section>

      <section className="note-grid-controls">
        <button onClick={() => setShowNotes((v) => !v)}>
          {showNotes ? 'Hide analysis' : 'Show analysis'}
        </button>
        {showNotes && (
          <div className="ctrl">
            <label>Label</label>
            <div className="ng-seg" role="group" aria-label="Note labels">
              {NOTE_MODES.map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  className={'ng-seg-btn' + (noteMode === value ? ' active' : '')}
                  aria-pressed={noteMode === value}
                  onClick={() => setNoteMode(value)}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {showNotes && (
        <NoteGrid
          measures={parsed.measures}
          transpose={currentSong.transpose}
          prefer={prefer}
          keyRoot={displayedKey}
          mode={noteMode}
          currentMeasure={currentMeasure}
          playing={isPlaying}
          position={playPosition}
          selected={noteSel}
          onSelect={setNoteSel}
        />
      )}

      <footer className="footer">
        <div>Input: pipe-delimited measures <code>|C|G Am|F|</code> — multiple chords per bar separated by spaces</div>
        <div>Repeats: <code>%</code> (same as previous bar) / <code>%%</code> (same as bar two back) / <code>.</code> (repeat previous chord within the same bar, e.g. <code>|Bb13 . . E9|</code>)</div>
        <div>Drag across bars to set a loop range. During playback, drag also stops. Count-in skipped while loop is active.</div>
        <div>Click a bar to put the playhead on it. Shortcuts: <code>←</code>/<code>→</code> playhead one bar / <code>Space</code> play or pause / <code>e</code> sheet</div>
        <div>Written <strong>{noteLabel(tonicRoot, keyPreferFor(tonicRoot))}</strong> / Sounding <strong>{noteLabel(displayedKey, prefer)}</strong> ({currentSong.transpose >= 0 ? '+' : ''}{currentSong.transpose})</div>
      </footer>
    </div>
  );
}

export default App;
