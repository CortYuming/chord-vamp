import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { KEY_NAMES, keyPreferFor, noteLabel, parseSong } from './chord';
import { ChordGrid } from './components/ChordGrid';
import { useSongs } from './hooks/useSongs';
import { Player } from './player';
import * as Tone from 'tone';
import { loadCurrent, loadPrefs, loadSongs, newSong, saveCurrent, savePrefs, type Song } from './storage';

const DEFAULT_CHORDS = '|F13|Bb9|F13|F13|Bb9|Bb9|F13|D7#9|G7|C7#9|F13 D7#9|G7#9|';

function App() {
  const { songs, upsert, remove } = useSongs();
  const [currentSong, setCurrentSong] = useState<Song>(() => {
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
    saveCurrent(currentSong);
  }, [currentSong]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMeasure, setCurrentMeasure] = useState(-1);
  const [countingDown, setCountingDown] = useState(0);
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | null>(() => loadPrefs().theme);
  const [volume, setVolume] = useState<number>(() => loadPrefs().volume);
  const [swing, setSwing] = useState<boolean>(() => loadPrefs().swing);

  useEffect(() => {
    savePrefs({ volume, swing, theme });
    const db = volume <= 0 ? -Infinity : 20 * Math.log10(volume / 100);
    Tone.getDestination().volume.rampTo(db, 0.05);
  }, [volume, swing, theme]);

  useEffect(() => {
    if (isPlaying) playerRef.current?.setSwing(swing);
  }, [swing, isPlaying]);

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

  const firstChordRoot = useMemo(() => {
    for (const m of parsed.measures) {
      if (m.kind === 'chords') {
        for (const c of m.chords) if (c.root !== null) return c.root;
      }
    }
    return 0;
  }, [parsed]);

  const displayedKey = (((firstChordRoot + currentSong.transpose) % 12) + 12) % 12;
  const prefer = keyPreferFor(displayedKey);

  const handleKeyChange = (targetKey: number) => {
    const diff = ((targetKey - firstChordRoot) % 12 + 12) % 12;
    const shortest = diff > 6 ? diff - 12 : diff;
    update({ transpose: shortest });
  };

  const handleTranspose = (delta: number) => {
    const next = ((currentSong.transpose + delta) % 12 + 12) % 12;
    const wrapped = next > 6 ? next - 12 : next;
    update({ transpose: wrapped });
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
  };

  const handleLoad = (id: string) => {
    const s = songs.find(x => x.id === id);
    if (!s) return;
    playerRef.current?.stop();
    setCurrentSong(s);
    setLoopStart(null);
    setLoopEnd(null);
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

  return (
    <div className="app">
      <header className="header">
        <h1 className="brand">🎷 Chord Vamp</h1>
        <div className="header-actions">
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">◐</button>
        </div>
      </header>

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

      <section className="key-section">
        <div className="ctrl">
          <label>Key</label>
          <select
            value={displayedKey}
            onChange={(e) => handleKeyChange(parseInt(e.target.value, 10))}
          >
            {KEY_NAMES.map((n, i) => (
              <option key={i} value={i}>{n}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="chord-input-section">
        <textarea
          className="chord-input"
          value={currentSong.chordsRaw}
          onChange={(e) => update({ chordsRaw: e.target.value })}
          placeholder="|F13|Bb9|F13|F13|Bb9|Bb9|F13|D7#9|..."
          spellCheck={false}
          rows={3}
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
      />

      <footer className="footer">
        <div>Input: pipe-delimited measures <code>|C|G Am|F|</code> — multiple chords per bar separated by spaces</div>
        <div>Repeats: <code>%</code> (same as previous bar) / <code>%%</code> (same as bar two back) / <code>.</code> (repeat previous chord within the same bar, e.g. <code>|Bb13 . . E9|</code>)</div>
        <div>Drag across bars to set a loop range. During playback, drag also stops. Count-in skipped while loop is active.</div>
        <div>Shortcuts: <code>←</code>/<code>→</code> transpose ± semitone / <code>Space</code> play</div>
        <div>Current key: <strong>{noteLabel(displayedKey, prefer)}</strong> (transpose {currentSong.transpose >= 0 ? '+' : ''}{currentSong.transpose})</div>
      </footer>
    </div>
  );
}

export default App;
