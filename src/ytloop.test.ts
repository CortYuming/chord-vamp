import { describe, it, expect, vi } from 'vitest';
import { readYtSource, barUrl, jumpToBar, type YtSource } from './ytloop';

const HERE = 'https://cortyuming.github.io/chord-vamp/';

// The link yt-loop writes, in the shape its README documents.
const LINK = '?v=abc123&k=%7CBb7+Eb9%7CD7%2B9%7C&t=0.00-2.10%2C2.10-4.20&key=Bb&title=Four+on+Six';

const SOURCE: YtSource = {
  videoId: 'abc123',
  chords: '|Bb7|D7#9|',
  bars: [{ start: 43.5, end: 45.9 }, { start: 45.9, end: null }],
  keyRoot: 10,
  keyMinor: false,
  title: 'Four on Six',
};

describe('readYtSource', () => {
  it('reads a link written by yt-loop', () => {
    expect(readYtSource(LINK)).toEqual({
      videoId: 'abc123',
      chords: '|Bb7 Eb9|D7+9|',
      bars: [{ start: 0, end: 2.1 }, { start: 2.1, end: 4.2 }],
      keyRoot: 10,
      keyMinor: false,
      title: 'Four on Six',
    });
  });

  // An ordinary visit to the app, which is every link that is not one of these.
  it('is nothing without a video and a sheet', () => {
    expect(readYtSource('')).toBeNull();
    expect(readYtSource('?v=abc123')).toBeNull();
    expect(readYtSource('?k=%7CC%7C')).toBeNull();
    expect(readYtSource('?song=1f2e3d')).toBeNull();
  });

  // A sheet being written from the top has bars nobody has caught yet. They
  // keep their place in the row so the numbering holds either side of them.
  it('keeps an untimed bar in its place', () => {
    const src = readYtSource('?v=a&k=%7CC%7CF%7CG%7C&t=0.00-2.00%2C%2C4.00');
    expect(src?.bars).toEqual([
      { start: 0, end: 2 },
      { start: null, end: null },
      { start: 4, end: null },
    ]);
  });

  it('reads a bar with no end as a start alone', () => {
    expect(readYtSource('?v=a&k=%7CC%7C&t=9.50')?.bars).toEqual([{ start: 9.5, end: null }]);
  });

  // A range the wrong way round describes nothing; the start is still good.
  it('drops an end that is not after its start', () => {
    expect(readYtSource('?v=a&k=%7CC%7C&t=9.50-9.50')?.bars).toEqual([{ start: 9.5, end: null }]);
  });

  it('has no bars when nothing was timed', () => {
    expect(readYtSource('?v=a&k=%7CC%7CF%7C')?.bars).toEqual([{ start: null, end: null }]);
  });

  // The key arrives spelled, not numbered: a tonic alone cannot say whether a
  // sheet is in C or in Am, which are one set of notes.
  it('reads the key by its name', () => {
    expect(readYtSource('?v=a&k=%7CC%7C&key=Bb')?.keyRoot).toBe(10);
    expect(readYtSource('?v=a&k=%7CC%7C&key=Bb')?.keyMinor).toBe(false);
  });

  // Am counts from C, the way yt-loop counts it, so the degrees under a chord
  // read the same in both apps.
  it('counts a minor key from its relative major', () => {
    const src = readYtSource('?v=a&k=%7CAm7%7C&key=Am');
    expect(src?.keyRoot).toBe(0);
    expect(src?.keyMinor).toBe(true);
    expect(readYtSource('?v=a&k=%7CC%7C&key=F%23m')?.keyRoot).toBe(9);
  });

  // Hand-edited, or written by a build that spelled the key some other way.
  it('is left with no key by a spelling it does not hold', () => {
    expect(readYtSource('?v=a&k=%7CC%7C&key=12')?.keyRoot).toBeNull();
    expect(readYtSource('?v=a&k=%7CC%7C&key=H')?.keyRoot).toBeNull();
    expect(readYtSource('?v=a&k=%7CC%7C')?.keyRoot).toBeNull();
  });
});

describe('barUrl', () => {
  it('sends the video to the seconds the bar covers', () => {
    expect(barUrl(SOURCE, 0, HERE))
      .toBe('https://cortyuming.github.io/yt-loop/?v=abc123&s=43.50&e=45.90');
  });

  // The last bar of a sheet, with nothing after it to take an end from.
  it('sends a start alone where the bar has no end', () => {
    expect(barUrl(SOURCE, 1, HERE))
      .toBe('https://cortyuming.github.io/yt-loop/?v=abc123&s=45.90');
  });

  it('leads nowhere from a bar with no time on it', () => {
    const untimed: YtSource = { ...SOURCE, bars: [{ start: null, end: null }] };
    expect(barUrl(untimed, 0, HERE)).toBeNull();
    expect(barUrl(SOURCE, 9, HERE)).toBeNull();
  });

  // Dev serves the two apps from a port rather than from the host they share in
  // production, and the link is written relative to wherever this page is.
  it('is written next to wherever this app is', () => {
    expect(barUrl(SOURCE, 0, 'http://localhost:8800/chord-vamp/'))
      .toBe('http://localhost:8800/yt-loop/?v=abc123&s=43.50&e=45.90');
  });
});

describe('jumpToBar', () => {
  const fakeWindow = (opener: unknown) => ({
    opener,
    open: vi.fn(),
    location: { href: HERE, origin: 'https://cortyuming.github.io' },
  });

  it('moves the tab it was opened from, rather than loading the video again', () => {
    const opener = { closed: false, postMessage: vi.fn(), focus: vi.fn() };
    const win = fakeWindow(opener);
    expect(jumpToBar(SOURCE, 0, win as unknown as Window)).toBe(true);
    expect(opener.postMessage).toHaveBeenCalledWith(
      { type: 'yt-loop:seek', start: 43.5, end: 45.9 },
      'https://cortyuming.github.io',
    );
    expect(win.open).not.toHaveBeenCalled();
  });

  // Opened from a bookmark, so there is no player waiting anywhere. The link
  // stands in, in a named tab: a run of bar numbers lands in one tab and not a
  // pile of them.
  it('opens yt-loop itself when there is no tab to move', () => {
    const win = fakeWindow(null);
    expect(jumpToBar(SOURCE, 0, win as unknown as Window)).toBe(true);
    expect(win.open).toHaveBeenCalledWith(
      'https://cortyuming.github.io/yt-loop/?v=abc123&s=43.50&e=45.90',
      'yt-loop',
    );
  });

  it('opens yt-loop itself when that tab has been closed', () => {
    const win = fakeWindow({ closed: true, postMessage: vi.fn(), focus: vi.fn() });
    jumpToBar(SOURCE, 0, win as unknown as Window);
    expect(win.open).toHaveBeenCalled();
  });

  // Reading `opener` at all throws when it belongs to another origin.
  it('falls back to the link when the opener cannot be spoken to', () => {
    const opener = {
      closed: false,
      postMessage: () => { throw new Error('cross-origin'); },
      focus: vi.fn(),
    };
    const win = fakeWindow(opener);
    expect(jumpToBar(SOURCE, 0, win as unknown as Window)).toBe(true);
    expect(win.open).toHaveBeenCalled();
  });

  it('does nothing for a bar with no time on it', () => {
    const win = fakeWindow(null);
    expect(jumpToBar(SOURCE, 9, win as unknown as Window)).toBe(false);
    expect(win.open).not.toHaveBeenCalled();
  });
});
