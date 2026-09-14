export interface Song {
  id: string;
  name: string;
  chordsRaw: string;
  bpm: number;
  transpose: number;    // semitones applied on top of chordsRaw
  // Tonic the sheet is analysed against, before transposition.
  // null = infer it from the first chord. Older saved songs lack the
  // field entirely, which reads as null.
  keyRoot: number | null;
  // Whether that tonic is being read as a minor key. A major key and its
  // relative minor are one set of notes and one tonic -- C and Am both count
  // from C -- so which of the two a sheet is written in cannot be worked out
  // from keyRoot, and is kept beside it. Older saved songs lack the field,
  // which reads as major.
  keyMinor: boolean;
  countIn: boolean;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'chord-vamp:songs:v1';
const CURRENT_KEY = 'chord-vamp:current:v1';
const PREFS_KEY = 'chord-vamp:prefs:v1';

// Lives here rather than beside the component so the stored shape and the
// component's prop are one definition; NoteGrid re-exports it.
export type NoteLabelMode = 'note' | 'interval' | 'solfa';

export interface Prefs {
  volume: number;   // 0-100
  swing: boolean;
  theme: 'light' | 'dark' | null;  // null = follow system
  showAnalysis: boolean;
  noteMode: NoteLabelMode;
  // Which parts of the rhythm section sound. Kept here rather than on the
  // song: playing without the kit is how someone likes to practise, not
  // something a particular chart asks for. `drums` is the cymbals and
  // nothing else so far -- the ride, and the hi-hat foot under it.
  bass: boolean;
  drums: boolean;
}

const DEFAULT_PREFS: Prefs = {
  volume: 80,
  swing: false,
  theme: 'light',
  showAnalysis: false,
  noteMode: 'interval',
  bass: true,
  drums: true,
};

function genId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function loadSongs(): Song[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Song[];
  } catch {
    return [];
  }
}

export function saveSongs(songs: Song[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
  } catch {
    /* ignore quota */
  }
}

export function newSong(partial: Partial<Song> = {}): Song {
  const now = performance.timeOrigin + performance.now();
  return {
    id: genId(),
    name: partial.name ?? '',
    chordsRaw: partial.chordsRaw ?? '',
    bpm: partial.bpm ?? 85,
    transpose: partial.transpose ?? 0,
    keyRoot: partial.keyRoot ?? null,
    keyMinor: partial.keyMinor ?? false,
    countIn: partial.countIn ?? true,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

export function upsertSong(songs: Song[], song: Song): Song[] {
  const idx = songs.findIndex(s => s.id === song.id);
  const updated = { ...song, updatedAt: performance.timeOrigin + performance.now() };
  if (idx >= 0) {
    const next = songs.slice();
    next[idx] = updated;
    return next;
  }
  return [...songs, updated];
}

export function deleteSong(songs: Song[], id: string): Song[] {
  return songs.filter(s => s.id !== id);
}

export function loadCurrent(): Song | null {
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Song;
  } catch {
    return null;
  }
}

export function saveCurrent(song: Song): void {
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(song));
  } catch {
    /* ignore */
  }
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Sheets read from yt-loop
// ---------------------------------------------------------------------------
// The sheet itself is never stored here: it belongs to yt-loop, arrives in a
// link, and is read and not written -- see ytloop.ts. What is stored is this
// app's own side of it, per video: the tempo the passage is being practised at,
// how far it has been moved, and which bars are being worked on. A tune picked
// up next week starts where it was left rather than at the defaults, and the
// transcription it is read from stays the one copy there is.
export interface YtPrefs {
  bpm: number;
  transpose: number;
  loopStart: number | null;
  loopEnd: number | null;
}

const YT_PREFS_KEY = 'chord-vamp:ytloop:v1';

type YtPrefsStore = Record<string, YtPrefs>;

function loadYtStore(): YtPrefsStore {
  try {
    const raw = localStorage.getItem(YT_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as YtPrefsStore;
  } catch {
    return {};
  }
}

// Null rather than defaults for a video never opened here: the caller has its
// own idea of what a fresh sheet starts at, and a stored 0 must not be confused
// with nothing stored.
export function loadYtPrefs(videoId: string): YtPrefs | null {
  if (!videoId) return null;
  const found = loadYtStore()[videoId];
  if (!found || typeof found !== 'object') return null;
  const bpm = Number(found.bpm);
  const transpose = Number(found.transpose);
  return {
    bpm: bpm >= 20 && bpm <= 400 ? Math.round(bpm) : 85,
    transpose: Number.isInteger(transpose) ? transpose : 0,
    loopStart: typeof found.loopStart === 'number' ? found.loopStart : null,
    loopEnd: typeof found.loopEnd === 'number' ? found.loopEnd : null,
  };
}

export function saveYtPrefs(videoId: string, prefs: YtPrefs): void {
  if (!videoId) return;
  try {
    const store = loadYtStore();
    store[videoId] = prefs;
    localStorage.setItem(YT_PREFS_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}
