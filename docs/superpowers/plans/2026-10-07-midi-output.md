# MIDI 출력(2차) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하단 출력 상자에서 MIDI 포트를 고르면 손으로 고른 코드가 Web MIDI로 GarageBand에 전달되고, 손 펼침은 CC11로 함께 나간다. 걸린 음이 남지 않도록 전환·Reset·오류·탭 숨김에서 패닉을 보낸다.

**Architecture:** 1차의 `ChordOutput` 인터페이스를 구현하는 `MidiOutput`을 추가하고, `main.ts`는 현재 출력 객체를 교체하기만 한다. 메시지 바이트 생성은 순수 함수 모듈(`midi-messages.ts`)로 분리해 Vitest로 검증한다. Tone.js 경로는 건드리지 않는다.

**Tech Stack:** Web MIDI API(`navigator.requestMIDIAccess`, `MIDIOutput.send`), TypeScript 5.9.3 lib.dom 타입(확인 완료), 기존 Vite/Vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-midi-output-design.md`

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
    storageKey: "hcw.output.v1", // "tone" 또는 "midi:<포트 이름>"
    maxSendErrors: 5, // 연속 전송 실패 시 브라우저 신디로 복귀
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
    const msgs = chordChange([40, 52], [52, 59], 1, 100);
    expect(msgs).toEqual([
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

/** Web MIDI 접근(권한)과 출력 포트 목록 */
export class MidiManager {
  private access: MIDIAccess | null = null;
  private readonly listeners: Array<() => void> = [];

  get ready(): boolean {
    return this.access !== null;
  }

  /** 권한 요청. 처음 한 번 Chrome이 묻는다. 미지원이면 UNSUPPORTED, 거부면 DENIED 접두어 Error. */
  async request(): Promise<void> {
    if (this.access) return;
    if (!isWebMidiSupported()) throw new Error("UNSUPPORTED: 이 브라우저는 Web MIDI를 지원하지 않습니다. Chrome을 사용하세요");
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

  private allOutputs(): MIDIOutput[] {
    const all: MIDIOutput[] = [];
    this.access?.outputs.forEach((p) => all.push(p));
    return all;
  }

  /** 연결된 출력 포트 */
  outputs(): MidiPortInfo[] {
    return this.allOutputs()
      .filter((p) => p.state === "connected")
      .map((p) => ({ id: p.id, name: p.name ?? p.id }));
  }

  getOutput(id: string): MIDIOutput | null {
    return this.allOutputs().find((p) => p.id === id) ?? null;
  }

  findByName(name: string): MidiPortInfo | null {
    return this.outputs().find((p) => p.name === name) ?? null;
  }

  /** 포트 추가·제거 때 알림 */
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
  private readonly stateListeners: Array<(running: boolean) => void> = [];

  constructor(
    private readonly port: MIDIOutput,
    private readonly onFatal: (reason: string) => void,
  ) {
    port.onstatechange = () => {
      const running = this.isRunning();
      for (const cb of this.stateListeners) cb(running);
      if (!running) this.fail("MIDI 장치 연결이 끊어졌습니다");
    };
  }

  get name(): string {
    return this.port.name ?? this.port.id;
  }

  get portId(): string {
    return this.port.id;
  }

  async start(): Promise<void> {
    try {
      await this.port.open();
    } catch (e) {
      throw new Error(`MIDI 포트를 열 수 없습니다: ${this.name} (${e instanceof Error ? e.message : String(e)})`);
    }
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

  /** 다른 출력으로 바꿀 때: 최선의 패닉 후 이벤트 해제. 이후 이 객체는 아무것도 보내지 않는다 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.port.onstatechange = null;
    this.trySendRaw(panicMessages(this.held, CONFIG.midi.channel));
    this.held = [];
  }

  private fail(reason: string): void {
    if (this.disposed) return;
    this.disposed = true; // 재진입 방지: onFatal 쪽에서 dispose()를 불러도 무해
    this.port.onstatechange = null;
    this.trySendRaw(panicMessages(this.held, CONFIG.midi.channel));
    this.held = [];
    this.onFatal(reason);
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
Expected: 출력 없음. (`MIDIOutputMap.forEach`, `MIDIPort.state/name/id/open/onstatechange`, `MIDIOutput.send(number[])`는 lib.dom.d.ts에서 확인했다.)

- [ ] **Step 3: Commit**

```bash
git add src/midi.ts
git commit -m "feat: Web MIDI 래퍼(MidiManager, MidiOutput — ChordOutput 구현, 패닉, 끊김 감지)

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
```

(c) Start 핸들러의 `const audioReady = output.start().catch(` → `const audioReady = toneOutput.start().catch(` (Tone 컨텍스트는 제스처 안에서 항상 켜 둔다. 현재 출력이 MIDI여도 나중에 신디로 돌아올 수 있게).

(d) `output.onStateChange((running) => {` → `toneOutput.onStateChange((running) => {` 로 바꾸고, 블록 안 조건을 `if (!running && output === toneOutput && (state === "READY" || state === "PLAYING"))` 로. `resumeAudioIfNeeded` 안의 `await output.resume(); if (output.isRunning())` → `await toneOutput.resume(); if (toneOutput.isRunning())`.

(e) describeError 접두어 목록에 `"DENIED: "` 추가:

```ts
  for (const prefix of ["UNSUPPORTED: ", "ASSET_MISSING: ", "TIMEOUT: ", "AUDIO: ", "CANCELLED: ", "DENIED: "]) {
```

(f) 출력 선택 로직 — `// ── 좌우 바꾸기` 블록 앞에 추가:

```ts
// ── 소리 출력 선택 ──────────────────────────────────────
function outputLabel(): string {
  return midiOut ? `MIDI: ${midiOut.name}` : "브라우저 신디";
}

function saveOutputPref(v: string): void {
  try {
    localStorage.setItem(CONFIG.midi.storageKey, v);
  } catch {
    /* 무시 */
  }
}

function renderOutputOptions(): void {
  outputSelect.innerHTML = "";
  const add = (value: string, text: string, disabled = false): void => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    o.disabled = disabled;
    outputSelect.appendChild(o);
  };
  add("tone", "출력: 브라우저 신디");
  if (!isWebMidiSupported()) {
    add("midi-unsupported", "MIDI 미지원 (Chrome 필요)", true);
  } else if (!midi.ready) {
    add("midi-request", "MIDI 장치 찾기…");
  } else {
    const ports = midi.outputs();
    if (ports.length === 0) add("midi-none", "MIDI 포트 없음 (IAC 드라이버를 켜세요)", true);
    for (const p of ports) add(`midi:${p.id}`, `MIDI: ${p.name}`);
  }
  const wanted = midiOut ? `midi:${midiOut.portId}` : "tone";
  outputSelect.value = Array.from(outputSelect.options).some((o) => o.value === wanted) ? wanted : "tone";
}

function switchToTone(reason?: string): void {
  silence();
  if (midiOut) {
    midiOut.dispose();
    midiOut = null;
  }
  output = toneOutput;
  void toneOutput.start().catch(() => {});
  saveOutputPref("tone");
  renderOutputOptions();
  showNotice(reason ? `${reason} → 브라우저 신디로 전환` : "출력: 브라우저 신디", reason ? 6000 : 2500);
}

function onMidiFatal(reason: string): void {
  switchToTone(reason);
}

async function switchToMidi(id: string): Promise<void> {
  const port = midi.getOutput(id);
  if (!port) {
    showNotice("선택한 MIDI 포트를 찾지 못했습니다", 4000);
    renderOutputOptions();
    return;
  }
  const next = new MidiOutput(port, onMidiFatal);
  try {
    await next.start();
  } catch (e) {
    showNotice(describeError(e), 6000);
    renderOutputOptions();
    return;
  }
  silence(); // 이전 출력의 음을 놓는다
  if (midiOut) midiOut.dispose();
  midiOut = next;
  output = next;
  saveOutputPref(`midi:${next.name}`);
  renderOutputOptions();
  showNotice(`MIDI 출력: ${next.name}`, 3000);
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
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(CONFIG.midi.storageKey);
  } catch {
    saved = null;
  }
  if (!saved || !saved.startsWith("midi:") || !isWebMidiSupported()) return;
  const name = saved.slice(5);
  try {
    await midi.request();
  } catch {
    showNotice(`저장된 MIDI 출력 '${name}'을 복원하지 못해 브라우저 신디로 시작합니다`, 6000);
    renderOutputOptions();
    return;
  }
  const found = midi.findByName(name);
  renderOutputOptions();
  if (found) await switchToMidi(found.id);
  else showNotice(`저장된 MIDI 포트 '${name}'을 찾지 못해 브라우저 신디로 시작합니다`, 6000);
}

outputSelect.addEventListener("change", () => {
  const v = outputSelect.value;
  if (v === "tone") switchToTone();
  else if (v === "midi-request") void requestMidiAndPick();
  else if (v.startsWith("midi:")) void switchToMidi(v.slice(5));
});
midi.onChange(() => renderOutputOptions());
```

(g) 패닉 지점:
- Reset 핸들러: `silence();` 다음 줄에 `midiOut?.panic();`
- `enterError`: `silence();` 다음 줄에 `midiOut?.panic();`
- `visibilitychange`: `if (document.hidden) silence();` → `if (document.hidden) { silence(); midiOut?.panic(); }`
- 그 아래에 추가:

```ts
window.addEventListener("pagehide", () => {
  silence();
  midiOut?.panic();
});
```

(h) `draw()`의 Scene에 `outputName: outputLabel(),` 추가(`delegate` 줄 아래).

(i) 부팅 블록 `loadSwap();` 다음에:

```ts
renderOutputOptions();
void restoreOutputPref();
```

- [ ] **Step 4: 타입 검사·전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc 출력 없음, 전부 PASS.

- [ ] **Step 5: 가짜 MIDI로 브라우저 확인 (Playwright, 헤드리스)**

페이지를 연 뒤 `page.evaluate`로 가짜 `navigator.requestMIDIAccess`를 심고 상자 동작을 확인한다:

```js
// 가짜 포트: 보낸 메시지를 window.__midiLog에 쌓는다
window.__midiLog = [];
const port = { id: "fake-1", name: "IAC 드라이버 버스 1", state: "connected", connection: "closed", type: "output",
  onstatechange: null, open: async () => port, close: async () => port, send: (m) => window.__midiLog.push(Array.from(m)) };
const outputs = { forEach: (cb) => cb(port, port.id, outputs) };
navigator.requestMIDIAccess = async () => ({ outputs, inputs: { forEach() {} }, onstatechange: null, sysexEnabled: false });
```

확인 항목(Expected):
1. 부팅 직후 상자 항목이 `tone`, `midi-request` 두 개.
2. 상자를 `midi-request`로 바꾸고 change 이벤트 → 300 ms 뒤 상자 값이 `midi:fake-1`, localStorage `hcw.output.v1` = `midi:IAC 드라이버 버스 1`, 상단 알림 "MIDI 출력: IAC 드라이버 버스 1".
3. Reset 클릭 → `__midiLog` 끝에 `[176,123,0]`, `[176,120,0]`.
4. 상자를 `tone`으로 → dispose 패닉으로 다시 `[176,123,0]`,`[176,120,0]`가 추가되고 localStorage는 `tone`.
5. 새로고침 후 저장값이 `midi:…`이면(2번 뒤 바로 새로고침) 가짜를 다시 심기 전에는 복원이 실패해 "복원하지 못해 브라우저 신디로 시작" 알림이 뜬다(실제 Chrome에서는 권한이 기억되어 자동 복원).

- [ ] **Step 6: Commit**

```bash
git add index.html src/overlay.ts src/main.ts
git commit -m "feat: 출력 선택 상자(브라우저 신디/MIDI 포트), 전환·복원·패닉 안전장치

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 문서·QA 인프라 갱신

**Files:**
- Modify: `README.md`, `.claude/hooks/check-impact.sh`, `.claude/skills/music-debugging/references/symptom-map.md`, `.claude/skills/music-verifier/references/impact-matrix.md`

- [ ] **Step 1: README — "GarageBand로 연주하기" 절 추가** (`## 검증` 앞에)

```markdown
## GarageBand로 연주하기 (MIDI 출력)
1. **IAC 드라이버 켜기**: Audio MIDI 설정 앱(응용 프로그램 → 유틸리티) → 메뉴 윈도우 → MIDI 스튜디오 표시 → "IAC 드라이버" 더블클릭 → "장치가 온라인 상태" 체크. 포트 목록에 "버스 1"이 있으면 됩니다.
2. **GarageBand**: 새 프로젝트 → 소프트웨어 악기 트랙 → 악기 선택. 처음에는 스트링/패드 계열이나 Smart Controls에서 아르페지에이터를 켠 신스를 권합니다. GarageBand는 연결된 모든 MIDI 입력을 **선택된 트랙** 하나로 받으므로 그 트랙을 선택해 두세요.
3. **웹앱**: 하단 "출력" 상자에서 "MIDI 장치 찾기…" → Chrome 권한 허용 → IAC 버스가 하나면 자동 선택됩니다. 좌상단 정보 줄에 `출력 MIDI: IAC 드라이버 버스 1`이 보이면 연결된 것입니다.
4. 손 펼침은 CC11(익스프레션)으로 나갑니다. 다른 파라미터에 걸고 싶으면 GarageBand Smart Controls의 학습(Learn) 기능으로 CC11을 원하는 노브에 배우게 하세요.

문제 해결
- 소리가 안 남: GarageBand에서 악기 트랙이 **선택**되어 있는지, 트랙 헤더의 MIDI 입력 표시가 손을 움직일 때 깜빡이는지, IAC가 온라인인지 확인. Chrome 주소창 왼쪽 아이콘에서 MIDI 권한 상태도 확인.
- 음이 걸려서 계속 울림: 웹앱 Reset을 누르면 모든 음 끄기(CC123)와 모든 소리 끄기(CC120)가 나갑니다. 탭을 닫거나 숨겨도 자동으로 나갑니다.
- 포트가 뽑히거나 꺼지면 자동으로 브라우저 신디로 돌아가며 상단에 안내가 뜹니다.
```

`## 2차 계획` 절을 다음으로 교체:

```markdown
## 다음 계획
- 스트럼 벨로시티(손을 펴는 속도로 세기), 곡별 코드 팔레트 프리셋, 왼손 기능, One Euro Filter
```

- [ ] **Step 2: 영향 범위 훅에 분기 추가** (`src/camera.ts)` 분기 아래)

```bash
  src/midi.ts|src/midi-messages.ts) echo "[impact] MIDI 출력 → tests/midi-messages.test.ts 실행, 가짜 MIDI 브라우저 확인(전환·Reset 패닉·복원), GarageBand 실측(걸린 음 없는지)" ;;
```

- [ ] **Step 3: symptom-map 행 추가**

```markdown
| MIDI 포트가 상자에 안 보임 | 권한 거부 / IAC 오프라인 / Safari | 상단 알림 문구, Audio MIDI 설정 | 주소창 MIDI 권한 허용; IAC '장치가 온라인 상태'; Chrome 사용 |
| GarageBand에 소리 안 남(상자는 MIDI) | 트랙 미선택 / 다른 입력 장치 설정 / 채널 | GarageBand 트랙 헤더 MIDI 표시등 | 악기 트랙 선택; 환경설정 → 오디오/MIDI 입력 확인 |
| 음이 걸려 계속 울림 | 패닉 미전송(강제 종료 등) | — | Reset 클릭(CC123·120 전송); GarageBand 트랙 음소거 후 해제 |
| MIDI 전환 뒤 브라우저 소리도 같이 남 | 출력 교체 전 stop 누락 | main.ts switchToMidi의 silence() | silence() 호출 순서 확인 |
```

- [ ] **Step 4: impact-matrix 행 추가**

```markdown
| src/midi.ts, src/midi-messages.ts | MIDI 출력, 패닉 | tests/midi-messages.test.ts | 가짜 MIDI 브라우저 확인, GarageBand 실측 |
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
2. 웹앱 출력 상자 → "MIDI 장치 찾기…" → 허용 → 자동 선택 알림.
3. 손 1시 → 스트링이 Em6로 울림, 손을 더 펴면 소리가 커짐(CC11), 3시로 옮기면 A9로 전환, 주먹 → 멈춤.
4. Reset → 즉시 멈춤. 탭을 닫아도 음이 남지 않음.
5. 아르페지에이터를 켠 신스 트랙으로 바꿔 손을 한 칸에 두면 패턴이 흐르고 칸을 옮기면 코드만 바뀜.

- [ ] **Step 2: 결과 기록과 푸시**
문제가 있으면 symptom-map대로 원인을 찾고 고친 뒤, `npm run verify` FAIL 0 확인 후 main에 커밋·푸시.

---

## Self-Review

- **Spec coverage:** 3-1 메시지(Task 1), 3-2 CC11 변환·중복 억제(Task 1·2), 3-3 선택·전환·복원·statechange(Task 3), 3-4 패닉 지점 6곳(Task 2·3: 전환 dispose, Reset, enterError, pagehide, hidden, 끊김 fail), 3-5 끊김·전송 실패(Task 2), 4장 화면(Task 3), 5장 오류 표(Task 2·3 메시지), 6장 테스트(Task 1 Vitest, Task 3 Playwright, Task 5 실측), 7장 GarageBand(Task 4).
- **Placeholder scan:** 없음.
- **Type consistency:** `MidiOutput.name/portId` ↔ main.ts `renderOutputOptions`·`saveOutputPref`. `ChordOutput` 7개 메서드 모두 구현. `Scene.outputName` ↔ `draw()`. `isWebMidiSupported` import ↔ 사용. `describeError`가 `DENIED:`·`UNSUPPORTED:` 접두어를 벗긴다.
