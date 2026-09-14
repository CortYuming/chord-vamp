import * as Tone from 'tone';
import type { Song as ParsedSong } from './chord';
import { SLOTS_PER_MEASURE } from './chord';
import type { ExpandedMeasure } from './slots';
import { expandSong } from './slots';
import { BEATS_PER_MEASURE, generateBassLine } from './bass';
import type { DrumHit } from './drums';
import { drumsForSlot } from './drums';

// The transport already ticks in eighths, so one tick is one slot.
const SLOTS_PER_BEAT = SLOTS_PER_MEASURE / BEATS_PER_MEASURE;
const SWING_AMOUNT = 0.53;

// A walking note stops a little short of the next one. Held for its full beat
// the line slurs, since the synth is monophonic and the next note simply takes
// the voice; a dotted eighth leaves the gap a bass player's fingers do.
const BASS_DURATION = '8n.';

// The kit is there to be felt rather than listened to: the chart is what the
// player is reading. The ride is a short dry ping instead of a wash, and the
// hi-hat foot is barely more than a tick.
const RIDE_PITCH = 300;

// How hard each voice is struck, apart from how loud it is set. Velocity
// carries the accent; the mix carries the balance.
const RIDE_LEVEL = 0.45;
const RIDE_ACCENT_LEVEL = 0.75;
const HIHAT_LEVEL = 0.5;

// Where each voice sits in the mix, in decibels.
const BASS_DB = -4;
const RIDE_DB = -32;
const HIHAT_DB = -24;

export interface PlayerConfig {
  song: ParsedSong;
  bpm: number;
  countIn: boolean;
  loopStart: number;
  loopEnd: number;
  transpose: number;
  swing: boolean;
  bass: boolean;
  drums: boolean;
  onBeat: (measureIdx: number, beatIdx: number, isCountIn: boolean) => void;
  onStop: () => void;
}

/**
 * Every voice built for one run, and the filters behind them. Tearing down is
 * then one loop rather than a line per voice that has to be remembered when a
 * new one is added.
 */
interface Kit {
  click: Tone.NoiseSynth;
  hihat: Tone.NoiseSynth;
  ride: Tone.MetalSynth;
  bass: Tone.Synth;
  nodes: Tone.ToneAudioNode[];
}

export class Player {
  private kit: Kit | null = null;
  private repeatId: number | null = null;
  private expanded: ExpandedMeasure[] = [];
  // One MIDI note per beat of `expanded`, worked out once when Play is
  // pressed: the walk is the same every time round the loop.
  private line: (number | null)[] = [];
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
    this.line = generateBassLine(this.expanded);

    Tone.getTransport().bpm.value = cfg.bpm;
    Tone.getTransport().swing = cfg.swing ? SWING_AMOUNT : 0;
    Tone.getTransport().swingSubdivision = '8n';

    this.slotIndex = 0;
    this.countInSlotsLeft = cfg.countIn ? SLOTS_PER_MEASURE : 0;
    this.kit = this.buildKit();

    this.repeatId = Tone.getTransport().scheduleRepeat((time) => {
      this.tick(time);
    }, '8n');

    Tone.getTransport().start();
  }

  private buildKit(): Kit {
    const clickFilter = new Tone.Filter({ frequency: 4000, type: 'highpass' }).toDestination();
    const click = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
      volume: -6,
    }).connect(clickFilter);

    const hihatFilter = new Tone.Filter({ frequency: 8000, type: 'highpass' }).toDestination();
    const hihat = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.01 },
      volume: HIHAT_DB,
    }).connect(hihatFilter);

    // A cymbal is a crowd of inharmonic partials, which is what MetalSynth
    // makes. The short decay is deliberate: a ride left to ring washes over
    // the chord changes the line underneath is spelling out.
    const ride = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.26, release: 0.05 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.2,
      volume: RIDE_DB,
    }).toDestination();


    const bass = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0.2, release: 0.3 },
      volume: BASS_DB,
    }).toDestination();

    return { click, hihat, ride, bass, nodes: [click, hihat, ride, bass, clickFilter, hihatFilter] };
  }

  private tick(time: number) {
    if (!this.cfg) return;

    if (this.countInSlotsLeft > 0) {
      const slotsElapsed = (SLOTS_PER_MEASURE - this.countInSlotsLeft);
      const isDownbeat = slotsElapsed % SLOTS_PER_BEAT === 0;
      if (isDownbeat) {
        this.kit?.click.triggerAttackRelease('16n', time);
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
    const beatIdx = Math.floor(idx / SLOTS_PER_BEAT);
    const bIdx = Math.floor(slotInMeasure / SLOTS_PER_BEAT);
    const isDownbeat = slotInMeasure % SLOTS_PER_BEAT === 0;

    if (this.cfg.drums) {
      for (const hit of drumsForSlot(slotInMeasure, this.cfg.swing)) this.playDrum(hit, time);
    }

    // Only the beats sound. An off-beat chord is on the page and under the
    // player's eye; the bass walks in quarters underneath it.
    if (isDownbeat) {
      if (this.cfg.bass) {
        const midi = this.line[beatIdx];
        if (midi !== null && midi !== undefined) {
          const freq = Tone.Frequency(midi + this.cfg.transpose, 'midi').toFrequency();
          this.kit?.bass.triggerAttackRelease(freq, BASS_DURATION, time);
        }
      }
      const src = this.expanded[mIdx].sourceIndex;
      Tone.getDraw().schedule(() => {
        this.cfg?.onBeat(src, bIdx, false);
      }, time);
    }

    this.slotIndex++;
  }

  private playDrum(hit: DrumHit, time: number) {
    if (!this.kit) return;
    if (hit.voice === 'hihat') {
      this.kit.hihat.triggerAttackRelease('64n', time, HIHAT_LEVEL);
      return;
    }
    this.kit.ride.triggerAttackRelease(
      RIDE_PITCH,
      '16n',
      time,
      hit.accent ? RIDE_ACCENT_LEVEL : RIDE_LEVEL,
    );
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
    for (const node of this.kit?.nodes ?? []) node.dispose();
    this.kit = null;
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

  setParts(bass: boolean, drums: boolean) {
    if (!this.cfg) return;
    this.cfg.bass = bass;
    this.cfg.drums = drums;
  }
}
