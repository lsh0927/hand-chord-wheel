# MIDI 출력(2차) 구현 계획 — 2판 (실패 분석 반영)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하단 출력 상자에서 MIDI 포트를 고르면 손으로 고른 코드가 Web MIDI로 GarageBand에 전달되고, 손 펼침은 CC11로 함께 나간다. 걸린 음이 남지 않도록 전환·Reset·오류·탭 숨김에서 패닉을 보낸다.

**Architecture:** 1차의 `ChordOutput` 인터페이스를 구현하는 `MidiOutput`을 추가하고, `main.ts`는 현재 출력 객체를 교체하기만 한다. 메시지 바이트 생성은 순수 함수 모듈(`midi-messages.ts`)로 분리해 Vitest로 검증한다. Tone.js 경로는 건드리지 않는다.

**Tech Stack:** Web MIDI API(`navigator.requestMIDIAccess`, `MIDIOutput.send`, `MIDIPort.addEventListener("statechange")`), TypeScript 5.9.3 lib.dom 타입(확인 완료), 기존 Vite/Vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-midi-output-design.md` (8장 실패 분석 반영 포함)
**실패 분석:** `docs/superpowers/specs/2026-10-07-midi-failure-analysis.md`

**규칙(전 작업 공통):** 1차 계획과 동일(커밋 메시지 끝 Co-Authored-By, `npm run verify` FAIL 0, 즉흥 패치 금지, 시그니처 의심 시 `node_modules/typescript/lib/lib.dom.d.ts` 확인).

---

### Task 1: 상수와 MIDI 메시지 순수 함수 (TDD)

**Files:**
- Modify: `src/config.ts`
- Create: `src/midi-messages.ts`
- Test: `tests/midi-messages.test.ts`

- [ ] **Step 1: config에 midi 상수 추가** (`fps: { warnBelow: 15 },` 바로 위에)

```ts
  midi: {
    channel: 1, // 1~16
    velocity: 100,
    ccExpression: 11, // 손 펼침 → CC11 익스프레션
    storageKey: "hcw.output.v2", // JSON: {"kind":"tone"} | {"kind":"midi","id":"…","name":"…"}
    maxSendErrors: 5, // '연속' 전송 실패 시 브라우저 신디로 복귀 (성공하면 0으로)
  },
```

- [ ] **Step 2: 테스트 작성 (RED)**

`tests/midi-messages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  clamp7,
  statusByte,
  noteOn,
  noteOff,
  controlChange,
  levelToCc,
  chordChange,
  panicMessages,
  CC_ALL_NOTES_OFF,
  CC_ALL_SOUND_OFF,
} from "../src/midi-messages";

describe("clamp7: 0~127 정수", () => {
  it.each([
    [60, 60],
    [127.4, 127],
    [200, 127],
    [-5, 0],
    [73.66, 74],
    [Number.NaN, 0],
  ])("%s → %s", (v, out) => expect(clamp7(v)).toBe(out));
});

describe("statusByte: 상태 바이트 + 채널(1~16)", () => {
  it("채널 1은 하위 4비트 0, 채널 16은 15", () => {
    expect(statusByte(0x90, 1)).toBe(0x90);
    expect(statusByte(0x90, 16)).toBe(0x9f);
    expect(statusByte(0xb0, 2)).toBe(0xb1);
  });
  it("채널 0·17·소수는 예외", () => {
    expect(() => statusByte(0x90, 0)).toThrow();
    expect(() => statusByte(0x90, 17)).toThrow();
    expect(() => statusByte(0x90, 1.5)).toThrow();
  });
});

describe("Note On / Note Off / CC", () => {
  it("noteOn(1, 60, 100) = [0x90, 60, 100]", () => expect(noteOn(1, 60, 100)).toEqual([0x90, 60, 100]));
  it("벨로시티는 1~127로 클램프 (0은 Note Off로 해석되므로 1)", () => {
    expect(noteOn(1, 60, 200)[2]).toBe(127);
    expect(noteOn(1, 60, 0)[2]).toBe(1);
  });
  it("noteOff(1, 60) = [0x80, 60, 0]", () => expect(noteOff(1, 60)).toEqual([0x80, 60, 0]));
  it("controlChange(1, 11, 74) = [0xB0, 11, 74]", () => expect(controlChange(1, 11, 74)).toEqual([0xb0, 11, 74]));
});

