export interface Song {
  id: string;
  name: string;
  chordsRaw: string;
  bpm: number;
  transpose: number;    // semitones applied on top of chordsRaw
  countIn: boolean;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'chord-vamp:songs:v1';
const CURRENT_KEY = 'chord-vamp:current:v1';
const PREFS_KEY = 'chord-vamp:prefs:v1';

export interface Prefs {
  volume: number;   // 0-100
  swing: boolean;
  theme: 'light' | 'dark' | null;  // null = follow system
}

const DEFAULT_PREFS: Prefs = {
  volume: 80,
  swing: false,
  theme: null,
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
