import { CONFIG } from "./config";
import type { ChordOutput } from "./output";
import { chordChange, controlChange, levelToCc, noteOff, panicMessages, type MidiMessage } from "./midi-messages";

export interface MidiPortInfo {
  id: string;
  name: string;
}

export function isWebMidiSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";
}

/** 미지원 사유 문구. Web MIDI는 보안 컨텍스트(https·localhost)에서만 노출되므로 그 경우를 먼저 안내한다 */
export function unsupportedMessage(): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "UNSUPPORTED: MIDI는 보안 컨텍스트에서만 쓸 수 있습니다. http://127.0.0.1:5173 또는 localhost로 여세요";
  }
  return "UNSUPPORTED: 이 브라우저는 Web MIDI를 지원하지 않습니다. Chrome을 사용하세요";
}

/** Web MIDI 접근(권한)과 출력 포트 목록 */
export class MidiManager {
  private access: MIDIAccess | null = null;
  private pending: Promise<void> | null = null;
  private readonly listeners: Array<() => void> = [];

  get ready(): boolean {
    return this.access !== null;
  }

  /** 권한 요청. 처음 한 번 Chrome이 묻는다. 동시에 여러 번 불려도 requestMIDIAccess는 한 번만 실행된다. */
  request(): Promise<void> {
    if (this.access) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = this.doRequest().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async doRequest(): Promise<void> {
    if (!isWebMidiSupported()) throw new Error(unsupportedMessage());
    let access: MIDIAccess;
    try {
      access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(`DENIED: MIDI 권한이 거부되었습니다. 주소창 왼쪽 아이콘에서 MIDI를 허용한 뒤 다시 선택하세요 (${detail})`);
    }
    this.access = access;
    access.onstatechange = () => {
      for (const l of this.listeners) l();
    };
  }

  private connectedOutputs(): MIDIOutput[] {
    const all: MIDIOutput[] = [];
    this.access?.outputs.forEach((p) => {
      if (p.state === "connected") all.push(p);
    });
    return all;
  }

  /** 연결된 출력 포트 */
  outputs(): MidiPortInfo[] {
    return this.connectedOutputs().map((p) => ({ id: p.id, name: p.name ?? p.id }));
  }

  /** 연결된 포트만 돌려준다(상자를 그린 뒤 뽑힌 포트는 null) */
  getOutput(id: string): MIDIOutput | null {
    return this.connectedOutputs().find((p) => p.id === id) ?? null;
  }

  findById(id: string): MidiPortInfo | null {
    return this.outputs().find((p) => p.id === id) ?? null;
  }

  /** 같은 이름의 포트 전부(로케일이 바뀌어 id로 못 찾을 때 보조) */
  findByName(name: string): MidiPortInfo[] {
    return this.outputs().filter((p) => p.name === name);
  }

  /** 포트 추가·제거·열림 때 알림 */
  onChange(cb: () => void): void {
    this.listeners.push(cb);
  }
}

/** 포트 하나로 보내는 ChordOutput 구현 */
export class MidiOutput implements ChordOutput {
  private held: number[] = [];
  private lastCc = -1;
  private sendErrors = 0;
  private disposed = false;
  private listening = false;
  private readonly stateListeners: Array<(running: boolean) => void> = [];

  /** 포트 자체의 statechange(끊김). 인스턴스별 리스너라 같은 포트를 감싼 다른 인스턴스에 영향을 주지 않는다 */
  private readonly onPortState = (): void => {
    const running = this.isRunning();
    for (const cb of this.stateListeners) cb(running);
    if (!running) this.fail("MIDI 장치 연결이 끊어졌습니다");
  };

  constructor(
    private readonly port: MIDIOutput,
    private readonly onFatal: (reason: string) => void,
  ) {}

  get name(): string {
    return this.port.name ?? this.port.id;
  }

  get portId(): string {
    return this.port.id;
  }

  /** 포트를 열고 끊김 감시를 시작한다. 실패한 객체는 리스너를 남기지 않는다. */
  async start(): Promise<void> {
    try {
      await this.port.open();
    } catch (e) {
      throw new Error(`MIDI: 포트를 열 수 없습니다: ${this.name} (${e instanceof Error ? e.message : String(e)})`);
    }
    if (this.port.state !== "connected") throw new Error(`MIDI: 포트가 연결 상태가 아닙니다: ${this.name}`);
    this.port.addEventListener("statechange", this.onPortState);
    this.listening = true;
    this.lastCc = -1;
  }

  play(midi: readonly number[]): void {
    const msgs = chordChange(this.held, midi, CONFIG.midi.channel, CONFIG.midi.velocity);
    this.held = [...midi];
    this.sendAll(msgs);
  }

  setLevel(level: number): void {
    const v = levelToCc(level);
    if (v === this.lastCc) return;
    this.lastCc = v;
    this.sendAll([controlChange(CONFIG.midi.channel, CONFIG.midi.ccExpression, v)]);
  }

  stop(): void {
    if (this.held.length === 0) return;
    const msgs = this.held.map((n) => noteOff(CONFIG.midi.channel, n));
    this.held = [];
    this.sendAll(msgs);
  }

  /** 걸린 음 방지(Reset·pagehide·탭 숨김·오류): 들고 있던 음 Off + CC123 + CC120 */
  panic(): void {
    if (this.disposed) return;
    const msgs = panicMessages(this.held, CONFIG.midi.channel);
    this.held = [];
    this.lastCc = -1;
    this.sendAll(msgs);
  }

  isRunning(): boolean {
    return !this.disposed && this.port.state === "connected";
  }

  async resume(): Promise<void> {
    await this.port.open();
  }

  onStateChange(cb: (running: boolean) => void): void {
    this.stateListeners.push(cb);
  }

  /** 다른 출력으로 바꿀 때: 최선의 패닉 후 감시 해제. 이후 이 객체는 아무것도 보내지 않는다 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detach();
    this.trySendRaw(panicMessages(this.held, CONFIG.midi.channel));
    this.held = [];
  }

  private detach(): void {
    if (!this.listening) return;
    this.port.removeEventListener("statechange", this.onPortState);
    this.listening = false;
  }

  /**
   * 끊김·반복 실패. onFatal은 마이크로태스크로 미룬다 — play() 도중 동기로 출력이 교체되면
   * 호출자(processFrame)가 돌아와 '음이 없는 PLAYING' 상태를 만들기 때문이다.
   */
  private fail(reason: string): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detach();
    this.trySendRaw(panicMessages(this.held, CONFIG.midi.channel));
    this.held = [];
    queueMicrotask(() => this.onFatal(reason));
  }

  private trySendRaw(msgs: MidiMessage[]): void {
    for (const m of msgs) {
      try {
        this.port.send(m);
      } catch {
        /* 끊긴 포트면 실패하는 것이 정상 */
      }
    }
  }

  private sendAll(msgs: MidiMessage[]): void {
    if (this.disposed) return;
    for (const m of msgs) {
      try {
        this.port.send(m);
        this.sendErrors = 0; // '연속' 실패만 센다
      } catch (e) {
        this.sendErrors++;
        console.warn("MIDI 전송 실패", e);
        if (this.sendErrors >= CONFIG.midi.maxSendErrors) {
          this.fail("MIDI 전송이 반복 실패했습니다");
          return;
        }
      }
    }
  }
}
