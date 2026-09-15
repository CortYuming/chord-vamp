import * as Tone from 'tone';
import type { Song as ParsedSong } from './chord';
import { SLOTS_PER_MEASURE } from './chord';
import type { ExpandedMeasure } from './slots';
import { expandSong } from './slots';
import { BEATS_PER_MEASURE, generateBassLine } from './bass';
import type { DrumHit } from './drums';
import { drumsForSlot } from './drums';
import { DrawQueue } from './drawqueue';

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

// Where each voice sits in the mix, in decibels. The kit sits under the bass,
// not thirty decibels under it: at -32 the ride was struck at 0.45 velocity on
// top of that and never reached the room. These were set by ear, the kit
// against the bass, with the limiter below catching the peaks.
const BASS_DB = -0.5;
const RIDE_DB = -16.5;
const HIHAT_DB = -14.5;

/**
 * Stopped is at the top of the chart with nothing built; paused is standing in
 * the middle of it with everything still in hand. The difference is what
 * resume() has to work with.
 */
export type PlayerState = 'stopped' | 'playing' | 'paused';

/** Where the playhead has reached, waiting for a frame to be drawn on. */
interface BeatEvent {
  measureIdx: number;
  beatIdx: number;
  isCountIn: boolean;
}

export interface PlayerConfig {
  song: ParsedSong;
  bpm: number;
  countIn: boolean;
  loopStart: number;
  loopEnd: number;
  transpose: number;
  /**
   * The bar of the song to begin at, by its index in the sheet. Outside the
   * loop -- or -1, for a chart nobody has put a playhead on yet -- it starts
   * at the top of what is being played.
   */
  startMeasure: number;
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
  private state: PlayerState = 'stopped';
  // Where the playhead is drawn from. The transport's callback runs ahead of
  // the sound and off the animation frame, so what it works out is queued here
  // and read back on the frame it is actually heard on.
  private draw = new DrawQueue<BeatEvent>();
  private frame: number | null = null;
  private expanded: ExpandedMeasure[] = [];
  // One MIDI note per beat of `expanded`, worked out once when Play is
  // pressed: the walk is the same every time round the loop.
  private line: (number | null)[] = [];
  private slotIndex = 0;
  private countInSlotsLeft = 0;
  // One slot of the run, pinned to the audio-clock time it falls on, from
  // which position() reads off where the music is at any moment. A single
  // anchor rather than the latest slot each time: with swing the off-beats
  // sound late by design, and measuring from each one in turn drags the
  // reading back and forth around the beat it is supposed to be following.
  private anchorTime = -1;
  private anchorSlot = 0;
  private cfg: PlayerConfig | null = null;

  get playState(): PlayerState {
    return this.state;
  }

  get isPlaying(): boolean {
    return this.state === 'playing';
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

    this.slotIndex = this.offsetOf(cfg.startMeasure) * SLOTS_PER_MEASURE;
    this.countInSlotsLeft = cfg.countIn ? SLOTS_PER_MEASURE : 0;
    this.kit = this.buildKit();
    this.state = 'playing';

    this.repeatId = Tone.getTransport().scheduleRepeat((time) => {
      this.tick(time);
    }, '8n');

    Tone.getTransport().start();
    this.startDrawing();
  }