describe("levelToCc: level(=펼침²) → 펼침에 비례하는 0~127", () => {
  it("0 → 0, 1 → 127, 1.5 → 127(클램프), 음수 → 0", () => {
    expect(levelToCc(0)).toBe(0);
    expect(levelToCc(1)).toBe(127);
    expect(levelToCc(1.5)).toBe(127);
    expect(levelToCc(-0.2)).toBe(0);
  });
  it("펼침 58%(level 0.3364) → 74", () => expect(levelToCc(0.58 * 0.58)).toBe(74));
  it("펼침 50%(level 0.25) → 64", () => expect(levelToCc(0.25)).toBe(64));
});

describe("chordChange: 이전 음 Off 전부 → 새 음 On 전부", () => {
  it("Em6 → A 전환", () => {
    expect(chordChange([40, 52], [45, 57], 1, 100)).toEqual([
      [0x80, 40, 0],
      [0x80, 52, 0],
      [0x90, 45, 100],
      [0x90, 57, 100],
    ]);
  });
  it("이전 음 없음 → On만, 새 음 없음 → Off만", () => {
    expect(chordChange([], [45], 1, 100)).toEqual([[0x90, 45, 100]]);
    expect(chordChange([40], [], 1, 100)).toEqual([[0x80, 40, 0]]);
  });
  it("공통 음도 다시 친다(Off 뒤 On)", () => {
    expect(chordChange([40, 52], [52, 59], 1, 100)).toEqual([
      [0x80, 40, 0],
      [0x80, 52, 0],
      [0x90, 52, 100],
      [0x90, 59, 100],
    ]);
  });
});

