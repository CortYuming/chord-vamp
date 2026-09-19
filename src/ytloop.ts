// A sheet arriving from yt-loop.
//
// yt-loop transcribes a video bar by bar, in a notation of its own that carries
// fingerings, single notes, rests and ties. None of that is playable here, so
// what it sends is the part that is: the bars as chord names, the seconds each
// bar covers in the video, the key, and what the video is called. It is all in
// the link, written at the moment its button is pressed -- nothing is stored on
// either side, which is why there is nothing to keep in step. A sheet edited
// over there is sent again by pressing the button again.
//
// The sheet is read, never written: this app has no way to say anything back
// about a transcription, and the one copy of it stays where it is being made.
// See yt-loop's README, "Opening a sheet in chord-vamp", for the link's shape.

import { keyChoiceByLabel } from './chord';


/** The seconds one bar covers in the video. */
export interface YtBar {
  start: number | null;
  /** Null for a bar with nothing after it to take an end from -- the last one. */
  end: number | null;
}

export interface YtSource {
  videoId: string;
  /** The bars as this app writes them: `|F13|Bb9|`. */
  chords: string;
  /** One entry per bar of `chords`, in step with it. Empty when none was sent. */
  bars: YtBar[];
  /**
   * Where do sits for the written key, or null where the sheet named none. A
   * minor key counts from its relative major, the way yt-loop counts it, so one
   * sheet reads the same in both apps.
   */
  keyRoot: number | null;
  /** Whether that tonic is being read as a minor key. */
  keyMinor: boolean;
  title: string;
}

/**
 * One bar's times, as `43.50-45.90` or `43.50` for a bar with no end. An
 * untimed bar is written as nothing at all, so the list stays in step with the
 * bars whatever has been timed so far.
 */
function parseBarTimes(field: string): YtBar[] {
  return field.split(',').map((cell) => {
    const text = cell.trim();
    if (!text) return { start: null, end: null };
    const dash = text.indexOf('-');
    const start = Number(dash === -1 ? text : text.slice(0, dash));
    if (!isFinite(start)) return { start: null, end: null };
    if (dash === -1) return { start, end: null };
    const end = Number(text.slice(dash + 1));
    return { start, end: isFinite(end) && end > start ? end : null };
  });
}

/**
 * The sheet in a link, or null when the link carries none. Everything is read
 * defensively: a link can be edited by hand, bookmarked from an older build, or
 * simply truncated by whatever it was pasted through.
 */
export function readYtSource(search: string): YtSource | null {
  const params = new URLSearchParams(search);
  const videoId = (params.get('v') ?? '').trim();
  const chords = (params.get('k') ?? '').trim();
  if (!videoId || !chords) return null;

  // The key travels as yt-loop spells it -- `Bb`, `F#m` -- which is what its own
  // `key:` line says and what this app's Key list is written in. A spelling
  // neither app holds is no key rather than a guess at one.
  const key = keyChoiceByLabel(params.get('key') ?? '');

  return {
    videoId,
    chords,
    bars: parseBarTimes(params.get('t') ?? ''),
    keyRoot: key ? key.tonic : null,
    keyMinor: key ? key.minor : false,
    title: (params.get('title') ?? '').trim(),
  };
}

/**
 * The link back to yt-loop for one bar: the video, and the seconds that bar
 * covers. Null where the bar has no time on it -- a sheet being written from
 * the top has bars nobody has caught yet, and there is nowhere to send anyone.
 *
 * `view=sheet` asks yt-loop to land on its sheet rather than at the top of its
 * page -- the same place its own F key goes. Someone who followed a bar number
 * out of a chart is coming back to that chart, and the video, the URL box and
 * the loop fields sit between the landing and the bar they came for. yt-loop
 * ignores the param if it does not know it, so an older copy still loads.
 *
 * Written relative to this page, so the same call is right on GitHub Pages
 * (`/chord-vamp/` next to `/yt-loop/`) and on a dev server serving both.
 */
export function barUrl(src: YtSource, bar: number, here: string): string | null {
  const span = src.bars[bar];
  if (!span || span.start === null) return null;
  const params = new URLSearchParams();
  params.set('v', src.videoId);
  params.set('s', span.start.toFixed(2));
  if (span.end !== null) params.set('e', span.end.toFixed(2));
  params.set('view', 'sheet');
  return new URL(`../yt-loop/?${params.toString()}`, here).href;
}

/**
 * Send yt-loop to a bar.
 *
 * Opens in a new tab, which is the one way a jump is certain to be seen: a
 * browser brings a freshly opened tab to the front, and will not do the same
 * for a tab that is merely navigated or asked to focus itself.
 *
 * Both quieter ways were tried first and both moved the video where nobody was
 * looking -- a message to the tab this page was opened from, then a link
 * targeted at that tab by name. Each left the bar number reading as a button
 * that does nothing. A jump you cannot see is not a jump.
 */
export function jumpToBar(src: YtSource, bar: number, win: Window = window): boolean {
  const url = barUrl(src, bar, win.location.href);
  if (!url) return false;
  win.open(url, '_blank');
  return true;
}
