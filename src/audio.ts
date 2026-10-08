import * as Tone from "tone";
import { CONFIG } from "./config";
import type { ChordOutput } from "./output";

export class ToneOutput implements ChordOutput {
  private synth: Tone.PolySynth | null = null;
  private gain: Tone.Gain | null = null;
  private heldHz: number[] = [];
  private strings: { synth: Tone.PluckSynth; gain: Tone.Gain; at: number }[] = []; // 스트럼 줄. at: 마지막 예약 시각(초)

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
    const master = this.gain;
    const p = CONFIG.pluck;
    this.strings = Array.from({ length: CONFIG.strum.strings }, () => {
      const gain = new Tone.Gain(0).connect(master);
      const synth = new Tone.PluckSynth({ attackNoise: p.attackNoise, dampening: p.dampening, resonance: 0.9, release: p.release }).connect(gain);
      return { synth, gain, at: 0 };
    });
  }

  /** 줄 하나를 튕긴다(Karplus-Strong). 울림 시간은 음높이와 무관하게 T60으로 맞춘다 */
  pluck(voice: number, midi: number, velocity: number, delayMs: number, holdMs: number | null, muted: boolean): void {
    const s = this.strings[voice];
    if (!s || !this.isRunning()) return; // 일시중지 중 예약하면 재개 순간 한꺼번에 터진다
    const p = CONFIG.pluck;
    const t = Tone.now() + Math.max(0, delayMs) / 1000;
    const hz = Tone.Frequency(midi, "midi").toFrequency();
    // 피드백 g^(t·f) = 0.001 → g = 0.001^(1/(T60·f)). 저음 줄만 길게 울리는 것을 막는다
    s.synth.resonance = Math.pow(0.001, 1 / (p.t60Sec * hz));
    s.synth.attackNoise = Math.max(p.attackNoise, p.minBurstSec * hz); // 고음 줄 버스트가 너무 짧지 않게
    s.synth.dampening = muted ? p.muteDampening : p.dampening;
    const v = Math.min(1, Math.max(0, velocity));
    s.gain.gain.rampTo(p.stringGain * Math.pow(v, p.velocityExponent), 0.005, t); // 계단 변경 클릭 방지
    s.synth.triggerAttack(hz, t);
    s.at = t;
    if (holdMs !== null) {
      const off = t + holdMs / 1000;
      s.synth.triggerRelease(off);
      s.at = off;
    }
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
    const now = Tone.now();
    for (const s of this.strings) s.synth.triggerRelease(Math.max(now, s.at) + 0.001); // 예약된 타격보다 뒤에 놓는다
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
