# Chord Vamp

A minimal iReal Pro–style chord progression player for the browser. Type chords, hit play, and a bass line comps for you at the chosen BPM.

## demo site

https://cortyuming.github.io/chord-vamp/

## Features

- Text-input chord progression, pipe-delimited per measure: `|F13|Bb9|F13|F13|Bb9|Bb9|F13|D7#9|G7|C7#9|F13 D7#9|G7#9|`
- Multiple chords per measure with space (`|F13 D7#9|`)
- In-bar chord repeat with `.` — `|Bb13 . . E9|` expands to `|Bb13 Bb13 Bb13 E9|`
- Single- and two-bar repeat marks `%` / `%%`
- Time signatures written at the head of a bar: `|T34 Cm7|`, in force until another one is written
- 4-measures-per-row display with iReal Pro–style borders
- Bass root note played on quarter notes via Web Audio
- Count-in of one bar before playback — as many clicks as the bar it counts into has beats; skipped on loop restart
- Drag across measures to set a loop range
- Transpose by semitone (`♭` / `♯` buttons or `←` / `→`), or pick a target Key directly
- `♯` / `♭` accidental preference toggle
- Save named songs to localStorage with BPM and transpose baked in
- Tap tempo
- Space bar toggles play
- Opens a sheet transcribed in [yt-loop](https://cortyuming.github.io/yt-loop/): its bars arrive in the link, and every bar number leads back to the second of the video it came from

## Chord Input Grammar

```
song      := "|" measure ("|" measure)* "|"
measure   := [meter " "] (chords | "%" | "%%" | "")
meter     := "T" count note        (e.g. T34, T22, T68, T128, T216)
count     := 1..99
note      := 2 | 4 | 8 | 16
chords    := chord (" " (chord | "."))*
chord     := root [quality] ["/" bass]
root      := [A-G] ["#" | "b"]
quality   := any chord suffix, passed through as-is (e.g. m7, 7#9, maj7b5, sus4)
bass      := root
```

- Empty measures render as a dot and rest during playback.
- A bar is read in eighth-note slots, two to the beat — eight of them in 4/4,
  six in 3/4, three in 3/8. Chords are spread evenly over them: 2 chords → 4+4,
  3 chords → 3+3+2, 8 chords → one each. More chords than slots is an error
  rather than a bar with chords quietly dropped from it.
- `.` repeats the previous chord within the same measure only; it does not carry across bar lines.
- `N.C.` is recognized as no-chord (silent).

### Time signatures

`T34` is 3/4, `T22` is cut time, `T128` is 12/8, `T216` is 2/16: the count, then
the note it is counted in, run together. The note comes off the end, so `T332`
is 33/2 rather than a thirty-second. Written at the head of a bar and standing
from there until another one is written, the way a stave carries the sign — and
drawn only on the bar that declared it.

The same notation [yt-loop](https://cortyuming.github.io/yt-loop/) writes, so a
sheet transcribed there arrives here already signed.

The bass walks and the count-in strikes in quarter notes whatever the meter, the
last beat of a bar being short where the meter does not fill it (3/8 is a beat
and a half). A meter that does not land on the eighth-note slots is refused
rather than rounded onto them, which leaves out only an odd count of sixteenths:
3/16 and 5/16 cannot be written, 6/16 and 12/16 can.

## Sheets from yt-loop

[yt-loop](https://cortyuming.github.io/yt-loop/) transcribes a video bar by bar.
Its **chord-vamp ↗** button opens the sheet here: the bars, the seconds each one
covers, the key and the video's title all travel in the link, written at the
moment the button is pressed.

```
?v=<videoId>&k=<bars>&t=<times>&key=<key>&title=<video title>
```

The key arrives spelled as the sheet spells it — `Bb`, `F#m`. The Key list here
holds the same twenty-four keys yt-loop offers, in its order and its spellings,
and a minor key counts from its relative major the way yt-loop counts it, so the
degrees under a chord read the same in both apps.

The sheet is **read, not written**. It belongs to yt-loop, where it is being
made, and this app has nothing to say back about a transcription: the chord box
is greyed, and Set and transpose — the one control that rewrites the chords — is
gone. Everything that plays the sheet rather than changing it stands: tempo, tap,
♭ / ♯, Set, the loop range. A sheet edited over there gets here by pressing the
button again; nothing is stored on either side to be kept in step.

Each bar number is a link back to the video at the second that bar starts. It is
drawn as a link from the start rather than appearing under a pointer, since a
chart is read on a phone as often as at a desk. It opens in a new tab, which is the one
way a jump is certain to be seen.

Both quieter ways were tried first. Moving the player in the tab this page was
opened from worked — the video went to the bar with nothing to reload — and so
did navigating that tab by name. Neither was ever brought to the front: a
browser will not raise another tab because a page asked it to, so the jump
happened out of sight and the bar number read as a button doing nothing. A jump
you cannot see is not a jump.

BPM, transposition and the loop range are remembered per video under
`chord-vamp:ytloop:v1`, so the same button next week opens the tune where it was
left. Saved songs are untouched: a sheet from yt-loop is not one of them, is not
in the list, and does not take the place of whatever song was being worked on
here.

## Development

```
npm install
npm run dev       # Vite dev server
npm test          # Vitest unit tests
npm run build     # Production build to dist/
```

## Deploy

Push to `main` → GitHub Actions builds and deploys to GitHub Pages automatically.

## Stack

- Vite + React + TypeScript
- Tone.js for the Web Audio bass and click
- Vitest for unit tests
- CSS Grid for the measure grid, no chart library

## Roadmap

- URL parameters for bookmarking a progression
- Section markers (A, B, 1st/2nd endings)
- Section repeat marks `|: :|`
- Metronome overlay track
