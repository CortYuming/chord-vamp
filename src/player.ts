import * as Tone from 'tone';
import type { Chord, Song as ParsedSong } from './chord';
import { NOTES_SHARP, SLOTS_PER_MEASURE } from './chord';
import type { ExpandedMeasure } from './slots';
import { expandSong } from './slots';

const BEATS_PER_MEASURE = 4;
// The transport already ticks in eighths, so one tick is one slot.
const SLOTS_PER_BEAT = SLOTS_PER_MEASURE / BEATS_PER_MEASURE;
const BASS_OCTAVE = 2;
const SWING_AMOUNT = 0.53;

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
  private slotIndex = 0;
  private countInSlotsLeft = 0;
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

    this.slotIndex = 0;
    this.countInSlotsLeft = cfg.countIn ? SLOTS_PER_MEASURE : 0;

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

    if (this.countInSlotsLeft > 0) {
      const slotsElapsed = (SLOTS_PER_MEASURE - this.countInSlotsLeft);
      const isDownbeat = slotsElapsed % SLOTS_PER_BEAT === 0;
      if (isDownbeat) {
        this.clickSynth?.triggerAttackRelease('16n', time);
        const beatIdx = Math.floor(slotsElapsed / SLOTS_PER_BEAT);
        Tone.getDraw().schedule(() => {
          this.cfg?.onBeat(-1, beatIdx, true);
        }, time);
      }
      this.countInSlotsLeft--;
      return;
    }

    if (this.expanded.length === 0) return;
    const total = this.expanded.length * SLOTS_PER_MEASURE;
    const idx = this.slotIndex % total;
    const mIdx = Math.floor(idx / SLOTS_PER_MEASURE);
    const slotInMeasure = idx % SLOTS_PER_MEASURE;
    const bIdx = Math.floor(slotInMeasure / SLOTS_PER_BEAT);
    const isDownbeat = slotInMeasure % SLOTS_PER_BEAT === 0;

    // Only the beat slots sound. An off-beat chord is on the page and under
    // the player's eye, but the bass walks in quarters underneath it.
    if (isDownbeat) {
      const chord = this.expanded[mIdx].slots[slotInMeasure];
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

    this.slotIndex++;
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
