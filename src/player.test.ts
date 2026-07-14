import { describe, it, expect } from 'vitest';
import { parseSong } from './chord';
import { expandSong } from './player';

describe('expandSong', () => {
  it('expands plain measures to 4 beats each', () => {
    const song = parseSong('|C|G|');
    const ex = expandSong(song, 0, -1);
    expect(ex).toHaveLength(2);
    expect(ex[0].beats).toHaveLength(4);
    expect(ex[0].beats.every(b => b?.raw === 'C')).toBe(true);
    expect(ex[1].beats.every(b => b?.raw === 'G')).toBe(true);
  });

  it('splits two chords into 2+2 beats', () => {
    const song = parseSong('|C G|');
    const ex = expandSong(song, 0, -1);
    expect(ex[0].beats.map(b => b?.raw)).toEqual(['C', 'C', 'G', 'G']);
  });

  it('splits four chords into 1+1+1+1', () => {
    const song = parseSong('|C D E F|');
    const ex = expandSong(song, 0, -1);
    expect(ex[0].beats.map(b => b?.raw)).toEqual(['C', 'D', 'E', 'F']);
  });

  it('resolves % to previous measure', () => {
    const song = parseSong('|C|%|G|%|');
    const ex = expandSong(song, 0, -1);
    expect(ex[1].beats.every(b => b?.raw === 'C')).toBe(true);
    expect(ex[3].beats.every(b => b?.raw === 'G')).toBe(true);
  });

  it('resolves %% to two measures back', () => {
    const song = parseSong('|A|B|%%|%%|');
    const ex = expandSong(song, 0, -1);
    expect(ex[2].beats[0]?.raw).toBe('A');
    expect(ex[3].beats[0]?.raw).toBe('B');
  });

  it('resolves nested % chains', () => {
    const song = parseSong('|C|%|%|%|');
    const ex = expandSong(song, 0, -1);
    for (const m of ex.slice(1)) {
      expect(m.beats.every(b => b?.raw === 'C')).toBe(true);
    }
  });

  it('respects loop range', () => {
    const song = parseSong('|A|B|C|D|');
    const ex = expandSong(song, 1, 2);
    expect(ex).toHaveLength(2);
    expect(ex[0].sourceIndex).toBe(1);
    expect(ex[1].sourceIndex).toBe(2);
    expect(ex[0].beats[0]?.raw).toBe('B');
  });

  it('empty measure yields null beats', () => {
    const song = parseSong('|C||G|');
    const ex = expandSong(song, 0, -1);
    expect(ex[1].beats.every(b => b === null)).toBe(true);
  });
});
