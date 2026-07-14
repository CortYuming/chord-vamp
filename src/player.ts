import * as Tone from 'tone';
import type { Chord, Measure, Song as ParsedSong } from './chord';
import { NOTES_SHARP } from './chord';

export interface ExpandedMeasure {
  beats: (Chord | null)[];
  sourceIndex: number;
}

export interface PlayerConfig {
  song: ParsedSong;
  bpm: number;
  countIn: boolean;
  loopStart: number;
  loopEnd: number;
  transpose: number;
  swing: boolean;
  onBeat: (measureIdx: number, beatIdx: number, isCountIn: boolean) => void;
  onStop: () => void;
}

const BEATS_PER_MEASURE = 4;
const SUBS_PER_BEAT = 2;
const SUBS_PER_MEASURE = BEATS_PER_MEASURE * SUBS_PER_BEAT;
const BASS_OCTAVE = 2;
const SWING_AMOUNT = 0.53;

function resolveMeasureChords(measures: Measure[], idx: number): Chord[] {
  let cur = idx;
  const guard = new Set<number>();
  while (cur >= 0 && !guard.has(cur)) {
    guard.add(cur);
    const m = measures[cur];
    if (!m) return [];
    if (m.kind === 'chords') return m.chords;
    if (m.kind === 'repeat1') cur -= 1;
    else if (m.kind === 'repeat2') cur -= 2;
    else break;
  }
  return [];
}

function splitToBeats(chords: Chord[], perMeasure: number): (Chord | null)[] {
  if (chords.length === 0) return Array(perMeasure).fill(null);
  if (chords.length >= perMeasure) return chords.slice(0, perMeasure);
  const beatsPerChord = perMeasure / chords.length;
  const beats: (Chord | null)[] = [];
  for (let b = 0; b < perMeasure; b++) {
    const idx = Math.floor(b / beatsPerChord);
    beats.push(chords[Math.min(idx, chords.length - 1)]);
  }
  return beats;
}

export function expandSong(
  song: ParsedSong,
  loopStart: number,
  loopEnd: number,
): ExpandedMeasure[] {
  const n = song.measures.length;
  if (n === 0) return [];
  const s = Math.max(0, Math.min(loopStart, n - 1));
  const e = loopEnd < 0 ? n - 1 : Math.max(s, Math.min(loopEnd, n - 1));
  const out: ExpandedMeasure[] = [];
  for (let i = s; i <= e; i++) {
    const chords = resolveMeasureChords(song.measures, i);
    out.push({
      beats: splitToBeats(chords, BEATS_PER_MEASURE),
      sourceIndex: i,
    });
  }
  return out;
}

function shiftRoot(root: number, semitones: number): number {
  return (((root + semitones) % 12) + 12) % 12;
}

function chordToBassNote(chord: Chord, transpose: number): string | null {
  const base = chord.bass !== null ? chord.bass : chord.root;
  if (base === null) return null;
  const shifted = shiftRoot(base, transpose);
  return NOTES_SHARP[shifted] + BASS_OCTAVE;
}

export class Player {
  private clickSynth: Tone.NoiseSynth | null = null;
  private hatSynth: Tone.NoiseSynth | null = null;
  private bassSynth: Tone.Synth | null = null;
  private repeatId: number | null = null;
  private expanded: ExpandedMeasure[] = [];
  private subIndex = 0;
  private countInSubsLeft = 0;
  private cfg: PlayerConfig | null = null;

  get isPlaying(): boolean {
    return this.repeatId !== null;
  }

  async start(cfg: PlayerConfig) {
    await Tone.start();
    this.disposeInternal();

    this.cfg = cfg;
    this.expanded = expandSong(cfg.song, cfg.loopStart, cfg.loopEnd);
    if (this.expanded.length === 0) return;

    Tone.getTransport().bpm.value = cfg.bpm;
    Tone.getTransport().swing = cfg.swing ? SWING_AMOUNT : 0;
    Tone.getTransport().swingSubdivision = '8n';

    this.subIndex = 0;
    this.countInSubsLeft = cfg.countIn ? BEATS_PER_MEASURE * SUBS_PER_BEAT : 0;

    const clickFilter = new Tone.Filter({ frequency: 4000, type: 'highpass' }).toDestination();
    this.clickSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
      volume: -6,
    }).connect(clickFilter);

    const hatFilter = new Tone.Filter({ frequency: 7000, type: 'highpass' }).toDestination();
    this.hatSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
      volume: -16,
    }).connect(hatFilter);

    this.bassSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.15, release: 0.25 },
      volume: -2,
    }).toDestination();

    this.repeatId = Tone.getTransport().scheduleRepeat((time) => {
      this.tick(time);
    }, '8n');

    Tone.getTransport().start();
  }

  private tick(time: number) {
    if (!this.cfg) return;

    if (this.countInSubsLeft > 0) {
      const beatsElapsed = (BEATS_PER_MEASURE * SUBS_PER_BEAT - this.countInSubsLeft);
      const isDownbeat = beatsElapsed % SUBS_PER_BEAT === 0;
      if (isDownbeat) {
        this.clickSynth?.triggerAttackRelease('16n', time);
        const beatIdx = Math.floor(beatsElapsed / SUBS_PER_BEAT);
        Tone.getDraw().schedule(() => {
          this.cfg?.onBeat(-1, beatIdx, true);
        }, time);
      }
      this.countInSubsLeft--;
      return;
    }

    if (this.expanded.length === 0) return;
    const total = this.expanded.length * SUBS_PER_MEASURE;
    const idx = this.subIndex % total;
    const mIdx = Math.floor(idx / SUBS_PER_MEASURE);
    const subInMeasure = idx % SUBS_PER_MEASURE;
    const bIdx = Math.floor(subInMeasure / SUBS_PER_BEAT);
    const isDownbeat = subInMeasure % SUBS_PER_BEAT === 0;

    if (isDownbeat) {
      const chord = this.expanded[mIdx].beats[bIdx];
      if (chord) {
        const note = chordToBassNote(chord, this.cfg.transpose);
        if (note) this.bassSynth?.triggerAttackRelease(note, '8n', time);
      }
      const src = this.expanded[mIdx].sourceIndex;
      Tone.getDraw().schedule(() => {
        this.cfg?.onBeat(src, bIdx, false);
      }, time);
    } else if (this.cfg.swing) {
      this.hatSynth?.triggerAttackRelease('32n', time);
    }

    this.subIndex++;
  }

  stop() {
    const wasPlaying = this.isPlaying;
    this.disposeInternal();
    if (wasPlaying) this.cfg?.onStop();
  }

  private disposeInternal() {
    if (this.repeatId !== null) {
      Tone.getTransport().clear(this.repeatId);
      this.repeatId = null;
    }
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    Tone.getTransport().swing = 0;
    this.clickSynth?.dispose();
    this.clickSynth = null;
    this.hatSynth?.dispose();
    this.hatSynth = null;
    this.bassSynth?.dispose();
    this.bassSynth = null;
  }

  setBpm(bpm: number) {
    Tone.getTransport().bpm.value = bpm;
    if (this.cfg) this.cfg.bpm = bpm;
  }

  setTranspose(semitones: number) {
    if (this.cfg) this.cfg.transpose = semitones;
  }

  setSwing(on: boolean) {
    Tone.getTransport().swing = on ? SWING_AMOUNT : 0;
    if (this.cfg) this.cfg.swing = on;
  }
}
