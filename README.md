# Chord Vamp

A minimal iReal Pro–style chord progression player for the browser. Type chords, hit play, and a bass line comps for you at the chosen BPM.

## demo site

https://cortyuming.github.io/chord-vamp/

## Features

- Text-input chord progression, pipe-delimited per measure: `|F13|Bb9|F13|F13|Bb9|Bb9|F13|D7#9|G7|C7#9|F13 D7#9|G7#9|`
- Multiple chords per measure with space (`|F13 D7#9|`)
- In-bar chord repeat with `.` — `|Bb13 . . E9|` expands to `|Bb13 Bb13 Bb13 E9|`
- Single- and two-bar repeat marks `%` / `%%`
- 4-measures-per-row display with iReal Pro–style borders
- Bass root note played on quarter notes via Web Audio
- Count-in of one bar (four stick clicks) before playback; skipped on loop restart
- Drag across measures to set a loop range
- Transpose by semitone (`♭` / `♯` buttons or `←` / `→`), or pick a target Key directly
- `♯` / `♭` accidental preference toggle
- Save named songs to localStorage with BPM and transpose baked in
- Tap tempo
- Space bar toggles play

## Chord Input Grammar

```
song      := "|" measure ("|" measure)* "|"
measure   := chords | "%" | "%%" | ""
chords    := chord (" " (chord | "."))*
chord     := root [quality] ["/" bass]
root      := [A-G] ["#" | "b"]
quality   := any chord suffix, passed through as-is (e.g. m7, 7#9, maj7b5, sus4)
bass      := root
```

- Empty measures render as a dot and rest during playback.
- Multiple chords in a measure split the four beats: 2 chords → 2+2, 3 chords → 2+1+1, 4 chords → 1+1+1+1.
- `.` repeats the previous chord within the same measure only; it does not carry across bar lines.
- `N.C.` is recognized as no-chord (silent).

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
- 3/4 and 6/8 time signatures
