import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  KEY_CHOICES, keyChoiceFor, keyPreferFor, noteLabel, parseSong, resolveKeyRoot, transposeSong,
} from './chord';
import { ChordGrid } from './components/ChordGrid';
import { NoteGrid, type NoteLabelMode } from './components/NoteGrid';
import { useSongs } from './hooks/useSongs';
import { Player } from './player';
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

// A second of video, written the way yt-loop writes one.
function clockTime(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(2).padStart(5, '0')}`;
}

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMeasure, setCurrentMeasure] = useState(-1);
  const [countingDown, setCountingDown] = useState(0);
  const [loopStart, setLoopStart] = useState<number | null>(YT_PREFS?.loopStart ?? null);
  const [loopEnd, setLoopEnd] = useState<number | null>(YT_PREFS?.loopEnd ?? null);
  const [isDragging, setIsDragging] = useState(false);
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
  // The bar last sent to yt-loop, for the line that says so.
  const [sentBar, setSentBar] = useState<number | null>(null);
  const [keyHistory, setKeyHistory] = useState<KeySnapshot[]>([]);

  useEffect(() => {
    savePrefs({ volume, swing, theme, showAnalysis: showNotes, noteMode, bass: bassOn, drums: drumsOn });
    const db = volume <= 0 ? -Infinity : 20 * Math.log10(volume / 100);
    Tone.getDestination().volume.rampTo(db, 0.05);
  }, [volume, swing, theme, showNotes, noteMode, bassOn, drumsOn]);

  useEffect(() => {
    if (isPlaying) playerRef.current?.setSwing(swing);
  }, [swing, isPlaying]);

  useEffect(() => {
    if (isPlaying) playerRef.current?.setParts(bassOn, drumsOn);
  }, [bassOn, drumsOn, isPlaying]);


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

  // Semitones are kept in -6..6 so the readout says -1 rather than +11.
  const wrapSemitones = (n: number) => {
    const m = ((n % 12) + 12) % 12;
    return m > 6 ? m - 12 : m;
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

  const handleTranspose = (delta: number) => {
    pushKeyHistory();
    update({ transpose: wrapSemitones(currentSong.transpose + delta) });
  };

  const handlePlay = async () => {
    if (isPlaying) {
      playerRef.current?.stop();
      return;
    }
    if (parsed.measures.length === 0) return;
    const player = playerRef.current!;
    const hasLoop = loopStart !== null && loopEnd !== null;
    const useCountIn = currentSong.countIn && !hasLoop;
    setIsPlaying(true);
    setCountingDown(useCountIn ? 4 : 0);
    await player.start({
      song: parsed,
      bpm: currentSong.bpm,
      countIn: useCountIn,
      loopStart: loopStart ?? 0,
      loopEnd: loopEnd ?? -1,
      transpose: currentSong.transpose,
      swing,
      bass: bassOn,
      drums: drumsOn,
      onBeat: (mIdx, _bIdx, isCountIn) => {
        if (isCountIn) {
          setCurrentMeasure(-1);
          setCountingDown(prev => prev - 1);
        } else {
          setCurrentMeasure(mIdx);
          setCountingDown(0);
        }
      },
      onStop: () => {
        setIsPlaying(false);
        setCurrentMeasure(-1);
        setCountingDown(0);
      },
    });
  };

  useEffect(() => {
    if (isPlaying) playerRef.current?.setBpm(currentSong.bpm);
  }, [currentSong.bpm, isPlaying]);

  useEffect(() => {
    if (isPlaying) playerRef.current?.setTranspose(currentSong.transpose);
  }, [currentSong.transpose, isPlaying]);

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

  const handleMeasureDown = (i: number) => {
    if (isPlaying) playerRef.current?.stop();
    setIsDragging(true);
    setLoopStart(i);
    setLoopEnd(i);
  };

  const handleMeasureEnter = (i: number) => {
    if (isDragging) setLoopEnd(i);
  };

  const handleGridUp = () => {
    if (isDragging) {
      setIsDragging(false);
      if (loopStart !== null && loopEnd !== null && loopStart === loopEnd) {
        setLoopStart(null);
        setLoopEnd(null);
      }
    }
  };

  const clearLoop = () => {
    setLoopStart(null);
    setLoopEnd(null);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); handleTranspose(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); handleTranspose(1); }
      else if (e.key === ' ') { e.preventDefault(); handlePlay(); }
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
  const handleBarJump = yt ? (i: number) => {
    if (!jumpToBar(yt, i)) return;
    // Say what just happened. The player is in the other tab, and a browser
    // will not always bring that tab forward on our say-so -- so from here a
    // bar number could look like a button that does nothing, while yt-loop had
    // in fact moved. The seconds are there to be checked against it.
    setSentBar(i);
  } : undefined;

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
          {sentBar !== null && (
            <span className="yt-source-sent" role="status">
              → yt-loop: bar {sentBar + 1} ({clockTime(YT_SOURCE.bars[sentBar]?.start ?? 0)})
            </span>
          )}
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

      <section className="chord-input-section">
        <textarea
          className={`chord-input${YT_SOURCE ? ' chord-input-ro' : ''}`}
          value={currentSong.chordsRaw}
          onChange={(e) => update({ chordsRaw: e.target.value })}
          placeholder="|F13|Bb9|F13|F13|Bb9|Bb9|F13|D7#9|..."
          spellCheck={false}
          rows={3}
          readOnly={!!YT_SOURCE}
          title={YT_SOURCE ? 'This sheet is yt-loop’s — edit it there' : undefined}
        />
        {parsed.errors.length > 0 && (
          <div className="errors">
            {parsed.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
          </div>
        )}
      </section>

      <section className="transport">
        <button
          className={'play-btn ' + (isPlaying ? 'playing' : '')}
          onClick={handlePlay}
        >
          {isPlaying ? '■ Stop' : '▶ Play'}
        </button>

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

        {countingDown > 0 && (
          <div className="counting-indicator">Count: {countingDown}</div>
        )}
      </section>

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
          selected={noteSel}
          onSelect={setNoteSel}
        />
      )}

      <footer className="footer">
        <div>Input: pipe-delimited measures <code>|C|G Am|F|</code> — multiple chords per bar separated by spaces</div>
        <div>Repeats: <code>%</code> (same as previous bar) / <code>%%</code> (same as bar two back) / <code>.</code> (repeat previous chord within the same bar, e.g. <code>|Bb13 . . E9|</code>)</div>
        <div>Drag across bars to set a loop range. During playback, drag also stops. Count-in skipped while loop is active.</div>
        <div>Shortcuts: <code>←</code>/<code>→</code> transpose ± semitone / <code>Space</code> play</div>
        <div>Written <strong>{noteLabel(tonicRoot, keyPreferFor(tonicRoot))}</strong> / Sounding <strong>{noteLabel(displayedKey, prefer)}</strong> ({currentSong.transpose >= 0 ? '+' : ''}{currentSong.transpose})</div>
      </footer>
    </div>
  );
}

export default App;