  /**
   * Hold the music where it stands. The transport keeps its position, the kit
   * keeps its voices and the walking line stays as it was worked out, so
   * resume() carries on into the next slot instead of going back to the top --
   * which is what someone reading a chart wants when they stop in the middle
   * of it.
   */
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    Tone.getTransport().pause();
    // The note under the pause was struck for a beat that has stopped passing.
    // Let it go rather than leave it ringing over a still page.
    this.kit?.bass.triggerRelease();
    this.stopDrawing();
    // What was scheduled for the moments just after the pause belongs to music
    // nobody is going to hear now. The playhead stays where the ear left it.
    this.draw.clear();
  }

  async resume() {
    if (this.state !== 'paused') return;
    // A context suspended while the page sat paused has to be woken before the
    // transport will move again.
    await Tone.start();
    this.state = 'playing';
    // The clock ran on while the music stood still, so the line from the old
    // anchor no longer describes it.
    this.anchorTime = -1;
    Tone.getTransport().start();
    this.startDrawing();
  }

  // One frame, one update: whatever the queue says is the latest position that
  // has come due. Nothing is dropped for being late, so a frame the page was
  // too busy to draw costs a step of the animation and not the playhead.
  private startDrawing() {
    if (this.frame !== null) return;
    const loop = () => {
      this.frame = requestAnimationFrame(loop);
      const at = this.draw.due(Tone.getContext().currentTime);
      if (at) this.cfg?.onBeat(at.measureIdx, at.beatIdx, at.isCountIn);
    };
    this.frame = requestAnimationFrame(loop);
  }

  private stopDrawing() {
    if (this.frame === null) return;
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  /**
   * Move the playhead to a bar of the song without breaking stride: the next
   * eighth falls on the downbeat of that bar, so a seek in the middle of a
   * beat still lands in time. A bar outside what is being played is left
   * alone rather than dragging the music somewhere it was not asked to go.
   */
  seek(sourceIndex: number) {
    if (this.state === 'stopped') return;
    const at = this.expanded.findIndex((m) => m.sourceIndex === sourceIndex);
    if (at < 0) return;
    this.slotIndex = at * SLOTS_PER_MEASURE;
    this.anchorTime = -1;
    // What was queued belongs to the bar being left behind.
    this.draw.clear();
  }

  // Where a bar of the song sits in what is being played, which is the loop
  // when there is one. Anything that is not in it starts from the top.
  private offsetOf(sourceIndex: number): number {
    const at = this.expanded.findIndex((m) => m.sourceIndex === sourceIndex);
    return at < 0 ? 0 : at;
  }

  private buildKit(): Kit {
    // One ceiling for the whole section: the voices are summed here, and a
    // bass note landing under a ride accent adds up past what each is set to.
    const out = new Tone.Limiter(-1).toDestination();

    const clickFilter = new Tone.Filter({ frequency: 4000, type: 'highpass' }).connect(out);
    const click = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
      volume: -6,
    }).connect(clickFilter);

    const hihatFilter = new Tone.Filter({ frequency: 8000, type: 'highpass' }).connect(out);
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
    }).connect(out);


    const bass = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0.2, release: 0.3 },
      volume: BASS_DB,
    }).connect(out);

    return {
      click, hihat, ride, bass,
      nodes: [click, hihat, ride, bass, clickFilter, hihatFilter, out],
    };
  }

  private tick(time: number) {
    if (!this.cfg) return;

    if (this.countInSlotsLeft > 0) {
      const slotsElapsed = (SLOTS_PER_MEASURE - this.countInSlotsLeft);
      const isDownbeat = slotsElapsed % SLOTS_PER_BEAT === 0;
      if (isDownbeat) {
        this.kit?.click.triggerAttackRelease('16n', time);
        const beatIdx = Math.floor(slotsElapsed / SLOTS_PER_BEAT);
        this.draw.schedule({ measureIdx: -1, beatIdx, isCountIn: true }, time);
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

    if (this.anchorTime < 0) {
      this.anchorTime = time;
      this.anchorSlot = this.slotIndex;
    }

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
      this.draw.schedule({ measureIdx: src, beatIdx: bIdx, isCountIn: false }, time);
    }

    this.slotIndex++;
  }

  /**
   * Where the music is, in bars of the sheet, fractions and all: 9.5 is the
   * middle of bar 10. Null when there is nothing to follow -- stopped, held,
   * counting in, or between an anchor being dropped and the next slot.
   *
   * Straight line from the anchor, in even eighths. The ride swings and the
   * bass plays behind it, but a reader's eye travels at the tempo, so the
   * reading is the tempo rather than the last thing that was struck.
   */
  position(): number | null {
    if (this.state !== 'playing' || this.anchorTime < 0) return null;
    if (this.countInSlotsLeft > 0) return null;
    const total = this.expanded.length * SLOTS_PER_MEASURE;
    if (total === 0) return null;
    const slotSeconds = 30 / (this.cfg?.bpm ?? 120);
    // The transport schedules ahead of the sound, so for a moment after an
    // anchor is dropped the clock has not reached it yet. The music has not
    // either: it waits on the anchor rather than running backwards into the
    // bar before it.
    const slots = Math.max(
      this.anchorSlot,
      this.anchorSlot + (Tone.getContext().currentTime - this.anchorTime) / slotSeconds,
    );
    const at = slots % total;
    const mIdx = Math.floor(at / SLOTS_PER_MEASURE);
    const measure = this.expanded[mIdx];
    if (!measure) return null;
    return measure.sourceIndex + (at - mIdx * SLOTS_PER_MEASURE) / SLOTS_PER_MEASURE;
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
    const wasRunning = this.state !== 'stopped';
    this.disposeInternal();
    if (wasRunning) this.cfg?.onStop();
  }

  private disposeInternal() {
    this.state = 'stopped';
    this.anchorTime = -1;
    this.stopDrawing();
    this.draw.clear();
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
    // Slots are a different length from here on, so the line is measured again
    // from the next one.
    this.anchorTime = -1;
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
