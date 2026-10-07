import * as Tone from "tone";
import { CONFIG } from "./config";
import type { ChordOutput } from "./output";

export class ToneOutput implements ChordOutput {
  private synth: Tone.PolySynth | null = null;
  private gain: Tone.Gain | null = null;
  private heldHz: number[] = [];

  async start(): Promise<void> {
    await Tone.start(); // AudioContext resume — 사용자 제스처 필요
    Tone.getContext().lookAhead = CONFIG.audio.lookAheadSec;
    if (this.synth) return;
    this.gain = new Tone.Gain(0).toDestination();
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: {
        attack: CONFIG.audio.attack,
        decay: CONFIG.audio.decay,
        sustain: CONFIG.audio.sustain,
        release: CONFIG.audio.release,
      },
    }).connect(this.gain);
    this.synth.maxPolyphony = CONFIG.audio.maxPolyphony;
  }

  play(midi: readonly number[]): void {
    if (!this.synth) return;
    const hz = midi.map((m) => Tone.Frequency(m, "midi").toFrequency());
    if (this.heldHz.length > 0) this.synth.triggerRelease(this.heldHz);
    if (hz.length > 0) this.synth.triggerAttack(hz);
    this.heldHz = hz;
  }

  setLevel(level: number, _control?: number): void {
    const v = Math.min(1, Math.max(0, level));
    this.gain?.gain.rampTo(v, CONFIG.audio.rampSec);
  }

  stop(): void {
    if (this.synth && this.heldHz.length > 0) this.synth.triggerRelease(this.heldHz);
    this.heldHz = [];
  }

  isRunning(): boolean {
    return Tone.getContext().state === "running";
  }

  async resume(): Promise<void> {
    await Tone.getContext().resume();
  }

  onStateChange(cb: (running: boolean) => void): void {
    Tone.getContext().on("statechange", () => cb(Tone.getContext().state === "running"));
  }
}
