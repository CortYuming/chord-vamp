import { useCallback, useEffect, useState } from 'react';
import {
  deleteSong as deleteFn,
  loadSongs,
  saveSongs,
  upsertSong,
  type Song,
} from '../storage';

export function useSongs() {
  const [songs, setSongs] = useState<Song[]>(() => loadSongs());

  useEffect(() => {
    saveSongs(songs);
  }, [songs]);

  const upsert = useCallback((song: Song) => {
    setSongs(prev => upsertSong(prev, song));
  }, []);

  const remove = useCallback((id: string) => {
    setSongs(prev => deleteFn(prev, id));
  }, []);

  return { songs, upsert, remove };
}