describe("panicMessages: 들고 있던 음 Off + CC123 + CC120", () => {
  it("순서와 값", () => {
    expect(panicMessages([40, 52], 1)).toEqual([
      [0x80, 40, 0],
      [0x80, 52, 0],
      [0xb0, CC_ALL_NOTES_OFF, 0],
      [0xb0, CC_ALL_SOUND_OFF, 0],
    ]);
    expect(CC_ALL_NOTES_OFF).toBe(123);
    expect(CC_ALL_SOUND_OFF).toBe(120);
  });
  it("들고 있던 음이 없어도 CC 두 개는 나간다", () => expect(panicMessages([], 1)).toHaveLength(2));
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run tests/midi-messages.test.ts`
Expected: FAIL — `Cannot find module '../src/midi-messages'`.

- [ ] **Step 4: 구현 (GREEN)**

`src/midi-messages.ts`:

```ts
// MIDI 메시지 바이트 생성. 브라우저 API를 쓰지 않는 순수 함수만.

export type MidiMessage = number[];

export const NOTE_ON = 0x90;
export const NOTE_OFF = 0x80;
export const CONTROL_CHANGE = 0xb0;
export const CC_ALL_SOUND_OFF = 120;
export const CC_ALL_NOTES_OFF = 123;

/** 0~127 정수로 클램프(반올림). 숫자가 아니면 0 */
export function clamp7(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(127, Math.max(0, Math.round(v)));
}

/** 상태 바이트(0x80·0x90·0xB0…)에 채널 1~16을 결합 */
export function statusByte(status: number, channel: number): number {
  if (!Number.isInteger(channel) || channel < 1 || channel > 16) {
    throw new Error(`MIDI 채널은 1~16이어야 합니다: ${channel}`);
  }
  return (status & 0xf0) | (channel - 1);
}

export function noteOn(channel: number, note: number, velocity: number): MidiMessage {
  // 벨로시티 0은 Note Off로 해석되므로 최소 1
  return [statusByte(NOTE_ON, channel), clamp7(note), Math.max(1, clamp7(velocity))];
}

export function noteOff(channel: number, note: number): MidiMessage {
  return [statusByte(NOTE_OFF, channel), clamp7(note), 0];
}

export function controlChange(channel: number, controller: number, value: number): MidiMessage {
  return [statusByte(CONTROL_CHANGE, channel), clamp7(controller), clamp7(value)];
}

/**
 * ChordOutput.setLevel의 level은 1차 정의상 (펼침%/100)². MIDI 컨트롤은 손 펼침에 비례하는 편이
 * 자연스러우므로 제곱을 되돌려 0~127로 만든다. 58% → 74, 100% → 127.
 */
export function levelToCc(level: number): number {
  const l = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  return clamp7(Math.sqrt(l) * 127);
}

/** 코드 전환: 이전 음 전부 Off → 새 음 전부 On (공통 음도 다시 친다) */
export function chordChange(prev: readonly number[], next: readonly number[], channel: number, velocity: number): MidiMessage[] {
  return [...prev.map((n) => noteOff(channel, n)), ...next.map((n) => noteOn(channel, n, velocity))];
}

/** 걸린 음 방지: 들고 있던 음 Off + 모든 음 끄기(CC123) + 모든 소리 끄기(CC120) */
export function panicMessages(held: readonly number[], channel: number): MidiMessage[] {
  return [
    ...held.map((n) => noteOff(channel, n)),
    controlChange(channel, CC_ALL_NOTES_OFF, 0),
    controlChange(channel, CC_ALL_SOUND_OFF, 0),
  ];
}
```

- [ ] **Step 5: 통과 확인 + 타입 검사**

Run: `npx vitest run tests/midi-messages.test.ts && npx tsc --noEmit`
Expected: 전부 PASS, tsc 출력 없음.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/midi-messages.ts tests/midi-messages.test.ts
git commit -m "feat: MIDI 메시지 순수 함수(Note On/Off, CC, 펼침→CC11, 코드 전환, 패닉) + 테스트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Web MIDI 래퍼 — MidiManager와 MidiOutput

**Files:**
- Create: `src/midi.ts`

- [ ] **Step 1: 작성**

```ts
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
```

- [ ] **Step 2: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 출력 없음. (`MIDIPort.addEventListener("statechange", …)` 오버로드, `open(): Promise<MIDIPort>`, `state`, `MIDIOutput.send(number[])`는 lib.dom.d.ts에서 확인했다.)

- [ ] **Step 3: Commit**

```bash
git add src/midi.ts
git commit -m "feat: Web MIDI 래퍼(MidiManager, MidiOutput — ChordOutput 구현, 패닉, 끊김 감지, 중복 요청 방지)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 출력 선택 상자와 main.ts 통합

**Files:**
- Modify: `index.html`, `src/overlay.ts`, `src/main.ts`

- [ ] **Step 1: index.html — 상자 추가**

`#bottom` 안, 팔레트 입력 다음 줄에:

```html
          <select id="output" class="sel" aria-label="소리 출력"></select>
```

CSS에 추가(`.btn:focus-visible` 줄 아래):

```css
      .sel { border: 1px solid rgba(255,255,255,0.35); background: rgba(0,0,0,0.55); color: #fff; font: 600 13px system-ui; padding: 8px 10px; border-radius: 8px; max-width: 260px; }
```

- [ ] **Step 2: overlay.ts — 출력 이름 표시**

`Scene`에 `outputName: string;` 추가(`delegate` 아래). 정보 줄 출력 수정:

```ts
  const cam = s.cameraFps !== null ? ` · 카메라 ${s.cameraFps.toFixed(0)} fps` : "";
  ctx.fillText(`처리 ${s.fps.toFixed(0)} fps${cam}${s.delegate ? ` · ${s.delegate}` : ""}${slow ? " · 느림" : ""} · 출력 ${s.outputName}`, 16, infoY);
```

- [ ] **Step 3: main.ts — 출력 교체 구조**

(a) import 추가:

```ts
import type { ChordOutput } from "./output";
import { MidiManager, MidiOutput, isWebMidiSupported } from "./midi";
```

(b) `const output = new ToneOutput();` 를 다음으로 교체:

```ts
const toneOutput = new ToneOutput();
let output: ChordOutput = toneOutput;
let midiOut: MidiOutput | null = null;
const midi = new MidiManager();
const outputSelect = $<HTMLSelectElement>("output");
let switchSeq = 0; // 출력 전환 세대. 늦게 끝난 전환은 버린다
let switchingTo: string | null = null; // 전환 진행 중 상자에 보여 줄 값
let lastOptionsKey = ""; // 상자 재구성 생략용
```

(c) Start 핸들러: `const audioReady = output.start().catch(` → `const audioReady = toneOutput.start().catch(` (Tone 컨텍스트는 제스처 안에서 항상 켜 둔다). 성공 블록의 `if (!output.isRunning()) {` → `if (output === toneOutput && !toneOutput.isRunning()) {`.

(d) `output.onStateChange((running) => {` → `toneOutput.onStateChange((running) => {` 로 바꾸고 콜백 첫 줄에 `if (output !== toneOutput) return;` 추가. `resumeAudioIfNeeded` 안의 `await output.resume(); if (output.isRunning())` → `await toneOutput.resume(); if (toneOutput.isRunning())`.

(e) describeError 접두어 목록:

```ts
  for (const prefix of ["UNSUPPORTED: ", "ASSET_MISSING: ", "TIMEOUT: ", "AUDIO: ", "CANCELLED: ", "DENIED: ", "MIDI: "]) {
```

(f) processFrame의 play 지점(출력이 전송 중 바뀌었으면 상태를 덮어쓰지 않는다):

```ts
    if (state !== "PLAYING" || sector !== currentSector) {
      const out = output;
      out.play(midi);
      if (output !== out) {
        silence(); // 전송 중 출력이 교체됨(끊김 복귀). 다음 프레임에 새 출력으로 다시 친다
        return;
      }
      currentSector = sector;
      setState("PLAYING");
    }
```

(g) 출력 선택 로직 — `// ── 좌우 바꾸기` 블록 앞에 추가:

```ts
// ── 소리 출력 선택 ──────────────────────────────────────
type OutputPref = { kind: "tone" } | { kind: "midi"; id: string; name: string };

function outputLabel(): string {
  return midiOut ? `MIDI: ${midiOut.name}` : "브라우저 신디";
}

function saveOutputPref(p: OutputPref): void {
  try {
    localStorage.setItem(CONFIG.midi.storageKey, JSON.stringify(p));
  } catch {
    /* 무시 */
  }
}

function loadOutputPref(): OutputPref | null {
  try {
    const raw = localStorage.getItem(CONFIG.midi.storageKey);
    if (!raw) return null;
    const p: unknown = JSON.parse(raw);
    if (typeof p !== "object" || p === null) return null;
    const o = p as { kind?: unknown; id?: unknown; name?: unknown };
    if (o.kind === "midi" && typeof o.id === "string" && typeof o.name === "string") return { kind: "midi", id: o.id, name: o.name };
    if (o.kind === "tone") return { kind: "tone" };
    return null;
  } catch {
    return null;
  }
}

/** 상자 다시 그리기. 내용이 같으면 건너뛴다(자기 open()으로 오는 statechange마다 드롭다운이 닫히지 않게) */
function renderOutputOptions(): void {
  const items: Array<[string, string, boolean]> = [["tone", "출력: 브라우저 신디", false]];
  if (!isWebMidiSupported()) {
    items.push(["midi-unsupported", window.isSecureContext ? "MIDI 미지원 (Chrome 필요)" : "MIDI 사용 불가 (localhost로 여세요)", true]);
  } else if (!midi.ready) {
    items.push(["midi-request", "MIDI 장치 찾기…", false]);
  } else {
    const ports = midi.outputs();
    if (ports.length === 0) items.push(["midi-none", "MIDI 포트 없음 (IAC 드라이버를 켜세요)", true]);
    for (const p of ports) items.push([`midi:${p.id}`, `MIDI: ${p.name}`, false]);
  }
  const wanted = switchingTo ?? (midiOut ? `midi:${midiOut.portId}` : "tone");
  const key = JSON.stringify([items, wanted]);
  if (key === lastOptionsKey) return;
  lastOptionsKey = key;
  outputSelect.innerHTML = "";
  for (const [value, text, disabled] of items) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    o.disabled = disabled;
    outputSelect.appendChild(o);
  }
  outputSelect.value = items.some(([v]) => v === wanted) ? wanted : "tone";
}

/** 브라우저 신디로. persist=false는 장애 복귀(사용자 선택을 덮어쓰지 않는다) */
function switchToTone(reason?: string, persist = true): void {
  switchSeq++;
  switchingTo = null;
  silence();
  if (midiOut) {
    midiOut.dispose();
    midiOut = null;
  }
  output = toneOutput;
  if (persist) saveOutputPref({ kind: "tone" });
  renderOutputOptions();
  showNotice(reason ? `${reason} → 브라우저 신디로 전환` : "출력: 브라우저 신디", reason ? 6000 : 2500);
  void toneOutput
    .start()
    .then(() => {
      audioSuspended = !toneOutput.isRunning();
      if (audioSuspended && output === toneOutput) showNotice("소리가 꺼져 있습니다. 화면을 한 번 클릭하세요", 6000);
    })
    .catch(() => {});
}

async function switchToMidi(id: string): Promise<void> {
  if (midiOut && midiOut.portId === id) return; // 같은 포트 재선택
  const port = midi.getOutput(id);
  if (!port) {
    showNotice("선택한 MIDI 포트를 찾지 못했습니다(연결 끊김?)", 4000);
    renderOutputOptions();
    return;
  }
  const seq = ++switchSeq;
  switchingTo = `midi:${id}`;
  renderOutputOptions();
  const next = new MidiOutput(port, (reason) => {
    if (midiOut === next) switchToTone(reason, false); // 현재 출력이 아닌 인스턴스의 실패는 무시
  });
  try {
    await next.start();
  } catch (e) {
    if (seq === switchSeq) {
      switchingTo = null;
      showNotice(describeError(e), 6000);
      renderOutputOptions();
    }
    return;
  }
  if (seq !== switchSeq) {
    next.dispose(); // 그 사이 다른 선택이 이겼다
    return;
  }
  switchingTo = null;
  if (!next.isRunning()) {
    next.dispose();
    showNotice(`MIDI 포트가 연결 상태가 아닙니다: ${next.name}`, 5000);
    renderOutputOptions();
    return;
  }
  silence(); // 이전 출력의 음을 놓는다
  if (midiOut) midiOut.dispose();
  midiOut = next;
  output = next;
  saveOutputPref({ kind: "midi", id: next.portId, name: next.name });
  renderOutputOptions();
  showNotice(`MIDI 출력: ${next.name} — GarageBand에서 소프트웨어 악기 트랙을 선택해 두세요`, 6000);
}

async function requestMidiAndPick(): Promise<void> {
  try {
    await midi.request();
  } catch (e) {
    showNotice(describeError(e), 7000);
    renderOutputOptions();
    return;
  }
  const ports = midi.outputs();
  renderOutputOptions();
  const only = ports[0];
  if (ports.length === 1 && only) {
    await switchToMidi(only.id);
    return;
  }
  if (ports.length === 0) {
    showNotice("MIDI 출력 포트가 없습니다. Audio MIDI 설정 → MIDI 스튜디오 → IAC 드라이버 → '장치가 온라인 상태' 체크", 8000);
    return;
  }
  showNotice(`MIDI 포트 ${ports.length}개를 찾았습니다. 상자에서 고르세요`, 5000);
}

async function restoreOutputPref(): Promise<void> {
  const pref = loadOutputPref();
  if (!pref || pref.kind !== "midi" || !isWebMidiSupported()) return;
  try {
    await midi.request();
  } catch {
    showNotice(`저장된 MIDI 출력 '${pref.name}'을 복원하지 못해 브라우저 신디로 시작합니다`, 6000);
    renderOutputOptions();
    return;
  }
  const byName = midi.findByName(pref.name);
  const target = midi.findById(pref.id) ?? (byName.length === 1 ? byName[0] : null) ?? null;
  renderOutputOptions();
  if (target) await switchToMidi(target.id);
  else showNotice(`저장된 MIDI 포트 '${pref.name}'을 찾지 못해 브라우저 신디로 시작합니다`, 6000);
}

outputSelect.addEventListener("change", () => {
  const v = outputSelect.value;
  if (v === "tone") switchToTone();
  else if (v === "midi-request") void requestMidiAndPick();
  else if (v.startsWith("midi:")) void switchToMidi(v.slice(5));
});
midi.onChange(() => renderOutputOptions());
```

(h) 패닉 지점:
- Reset 핸들러: `silence();` 다음 줄에 `midiOut?.panic();`
- `enterError`: `silence();` 다음 줄에 `midiOut?.panic();`
- `visibilitychange`: `if (document.hidden) silence();` → `if (document.hidden) { silence(); midiOut?.panic(); }` (탭을 닫을 때도 hidden이 pagehide보다 먼저 와서 1차 방어선이 된다)
- 그 아래에 추가:

```ts
window.addEventListener("pagehide", () => {
  silence();
  midiOut?.panic();
});
```

(i) `draw()`의 Scene에 `outputName: outputLabel(),` 추가(`delegate` 줄 아래).

(j) 부팅 블록 `loadSwap();` 다음에:

```ts
renderOutputOptions();
void restoreOutputPref();
```

- [ ] **Step 4: 타입 검사·전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc 출력 없음, 전부 PASS.

- [ ] **Step 5: 가짜 MIDI로 브라우저 확인 (Playwright run_code: addInitScript로 부팅 전에 주입)**

```js
async (page) => {
  await page.addInitScript(() => {
    window.__midiLog = [];
    const listeners = new Set();
    const port = { id: "fake-1", name: "IAC 드라이버 버스 1", state: "connected", connection: "closed", type: "output",
      onstatechange: null, open: async () => port, close: async () => port,
      addEventListener: (t, fn) => { if (t === "statechange") listeners.add(fn); },
      removeEventListener: (t, fn) => listeners.delete(fn),
      send: (m) => window.__midiLog.push(Array.from(m)) };
    window.__fakePort = port;
    const outputs = { forEach: (cb) => cb(port, port.id, outputs) };
    navigator.requestMIDIAccess = async () => ({ outputs, inputs: { forEach() {} }, onstatechange: null, sysexEnabled: false });
  });
  await page.goto("http://127.0.0.1:5173/?debug=1");
  const sel = page.locator("#output");
  const r = {};
  r.initialOptions = await sel.locator("option").allTextContents();
  await sel.selectOption("midi-request");
  await page.waitForTimeout(400);
  r.afterPick = await sel.inputValue();
  r.pref = await page.evaluate(() => localStorage.getItem("hcw.output.v2"));
  await page.locator("#reset").click();
  await page.waitForTimeout(100);
  r.logAfterReset = await page.evaluate(() => window.__midiLog.slice(-2));
  await sel.selectOption("tone");
  await page.waitForTimeout(100);
  r.logAfterTone = await page.evaluate(() => window.__midiLog.slice(-2));
  r.prefAfterTone = await page.evaluate(() => localStorage.getItem("hcw.output.v2"));
  // 복원: midi 선호를 저장해 두고 새로고침
  await page.evaluate(() => localStorage.setItem("hcw.output.v2", JSON.stringify({ kind: "midi", id: "fake-1", name: "IAC 드라이버 버스 1" })));
  await page.reload();
  await page.waitForTimeout(600);
  r.restored = await sel.inputValue();
  // 끊김: 가짜 포트를 disconnected로 바꾸고 리스너 호출 → 신디 복귀, 선호는 유지
  await page.evaluate(() => { window.__fakePort.state = "disconnected"; });
  await page.evaluate(() => { /* 리스너는 Set에 있으나 외부에서 접근 불가하므로 statechange 흉내: */ });
  r.prefKept = await page.evaluate(() => localStorage.getItem("hcw.output.v2"));
  await page.evaluate(() => localStorage.removeItem("hcw.output.v2"));
  return r;
}
```

Expected:
1. `initialOptions` = ["출력: 브라우저 신디", "MIDI 장치 찾기…"].
2. `afterPick` = "midi:fake-1", `pref` = `{"kind":"midi","id":"fake-1","name":"IAC 드라이버 버스 1"}`.
3. `logAfterReset` = [[176,123,0],[176,120,0]].
4. `logAfterTone` = [[176,123,0],[176,120,0]] (dispose 패닉), `prefAfterTone` = `{"kind":"tone"}`.
5. `restored` = "midi:fake-1" (부팅 복원 성공).
6. 끊김 흉내는 가짜 포트의 리스너 Set을 노출하도록 init script에 `window.__fireState = () => listeners.forEach((fn) => fn())`를 추가해 호출하고, 그 뒤 상자가 "tone"으로 돌아가며 `prefKept`는 여전히 midi 선호인지 확인한다(장애 복귀는 선호를 덮어쓰지 않음).

- [ ] **Step 6: Commit**

```bash
git add index.html src/overlay.ts src/main.ts
git commit -m "feat: 출력 선택 상자(브라우저 신디/MIDI 포트), 전환 세대·복원·패닉 안전장치

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 문서·QA 인프라 갱신

**Files:**
- Modify: `README.md`, `.claude/hooks/check-impact.sh`, `.claude/skills/music-debugging/references/symptom-map.md`, `.claude/skills/music-verifier/references/impact-matrix.md`, `.claude/skills/music-verifier/gotchas.md`

- [ ] **Step 1: README — "GarageBand로 연주하기" 절 추가** (`## 검증` 앞에)

```markdown
## GarageBand로 연주하기 (MIDI 출력)
1. **IAC 드라이버 켜기**: Audio MIDI 설정 앱(응용 프로그램 → 유틸리티) → 메뉴 윈도우 → MIDI 스튜디오 표시 → "IAC 드라이버" 더블클릭 → "장치가 온라인 상태" 체크. 포트 목록에 "버스 1"이 있으면 됩니다.
2. **GarageBand**: 새 프로젝트 → 소프트웨어 악기 트랙 → 악기 선택. 처음에는 스트링/패드 계열이나 Smart Controls에서 아르페지에이터를 켠 신스를 권합니다. GarageBand는 연결된 모든 MIDI 입력을 **선택된 트랙** 하나로 받으므로 그 트랙을 선택해 두세요.
3. **웹앱**: 하단 "출력" 상자에서 "MIDI 장치 찾기…" → Chrome 권한 허용 → IAC 버스가 하나면 자동 선택됩니다. 좌상단 정보 줄에 `출력 MIDI: IAC 드라이버 버스 1`이 보이면 연결된 것입니다. 선택은 저장되어 다음에 자동으로 복원됩니다.
4. 손 펼침은 CC11(익스프레션)으로 나갑니다. 다른 파라미터에 걸고 싶으면 GarageBand Smart Controls의 학습(Learn) 기능으로 CC11을 원하는 노브에 배우게 하세요.

문제 해결
- 소리가 안 남: GarageBand에서 악기 트랙이 **선택**되어 있는지, 트랙 헤더의 MIDI 입력 표시가 손을 움직일 때 깜빡이는지, IAC가 온라인인지 확인. Chrome 주소창 왼쪽 아이콘에서 MIDI 권한 상태도 확인. LAN 주소(http://192.168.…)에서는 MIDI를 쓸 수 없으니 localhost로 여세요.
- 음이 걸려서 계속 울림: 웹앱 Reset을 누르면 모든 음 끄기(CC123)와 모든 소리 끄기(CC120)가 나갑니다. 탭을 숨기거나 닫아도 자동으로 나갑니다(탭 종료 시 전달은 보장이 아니라 최선).
- 포트가 뽑히거나 꺼지면 자동으로 브라우저 신디로 돌아가며 상단에 안내가 뜹니다. 저장된 선택은 유지되어 다음 실행 때 다시 시도합니다.
```

`## 다음 계획`(기존 `## 2차 계획`)을 다음으로 교체:

```markdown
## 다음 계획
- 스트럼 벨로시티(손을 펴는 속도로 세기), 곡별 코드 팔레트 프리셋, 왼손 기능, One Euro Filter
```

- [ ] **Step 2: 영향 범위 훅에 분기 추가** (`src/camera.ts)` 분기 아래)

```bash
  src/midi.ts|src/midi-messages.ts) echo "[impact] MIDI 출력 → tests/midi-messages.test.ts 실행, 가짜 MIDI 브라우저 확인(전환·Reset 패닉·복원·끊김 복귀), GarageBand 실측(걸린 음 없는지)" ;;
```

- [ ] **Step 3: symptom-map 행 추가**

```markdown
| MIDI 포트가 상자에 안 보임 | 권한 거부 / IAC 오프라인 / Safari / LAN 주소 | 상단 알림 문구, Audio MIDI 설정 | 주소창 MIDI 권한 허용; IAC '장치가 온라인 상태'; Chrome + localhost |
| GarageBand에 소리 안 남(상자는 MIDI) | 트랙 미선택 / 다른 입력 장치 설정 / 채널 | GarageBand 트랙 헤더 MIDI 표시등 | 악기 트랙 선택; 환경설정 → 오디오/MIDI 입력 확인 |
| 음이 걸려 계속 울림 | 패닉 미전송(강제 종료 등) | — | Reset 클릭(CC123·120 전송); GarageBand 트랙 음소거 후 해제 |
| MIDI 전환 뒤 브라우저 소리도 같이 남 | 출력 교체 전 stop 누락 | main.ts switchToMidi의 silence() | silence() 호출 순서 확인 |
| 포트가 멀쩡한데 갑자기 신디로 전환됨 | 전송 연속 실패 5회 | 콘솔 "MIDI 전송 실패" | IAC 상태 확인; sendErrors가 성공 시 0으로 초기화되는지 |
```

- [ ] **Step 4: impact-matrix 행과 gotchas 추가**

impact-matrix:
```markdown
| src/midi.ts, src/midi-messages.ts | MIDI 출력, 패닉, 전환 | tests/midi-messages.test.ts | 가짜 MIDI 브라우저 확인, GarageBand 실측 |
```

gotchas:
```markdown
10. **증상** MIDI 전송 실패로 신디 복귀 직후 손이 같은 칸에 있는데 무음
    **원인** fail()→onFatal→switchToTone이 play() 도중 동기로 돌아 processFrame이 '음 없는 PLAYING'을 만듦
    **규칙** 출력 전환 콜백은 queueMicrotask로 미루고, processFrame은 play 뒤 출력 객체가 바뀌었으면 상태를 덮어쓰지 않는다
    **적용 시점** midi.ts fail()/main.ts processFrame 수정 때

11. **증상** 같은 포트를 감싼 MidiOutput이 둘 생기면 끊김 감지가 사라짐
    **원인** port.onstatechange 단일 슬롯을 대입·null로 덮어씀
    **규칙** 포트 이벤트는 addEventListener/removeEventListener로 인스턴스별 등록, 등록은 open() 성공 뒤
    **적용 시점** midi.ts 수정 때
```

- [ ] **Step 5: 전체 검증 + Commit**

Run: `npm run verify` → FAIL 0.

```bash
git add README.md .claude
git commit -m "docs: GarageBand MIDI 연주 안내, QA 인프라에 MIDI 항목 추가

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 사용자 실측과 푸시

- [ ] **Step 1: 사용자 확인 항목** (Chrome + GarageBand)
1. IAC 드라이버 온라인, GarageBand 스트링 패드 트랙 선택.
2. 웹앱 출력 상자 → "MIDI 장치 찾기…" → 허용 → 자동 선택 알림(GarageBand 트랙 선택 힌트 포함).
3. 손 1시 → 스트링이 Em6로 울림, 손을 더 펴면 소리가 커짐(CC11), 3시로 옮기면 A9로 전환, 주먹 → 멈춤.
4. Reset → 즉시 멈춤. 탭을 숨겼다 돌아오기 → 음 안 남음. 탭을 닫기 → GarageBand에 음이 남지 않는지(남으면 README 안내대로 복구, gotchas 기록).
5. 아르페지에이터를 켠 신스 트랙으로 바꿔 손을 한 칸에 두면 패턴이 흐르고 칸을 옮기면 코드만 바뀜.
6. 연주 중 Audio MIDI 설정에서 IAC를 오프라인으로 → 1초 안에 "연결이 끊어졌습니다 → 브라우저 신디로 전환" 알림, 소리가 신디로 이어짐. 다시 온라인 → 새로고침하면 저장된 선택으로 자동 복원.
7. 새로고침 → 권한 창 없이 MIDI로 자동 복원되는지(Chrome이 허용을 기억).
8. 미확인 런타임 동작 기록: 끊긴 포트 send 예외 여부, 제스처 없는 복원 요청의 프롬프트 여부, 탭 종료 시 패닉 전달 여부 → gotchas에 결과 추가.

- [ ] **Step 2: 결과 기록과 푸시**
문제가 있으면 symptom-map대로 원인을 찾고 고친 뒤, `npm run verify` FAIL 0 확인 후 main에 커밋·푸시.

---

## Self-Review (2판)

- **Spec coverage:** 3-1 메시지(Task 1), 3-2 CC11 변환·중복 억제(Task 1·2), 3-3 선택·전환·복원(id+이름)·statechange·같은 포트 가드·전환 세대(Task 3), 3-4 패닉 지점(Task 2·3: 전환 dispose, Reset, enterError, pagehide, hidden, 끊김 fail), 3-5 끊김·연속 실패·마이크로태스크 지연(Task 2), 4장 화면(Task 3), 5장 오류 표(Task 2·3 메시지, 비보안 컨텍스트 문구), 6장 테스트(Task 1 Vitest, Task 3 Playwright addInitScript, Task 5 실측), 7장 GarageBand(Task 4), 8장 실패 분석 반영(전 Task).
- **실패 분석 반영 확인:** CRITICAL(동기 재진입 → 음 없는 PLAYING) → queueMicrotask + play 가드. GAP: start 뒤 isRunning 확인, request() in-flight 공유, addEventListener 인스턴스별 리스너 + open 성공 뒤 등록, 같은 포트 재선택 가드, 전환 세대 번호, 현재 출력 아닌 인스턴스의 실패 무시, sendErrors 성공 시 0, 선호 id+이름 JSON(v2 키) + 장애 복귀는 persist=false, Start 성공 검사 toneOutput 기준, Tone 콜백 가드, MIDI: 접두어, getOutput 연결 포트만, 상자 재구성 생략 + switchingTo, 비보안 컨텍스트 문구, 성공 알림에 GarageBand 힌트, Playwright addInitScript, 미확인 런타임 동작은 Task 5·gotchas.
- **Type consistency:** `MidiOutput.name/portId/dispose/panic/isRunning` ↔ main.ts. `MidiManager.request/ready/outputs/getOutput/findById/findByName/onChange` ↔ main.ts. `OutputPref` 저장·복원 대칭. `Scene.outputName` ↔ `draw()`. `describeError`가 `DENIED:`·`MIDI:`·`UNSUPPORTED:` 접두어를 벗긴다.
