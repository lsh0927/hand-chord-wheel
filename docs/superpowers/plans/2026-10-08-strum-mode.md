# 왼손 스트럼 모드(5차) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면 한쪽의 가상 줄 6개를 왼손 검지로 쓸면 오른손이 잡은 코드의 6음 보이싱이 줄별로 울린다(스트럼·아르페지오·업 스트로크·뮤트). 패드 모드(기존)는 그대로.

**Architecture:** 순수 모듈 셋(`strum.ts` 교차 감지, `chords.ts` voicing, `hands.ts` 두 손 선택) + 출력 인터페이스 확장(`pluck`) + main.ts 통합(오른손 `soundChord`, 왼손 `processLeftHand`). 소리는 Tone PluckSynth 6줄 또는 MIDI 예약 전송.

**Tech Stack:** 기존 그대로(tone 15.1.22, tonal 6.4.3, tasks-vision 1.0.1). 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-10-08-strum-design.md`

**규칙(공통):** 1차 계획과 동일. 커밋 메시지 끝에 Co-Authored-By·Claude-Session.

---

### Task 1: 상수 + 두 손 선택 (TDD)

**Files:** `src/config.ts`, `src/hands.ts`, `src/tracker.ts`, `tests/hands.test.ts`

- [ ] **Step 1: config 추가** (`face: {` 위)

```ts
  play: {
    defaultMode: "strum", // "strum" | "pad"
    storageKey: "hcw.play.v1",
  },
  strum: {
    strings: 6,
    pointLandmark: 8, // 왼손 검지 끝 = 피크
    topY: 0.36, // 가장 낮은 줄(위)의 높이(영상 높이 비율)
    gapY: 0.055, // 줄 간격
    bandLeft: [0.06, 0.42] as const, // 패널이 오른쪽 아래일 때 줄 대역(영상 폭 비율)
    bandRight: [0.58, 0.94] as const, // 패널이 왼쪽 아래일 때
    bandCenter: [0.04, 0.27] as const, // 패널이 가운데일 때
    minSpeed: 0.2, // 영상 높이/초. 이보다 느린 통과는 떨림으로 무시
    softSpeed: 0.4, // 이 속도에서 최소 세기
    hardSpeed: 2.5, // 이 속도 이상이면 최대 세기
    minVelocity: 0.35,
    refractoryMs: 60, // 같은 줄 재타격 최소 간격
    muteBelowPercent: 20, // 왼손 펼침 % 미만이면 뮤트
    muteVelocityScale: 0.6,
    muteHoldMs: 90, // 뮤트 음 길이
    flashMs: 150, // 타격 뒤 줄 번쩍임
    hintAfterMs: 3000, // 코드를 잡고도 왼손이 없으면 안내
    hintRepeatMs: 10000,
  },
  pluck: { attackNoise: 1, dampening: 4000, resonance: 0.97, release: 0.15 },
```

- [ ] **Step 2: 테스트 추가 (RED)** — tests/hands.test.ts 끝에

```ts
import { selectBothHands } from "../src/hands";

describe("selectBothHands", () => {
  const two = { landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Left", 0.94), cat("Right", 0.96)] };
  it("오른손과 왼손을 각각 고르고, 고른 왼손은 회색 점 목록에 없다", () => {
    const r = selectBothHands(two, { swap: false, minScore: 0.7, prevRight: null, prevLeft: null });
    expect(r.right.chosen?.palm.x).toBeCloseTo(0.8, 6);
    expect(r.left?.palm.x).toBeCloseTo(0.2, 6);
    expect(r.right.otherPalms).toEqual([]);
  });
  it("swap이면 라벨이 반대로 배정된다", () => {
    const r = selectBothHands(two, { swap: true, minScore: 0.7, prevRight: null, prevLeft: null });
    expect(r.right.chosen?.palm.x).toBeCloseTo(0.2, 6);
    expect(r.left?.palm.x).toBeCloseTo(0.8, 6);
  });
  it("왼손 점수가 낮으면 왼손은 null이고 회색 점으로 남는다", () => {
    const r = selectBothHands({ landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Left", 0.5), cat("Right", 0.96)] }, { swap: false, minScore: 0.7, prevRight: null, prevLeft: null });
    expect(r.left).toBeNull();
    expect(r.right.otherPalms.length).toBe(1);
  });
});
```
(`lm`, `cat`, `OPTS` 헬퍼는 파일 상단에 이미 있음 — 그대로 사용. import는 상단 import 줄에 합친다.)

- [ ] **Step 3: 실패 확인** `npx vitest run tests/hands.test.ts`

- [ ] **Step 4: hands.ts 구현** — `selectRightHand`를 `selectHand`로 일반화하고 래퍼 유지

```ts
export interface BothHands {
  right: HandSelection;
  /** 스트럼용 왼손(라벨 반대쪽). 없으면 null */
  left: ChosenHand | null;
}
export interface BothOptions {
  swap: boolean;
  minScore: number;
  prevRight: Point | null;
  prevLeft: Point | null;
}

/** 라벨 wanted("Right"/"Left")이고 점수·화면 안 조건을 만족하는 손을 고른다. 후보가 여럿이면 직전 위치에 가까운 손 */
export function selectHand(result: HandsLike, wanted: "Right" | "Left", opts: { minScore: number; prevPalm: Point | null }): HandSelection {
  /* 기존 selectRightHand 본문을 그대로 옮기되 `const wanted = …` 줄만 제거 */
}

export function selectRightHand(result: HandsLike, opts: SelectOptions): HandSelection {
  return selectHand(result, opts.swap ? "Left" : "Right", { minScore: opts.minScore, prevPalm: opts.prevPalm });
}

/** 오른손(코드)과 왼손(스트럼)을 한 번에. 고른 왼손은 회색 점에서 뺀다 */
export function selectBothHands(result: HandsLike, opts: BothOptions): BothHands {
  const right = selectHand(result, opts.swap ? "Left" : "Right", { minScore: opts.minScore, prevPalm: opts.prevRight });
  const left = selectHand(result, opts.swap ? "Right" : "Left", { minScore: opts.minScore, prevPalm: opts.prevLeft }).chosen;
  const otherPalms = left ? right.otherPalms.filter((p) => p.x !== left.palm.x || p.y !== left.palm.y) : right.otherPalms;
  return { right: { ...right, otherPalms }, left };
}
```

- [ ] **Step 5: tracker.detect 변경**

```ts
  detect(video: HTMLVideoElement, nowMs: number, opts: { swap: boolean; prevRight: Point | null; prevLeft: Point | null }): BothHands {
    if (!this.landmarker) return { right: EMPTY_SELECTION, left: null };
    const ts = Math.max(Math.floor(nowMs), this.lastTs + 1);
    this.lastTs = ts;
    const result = this.landmarker.detectForVideo(video, ts);
    return selectBothHands(result, { swap: opts.swap, minScore: CONFIG.tracker.minHandednessScore, prevRight: opts.prevRight, prevLeft: opts.prevLeft });
  }
```
import를 `selectBothHands, EMPTY_SELECTION, type BothHands`로. main.ts는 Task 5에서 맞춘다(그 전까지 tsc 오류는 정상).

- [ ] **Step 6: hands 테스트 통과 확인 → Commit** `feat: 두 손 선택(selectBothHands) + 스트럼 상수`

---

### Task 2: 스트럼 감지기 (TDD)

**Files:** `src/strum.ts`, `tests/strum.test.ts`

- [ ] **Step 1: 테스트 (RED)**

```ts
import { describe, it, expect } from "vitest";
import { StrumDetector, stringLines, velocityFromSpeed } from "../src/strum";

const H = 720;
const LINES = stringLines(H, 0.36, 0.055, 6); // 259.2, 298.8, 338.4, 378, 417.6, 457.2
const BAND = { x0: 0, x1: 500 };
const det = () => new StrumDetector(0.2, 60);

describe("stringLines", () => {
  it("6줄을 위에서 아래로 균등 배치한다", () => {
    expect(LINES.length).toBe(6);
    expect(LINES[0]).toBeCloseTo(259.2, 6);
    expect(LINES[5]).toBeCloseTo(457.2, 6);
  });
});

describe("StrumDetector", () => {
  it("첫 프레임은 타격이 없고, 한 줄을 아래로 지나면 down 1건", () => {
    const d = det();
    expect(d.update({ x: 100, y: 250 }, 0, LINES, BAND, H)).toEqual([]);
    const ev = d.update({ x: 100, y: 270 }, 33, LINES, BAND, H);
    expect(ev.length).toBe(1);
    expect(ev[0]).toMatchObject({ string: 0, dir: "down" });
  });
  it("위로 지나면 up", () => {
    const d = det();
    d.update({ x: 100, y: 270 }, 0, LINES, BAND, H);
    const ev = d.update({ x: 100, y: 250 }, 33, LINES, BAND, H);
    expect(ev[0]).toMatchObject({ string: 0, dir: "up" });
  });
  it("한 프레임에 3줄을 지나면 보간 시각 순으로 돌려준다", () => {
    const d = det();
    d.update({ x: 100, y: 250 }, 0, LINES, BAND, H);
    const ev = d.update({ x: 100, y: 350 }, 40, LINES, BAND, H); // 259.2, 298.8, 338.4 통과
    expect(ev.map((e) => e.string)).toEqual([0, 1, 2]);
    expect(ev[0]!.tMs).toBeCloseTo(40 * (259.2 - 250) / 100, 3);
    expect(ev[1]!.tMs).toBeCloseTo(40 * (298.8 - 250) / 100, 3);
    expect(ev[2]!.tMs).toBeGreaterThan(ev[1]!.tMs);
  });
  it("교차 지점 x가 대역 밖이면 무시한다", () => {
    const d = det();
    d.update({ x: 600, y: 250 }, 0, LINES, BAND, H);
    expect(d.update({ x: 600, y: 270 }, 33, LINES, BAND, H)).toEqual([]);
  });
  it("줄 위에 멈춘 뒤 떠나도 두 번 세지 않는다", () => {
    const d = det();
    d.update({ x: 100, y: 250 }, 0, LINES, BAND, H);
    expect(d.update({ x: 100, y: 259.2 }, 33, LINES, BAND, H).length).toBe(1); // 닿는 순간 1회
    expect(d.update({ x: 100, y: 275 }, 66, LINES, BAND, H)).toEqual([]); // 줄 위에서 출발 → 없음
  });
  it("속도가 0.2 영상높이/초 미만이면 떨림으로 무시", () => {
    const d = det();
    d.update({ x: 100, y: 258 }, 0, LINES, BAND, H);
    expect(d.update({ x: 100, y: 260 }, 33, LINES, BAND, H)).toEqual([]); // 2px/33ms = 0.084 H/s
  });
  it("같은 줄은 60 ms 안에 다시 치지 않는다", () => {
    const d = det();
    d.update({ x: 100, y: 250 }, 0, LINES, BAND, H);
    expect(d.update({ x: 100, y: 270 }, 20, LINES, BAND, H).length).toBe(1);
    expect(d.update({ x: 100, y: 250 }, 40, LINES, BAND, H).length).toBe(0); // 20 ms 뒤 되돌아옴
    expect(d.update({ x: 100, y: 270 }, 120, LINES, BAND, H).length).toBe(1);
  });
  it("손이 사라지면(null) 직전 위치를 지워 재등장 첫 프레임에 타격이 없다", () => {
    const d = det();
    d.update({ x: 100, y: 250 }, 0, LINES, BAND, H);
    d.update(null, 33, LINES, BAND, H);
    expect(d.update({ x: 100, y: 400 }, 66, LINES, BAND, H)).toEqual([]);
  });
  it("속도는 영상 높이/초 단위", () => {
    const d = det();
    d.update({ x: 100, y: 250 }, 0, LINES, BAND, H);
    const ev = d.update({ x: 100, y: 322 }, 100, LINES, BAND, H); // 72px/0.1s = 720px/s = 1 H/s
    expect(ev[0]!.speed).toBeCloseTo(1, 6);
  });
});

describe("velocityFromSpeed", () => {
  it("soft 이하 최소, hard 이상 1, 중간은 선형", () => {
    expect(velocityFromSpeed(0.1, 0.4, 2.5, 0.35)).toBeCloseTo(0.35, 6);
    expect(velocityFromSpeed(3, 0.4, 2.5, 0.35)).toBeCloseTo(1, 6);
    expect(velocityFromSpeed(1.45, 0.4, 2.5, 0.35)).toBeCloseTo(0.675, 6);
    expect(velocityFromSpeed(Number.NaN, 0.4, 2.5, 0.35)).toBeCloseTo(0.35, 6);
  });
});
```

- [ ] **Step 2: 실패 확인** → 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// 왼손 피크 점이 가상 줄을 가로지르는 순간을 찾는다. 브라우저 의존 없음.
import type { Point } from "./mapping";

export interface StrumEvent {
  string: number; // 0 = 가장 낮은 줄(위)
  dir: "down" | "up";
  tMs: number; // 교차 시각(선형 보간)
  speed: number; // 영상 높이/초
}
export interface StrumBand {
  x0: number;
  x1: number;
}

/** 줄 y좌표(픽셀). 0번이 위(가장 낮은 음) */
export function stringLines(H: number, topY: number, gapY: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => (topY + gapY * i) * H);
}

export class StrumDetector {
  private prev: { x: number; y: number; t: number } | null = null;
  private lastStrike: number[] = [];
  constructor(
    private readonly minSpeed: number,
    private readonly refractoryMs: number,
  ) {}

  /** 점이 없으면(null) 직전 위치를 지운다 — 재등장 때 옛 위치에서 줄을 지난 것으로 오인하지 않게 */
  update(p: Point | null, now: number, lines: readonly number[], band: StrumBand, H: number): StrumEvent[] {
    if (!p) {
      this.prev = null;
      return [];
    }
    const prev = this.prev;
    this.prev = { x: p.x, y: p.y, t: now };
    if (!prev || now <= prev.t) return [];
    const dt = (now - prev.t) / 1000;
    const speed = Math.abs(p.y - prev.y) / H / dt;
    if (speed < this.minSpeed) return [];
    const out: StrumEvent[] = [];
    for (let i = 0; i < lines.length; i++) {
      const ly = lines[i] ?? 0;
      const a = prev.y - ly;
      const b = p.y - ly;
      if (a === 0) continue; // 직전 프레임에 줄 위에 있었으면 그때 이미 쳤다
      if (!((a < 0 && b >= 0) || (a > 0 && b <= 0))) continue;
      const f = a / (a - b); // 선분 위 교차 비율 0~1
      const x = prev.x + (p.x - prev.x) * f;
      if (x < band.x0 || x > band.x1) continue;
      const t = prev.t + (now - prev.t) * f;
      if (t - (this.lastStrike[i] ?? -Infinity) < this.refractoryMs) continue;
      this.lastStrike[i] = t;
      out.push({ string: i, dir: p.y > prev.y ? "down" : "up", tMs: t, speed });
    }
    out.sort((e1, e2) => e1.tMs - e2.tMs);
    return out;
  }

  reset(): void {
    this.prev = null;
    this.lastStrike = [];
  }
}

/** 속도(영상 높이/초) → 세기 0~1. soft 이하는 minVelocity, hard 이상은 1, 사이는 선형 */
export function velocityFromSpeed(speed: number, soft: number, hard: number, minVelocity: number): number {
  if (!Number.isFinite(speed)) return minVelocity;
  const t = Math.min(1, Math.max(0, (speed - soft) / (hard - soft)));
  return minVelocity + (1 - minVelocity) * t;
}
```

- [ ] **Step 4: 통과 → Commit** `feat: 스트럼 교차 감지기(StrumDetector) + 테스트`

---

### Task 3: 6음 보이싱 (TDD)

**Files:** `src/chords.ts`, `tests/chords.test.ts`

- [ ] **Step 1: 테스트 (RED)** — tests/chords.test.ts 끝에(import에 `voicing` 추가)

```ts
describe("voicing (기타식 6음)", () => {
  it("A → 개방현 A 코드와 같은 배치", () => {
    expect(voicing("A")).toEqual([45, 52, 57, 61, 64, 69]); // A2 E3 A3 C#4 E4 A4
  });
  it("B → 바레 B", () => {
    expect(voicing("B")).toEqual([47, 54, 59, 63, 66, 71]);
  });
  it("Em6 → E2 B2 E3 G3 C#4 B4", () => {
    expect(voicing("Em6")).toEqual([40, 47, 52, 55, 61, 71]);
  });
  it("A5 파워코드는 근음·5도만 쌓는다", () => {
    expect(voicing("A5")).toEqual([45, 52, 57, 64, 69, 76]);
  });
  it("C는 근음이 E2 아래라 C3부터", () => {
    expect(voicing("C")).toEqual([48, 55, 60, 64, 67, 72]);
  });
  it("잘못된 기호는 빈 배열, count는 음 개수", () => {
    expect(voicing("H#")).toEqual([]);
    expect(voicing("A", 4)).toEqual([45, 52, 57, 61]);
  });
});
```

- [ ] **Step 2: 실패 확인** → `voicing` 없음.

- [ ] **Step 3: 구현** (chords.ts, chordToMidi 아래)

```ts
/**
 * 기타식 보이싱: 근음을 lowest(E2=40) 이상에서 가장 가까운 음에 두고, 그 위로 [5도, 근음, 3도, 나머지…]를 순환하며
 * "직전 음보다 높은 가장 가까운 그 음"을 쌓아 count개를 만든다. A → A2 E3 A3 C#4 E4 A4(개방현 A와 동일).
 */
export function voicing(symbol: string, count = 6, lowest = 40): number[] {
  const c = Chord.get(symbol);
  if (c.empty || !c.tonic) return [];
  const pcs = c.notes.map((n) => Note.get(n).chroma).filter((x): x is number => typeof x === "number");
  const rootPc = Note.get(c.tonic).chroma;
  if (typeof rootPc !== "number" || pcs.length === 0) return [];
  const root = lowest + ((rootPc - (lowest % 12) + 12) % 12);
  const fifthPc = (rootPc + 7) % 12;
  const hasFifth = pcs.includes(fifthPc);
  const third = pcs.find((pc) => pc !== rootPc && pc !== fifthPc);
  const rest = pcs.filter((pc) => pc !== rootPc && pc !== fifthPc && pc !== third);
  const cycle = [hasFifth ? fifthPc : (third ?? rootPc), rootPc, ...(third !== undefined ? [third] : []), ...rest];
  const out = [root];
  for (let i = 0; out.length < count; i++) {
    const pc = cycle[i % cycle.length] ?? rootPc;
    const prev = out[out.length - 1] ?? root;
    let n = prev + ((pc - (prev % 12) + 12) % 12);
    if (n === prev) n += 12;
    out.push(n);
  }
  return out;
}
```

- [ ] **Step 4: 통과 → Commit** `feat: 코드 → 기타식 6음 보이싱`

---

### Task 4: 출력 — pluck (TDD는 MIDI만)

**Files:** `src/output.ts`, `src/audio.ts`, `src/midi.ts`, `tests/midi-output.test.ts`

- [ ] **Step 1: output.ts 인터페이스**

```ts
  /**
   * 줄 하나를 튕긴다(스트럼 모드). voice: 줄 번호(0~5), delayMs: 지금부터의 지연(≥0, 프레임 안 시차 보존용),
   * velocity: 0~1, holdMs: null이면 다음 타격·stop()까지 울림, 숫자면 그 뒤 끊는다(뮤트).
   */
  pluck(voice: number, midi: number, velocity: number, delayMs: number, holdMs: number | null): void;
```
`stop()` 주석을 "들고 있던 음과 울리는 줄을 모두 놓는다."로.

- [ ] **Step 2: 테스트 (RED)** — tests/midi-output.test.ts: fakePort의 `send`를 `(m: number[], at?: number) => { …; log.push([...m]); times.push(at); }`로 바꾸고 `times: (number | undefined)[]`를 반환에 추가. 끝에:

```ts
describe("MidiOutput.pluck", () => {
  it("Note On을 예약 전송하고, 뮤트는 holdMs 뒤 Note Off를 예약한다", async () => {
    const f = fakePort();
    const out = new MidiOutput(f.port, vi.fn());
    await out.start();
    out.pluck(2, 57, 0.5, 0, 90);
    expect(f.log).toEqual([[0x90 | CH, 57, 64]]);
    expect(typeof f.times[0]).toBe("number");
    expect(f.log.length).toBe(2);
    expect(f.log[1]).toEqual([0x80 | CH, 57, 0]);
    expect(f.times[1]! - f.times[0]!).toBeCloseTo(90, 6);
  });
  it("같은 줄을 다시 치면 이전 음 Note Off가 먼저 나가고, stop()이 울리는 줄을 모두 끈다", async () => {
    const f = fakePort();
    const out = new MidiOutput(f.port, vi.fn());
    await out.start();
    out.pluck(0, 40, 1, 0, null);
    out.pluck(0, 45, 1, 10, null);
    expect(f.log).toEqual([[0x90 | CH, 40, 127], [0x80 | CH, 40, 0], [0x90 | CH, 45, 127]]);
    expect(f.times[2]! - f.times[1]!).toBe(0); // 같은 타격 안
    f.log.length = 0;
    out.stop();
    expect(f.log).toEqual([[0x80 | CH, 45, 0]]);
  });
  it("세기는 벨로시티 1~127로", async () => {
    const f = fakePort();
    const out = new MidiOutput(f.port, vi.fn());
    await out.start();
    out.pluck(1, 52, 0.35, 0, null);
    out.pluck(2, 57, 0, 0, null);
    expect(f.log[0]![2]).toBe(44);
    expect(f.log[1]![2]).toBe(1);
  });
});
```
(0x90은 Note On, 0x80은 Note Off 상태 바이트. 기존 테스트가 `log` 형태에 의존하므로 `log`는 그대로 두고 `times`만 추가.)

- [ ] **Step 3: midi.ts 구현**

```ts
  private stringNotes: (number | undefined)[] = []; // 줄별 울리는 음(스트럼)

  pluck(voice: number, midi: number, velocity: number, delayMs: number, holdMs: number | null): void {
    if (this.disposed) return;
    const ch = CONFIG.midi.channel;
    const at = performance.now() + Math.max(0, delayMs);
    const msgs: Array<[MidiMessage, number]> = [];
    const prev = this.stringNotes[voice];
    if (prev !== undefined) msgs.push([noteOff(ch, prev), at]);
    msgs.push([noteOn(ch, midi, Math.round(Math.min(1, Math.max(0, velocity)) * 127)), at]);
    if (holdMs !== null) {
      msgs.push([noteOff(ch, midi), at + holdMs]);
      this.stringNotes[voice] = undefined;
    } else {
      this.stringNotes[voice] = midi;
    }
    this.sendAllAt(msgs);
  }

  /** 패드 음 + 울리는 줄 전부 */
  private ringing(): number[] {
    return [...this.held, ...this.stringNotes.filter((n): n is number => n !== undefined)];
  }
```
`stop()`: `const notes = this.ringing(); if (notes.length === 0) return; this.held = []; this.stringNotes = []; this.sendAll(notes.map((n) => noteOff(ch, n)));`
`panic()`·`dispose()`·`fail()`의 `panicMessages(this.held, …)` → `panicMessages(this.ringing(), …)` 뒤 `this.stringNotes = []`도 비운다.
`sendAllAt(msgs: Array<[MidiMessage, number]>)`: sendAll과 같되 `this.port.send(m, at)`. import에 `noteOn` 추가.

- [ ] **Step 4: audio.ts 구현**

```ts
  private strings: { synth: Tone.PluckSynth; gain: Tone.Gain }[] = [];
  // start()에서 synth 생성 뒤:
    const p = CONFIG.pluck;
    this.strings = Array.from({ length: CONFIG.strum.strings }, () => {
      const gain = new Tone.Gain(0).connect(this.gain!);
      const synth = new Tone.PluckSynth({ attackNoise: p.attackNoise, dampening: p.dampening, resonance: p.resonance, release: p.release }).connect(gain);
      return { synth, gain };
    });

  pluck(voice: number, midi: number, velocity: number, delayMs: number, holdMs: number | null): void {
    const s = this.strings[voice];
    if (!s) return;
    const t = Tone.now() + Math.max(0, delayMs) / 1000;
    s.gain.gain.setValueAtTime(Math.min(1, Math.max(0, velocity)), t);
    s.synth.triggerAttack(Tone.Frequency(midi, "midi").toFrequency(), t);
    if (holdMs !== null) s.synth.triggerRelease(t + holdMs / 1000);
  }

  stop(): void {
    if (this.synth && this.heldHz.length > 0) this.synth.triggerRelease(this.heldHz);
    this.heldHz = [];
    for (const s of this.strings) s.synth.triggerRelease();
  }
```
(`this.gain!` 대신 지역 변수 `const master = this.gain`로 받아 쓴다.)

- [ ] **Step 5: `npx vitest run tests/midi-output.test.ts` 통과, tsc(main.ts 오류는 Task 5 전까지 허용) → Commit** `feat: 출력 pluck — Tone PluckSynth 6줄, MIDI 예약 전송`

---

### Task 5: 화면·통합

**Files:** `index.html`, `src/overlay.ts`, `src/main.ts`

- [ ] **Step 1: index.html** — `#mode` 상자 앞에
```html
          <select id="play" class="sel" aria-label="연주 방식">
            <option value="strum">연주: 스트럼</option>
            <option value="pad">연주: 코드 패드</option>
          </select>
```

- [ ] **Step 2: overlay.ts**
- `Scene`에 추가: `leftHand: HandView | null; pick: Point | null; strings: StringsView | null;` 와
```ts
export interface StringsView {
  x0: number;
  x1: number;
  ys: number[]; // 위(낮은 줄)부터
  flash: number[]; // 줄별 0~1(타격 직후 1)
}
```
- 유령 손 블록을 `drawGhostHand(ctx, hand, connections, rgb)` 함수로 뽑고 오른손은 `"255,255,255"`, 왼손은 `"170,255,190"`으로 호출. 왼손은 `s.leftHand`가 있을 때 관절선·점만(손끝 큰 점·손바닥 파란 점 없음).
- 줄: 손 그리기 **전에**
```ts
  if (s.strings) {
    const v = s.strings;
    ctx.save();
    ctx.lineCap = "round";
    v.ys.forEach((y, i) => {
      const f = v.flash[i] ?? 0;
      ctx.strokeStyle = `rgba(255,255,255,${(0.35 + 0.6 * f).toFixed(3)})`;
      ctx.lineWidth = 4 - i * 0.4 + f * 2;
      ctx.shadowColor = f > 0 ? `rgba(${BLUE},${f.toFixed(3)})` : "transparent";
      ctx.shadowBlur = f > 0 ? 12 : 0;
      ctx.beginPath();
      ctx.moveTo(v.x0, y);
      ctx.lineTo(v.x1, y);
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.font = `700 ${Math.round(H * 0.022)}px system-ui, sans-serif`;
    ctx.fillText("STRUM · L", v.x0, (v.ys[0] ?? 0) - H * 0.015);
    ctx.restore();
  }
```
- 피크 점(왼손 유령 손 뒤): `if (s.pick) { ctx.beginPath(); ctx.arc(s.pick.x, s.pick.y, 7, 0, Math.PI * 2); ctx.fillStyle = \`rgba(${BLUE},0.95)\`; ctx.fill(); }`

- [ ] **Step 3: main.ts**
(a) import: `voicing` (chords), `StrumDetector, stringLines, velocityFromSpeed, type StrumBand` (strum), `type ChosenHand` (hands), `type StringsView` (overlay).
(b) 상태(`let selectMode` 옆):
```ts
type PlayMode = "strum" | "pad";
const playSelect = $<HTMLSelectElement>("play");
let playMode: PlayMode = CONFIG.play.defaultMode;
const strum = new StrumDetector(CONFIG.strum.minSpeed, CONFIG.strum.refractoryMs);
const leftEmaRatio = new Ema(CONFIG.smoothing.alpha);
let prevLeftPalmNorm: Point | null = null;
let leftView: HandView | null = null;
let pickPoint: Point | null = null;
let leftOpenPercent = 100;
let voicingNotes: number[] | null = null; // 스트럼 모드에서 오른손이 잡은 코드의 6음
let voicingSector: number | null = null;
const strikeAt: number[] = []; // 줄별 마지막 타격 시각(번쩍임)
let strumHintSince: number | null = null;
let lastStrumHint = -Infinity;
let strumDebug = "";
```
(c) 연주 방식 상자(applyMode 옆):
```ts
function isPlayMode(v: string): v is PlayMode {
  return v === "strum" || v === "pad";
}
function applyPlayMode(m: PlayMode): void {
  playMode = m;
  playSelect.value = m;
  strum.reset();
  strikeAt.length = 0;
  silence();
}
function loadPlayMode(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(CONFIG.play.storageKey);
  } catch {
    saved = null;
  }
  applyPlayMode(saved && isPlayMode(saved) ? saved : CONFIG.play.defaultMode);
}
playSelect.addEventListener("change", () => {
  const v = playSelect.value;
  if (!isPlayMode(v)) return;
  applyPlayMode(v);
  try {
    localStorage.setItem(CONFIG.play.storageKey, v);
  } catch {
    /* 무시 */
  }
});
```
(d) `silence()`에 `voicingNotes = null; voicingSector = null;` 추가(소리를 멈추는 모든 경로에서 보이싱도 비운다 — 주먹·쉼·Reset·코드 변경 직전). `resetHandState()`에 `leftView = null; pickPoint = null; prevLeftPalmNorm = null; strum.reset(); leftEmaRatio.reset(); strikeAt.length = 0;` 추가.
(e) 오른손 코드 확정 지점 통일 — 휠 경로와 손가락 경로의
```ts
  if (state !== "PLAYING" || sector !== currentSector) {
    const out = output;
    out.play(midi);
    if (output !== out) { silence(); return; }
    currentSector = sector;
    setState("PLAYING");
  }
```
를 `if (!soundChord(sector, midi)) return;`로 바꾸고 함수 추가:
```ts
/** 코드가 정해졌을 때. 패드 모드는 바로 울리고, 스트럼 모드는 보이싱만 바꾼다(소리는 왼손이 낸다). 실패(출력 교체)면 false */
function soundChord(sector: number, midi: readonly number[]): boolean {
  if (playMode === "strum") {
    if (sector !== voicingSector) {
      silence(); // 프렛 손이 바뀌면 울리던 줄은 멎는다(실제 기타와 같음). silence()가 보이싱을 비우므로 그 뒤에 넣는다
      voicingSector = sector;
      voicingNotes = voicing(palette[sector] ?? "", CONFIG.strum.strings);
    }
    return true;
  }
  if (state !== "PLAYING" || sector !== currentSector) {
    const out = output;
    out.play(midi);
    if (output !== out) {
      silence();
      return false;
    }
    currentSector = sector;
    setState("PLAYING");
  }
  return true;
}
```
(f) processFrame: `const both = tracker.detect(video, now, { swap, prevRight: prevPalmNorm, prevLeft: prevLeftPalmNorm }); const sel = both.right;` 그리고 `otherPalms = [...sel.otherPalms, ...(playMode !== "strum" && both.left ? [both.left.palm] : [])].map(...)`. 기존 오른손 처리 본문(안내문부터 끝까지)을 `processRightHand(sel, now, W, H, center)`로 옮기고, processFrame은 `processRightHand(...); processLeftHand(both.left, now, W, H);` 두 줄로 끝낸다(`return`들은 함수 안에서 그대로 동작).
(g) 왼손:
```ts
function strumBand(W: number): StrumBand {
  const b = wheelAnchor === "bottom-left" ? CONFIG.strum.bandRight : wheelAnchor === "center" ? CONFIG.strum.bandCenter : CONFIG.strum.bandLeft;
  return { x0: b[0] * W, x1: b[1] * W };
}
/** 스트럼 모드: 왼손 검지 끝이 줄을 지나면 그 줄의 음을 튕긴다 */
function processLeftHand(left: ChosenHand | null, now: number, W: number, H: number): void {
  if (playMode !== "strum" || !left) {
    leftView = null;
    pickPoint = null;
    prevLeftPalmNorm = null;
    strum.update(null, now, [], { x0: 0, x1: 0 }, H);
    leftEmaRatio.reset();
    if (playMode === "strum") strumHint(now, false);
    return;
  }
  prevLeftPalmNorm = left.palm;
  const pts: Point[] = left.landmarks.map((l) => ({ x: (1 - l.x) * W, y: l.y * H }));
  const palm = palmCenter(pts);
  leftView = { palm, tips: TIP_IDS.map((i) => pts[i] ?? palm), all: pts };
  leftOpenPercent = opennessPercent(leftEmaRatio.next(opennessRatio(pts)), CONFIG.openness.closedRatio, CONFIG.openness.openRatio);
  const pick = pts[CONFIG.strum.pointLandmark] ?? palm;
  pickPoint = pick;
  strumHint(now, true);
  const events = strum.update(pick, now, stringLines(H, CONFIG.strum.topY, CONFIG.strum.gapY, CONFIG.strum.strings), strumBand(W), H);
  if (events.length === 0) return;
  const first = events[0]?.tMs ?? now;
  const muted = leftOpenPercent < CONFIG.strum.muteBelowPercent;
  for (const e of events) {
    strikeAt[e.string] = now;
    const midi = voicingNotes?.[e.string];
    if (midi === undefined || !armed) continue; // 코드 없음·Reset 대기: 줄만 번쩍인다
    const vel = velocityFromSpeed(e.speed, CONFIG.strum.softSpeed, CONFIG.strum.hardSpeed, CONFIG.strum.minVelocity) * (muted ? CONFIG.strum.muteVelocityScale : 1);
    output.pluck(e.string, midi, vel, e.tMs - first, muted ? CONFIG.strum.muteHoldMs : null);
    if (state !== "PLAYING") setState("PLAYING");
    strumDebug = `${e.dir} s${e.string} v${vel.toFixed(2)} ${e.speed.toFixed(1)}H/s${muted ? " mute" : ""}`;
  }
}
function strumHint(now: number, leftSeen: boolean): void {
  if (leftSeen || !voicingNotes) {
    strumHintSince = null;
    return;
  }
  strumHintSince ??= now;
  if (now - strumHintSince > CONFIG.strum.hintAfterMs && now - lastStrumHint > CONFIG.strum.hintRepeatMs) {
    showNotice("왼손 검지로 줄 6개를 쓸어내리면 소리가 납니다", 4000);
    lastStrumHint = now;
  }
}
```
(h) draw(): Scene에 `leftHand: leftView, pick: pickPoint, strings: playMode === "strum" ? stringsView(now, canvas.width, canvas.height) : null`,
```ts
function stringsView(now: number, W: number, H: number): StringsView {
  const ys = stringLines(H, CONFIG.strum.topY, CONFIG.strum.gapY, CONFIG.strum.strings);
  const b = strumBand(W);
  return { x0: b.x0, x1: b.x1, ys, flash: ys.map((_, i) => Math.max(0, 1 - (now - (strikeAt[i] ?? -Infinity)) / CONFIG.strum.flashMs)) };
}
```
디버그 문자열 끝에 `${playMode === "strum" ? \` | strum ${strumDebug || "-"} voicing ${voicingNotes?.join(",") ?? "-"}\` : ""}`.
(i) 스트럼 모드에서 오른손이 보이는 동안 레벨 갱신: 기존 `level = …; output.setLevel(level, …)`는 soundChord 뒤에 이미 매 프레임 실행되므로 그대로.
(j) 부팅: `loadMode();` 옆에 `loadPlayMode();`. 영향 훅: `src/strum.ts` 분기.

- [ ] **Step 4: `npx tsc --noEmit && npx vitest run` 통과. Playwright**: `#play` 기본 "strum"·저장·복원, 줄 6개와 "STRUM · L" 렌더(스크린샷), "코드 패드"로 바꾸면 줄 사라짐. 손은 실측.

- [ ] **Step 5: Commit** `feat: 왼손 스트럼 모드 — 가상 줄 6개, 보이싱, 줄별 pluck, 연주 방식 상자`

---

### Task 6: 문서·QA·실측
- README: 사용법에 "연주: 스트럼" 절(왼손 검지, 줄 6개, 다운/업, 뮤트, 코드 바꾸면 멎음, 패널 반대편 배치), GarageBand 절에 "통기타/일렉 트랙 + 스트럼" 한 줄, 구조에 `strum.ts`. gotchas(두 손 라벨, 예약 전송), impact-matrix·symptom-map(스트럼 안 울림: 보이싱 없음·대역 밖·속도 미달·armed), 훅.
- `npm run verify` → 커밋 → 리뷰 워크플로우 → main 병합·푸시.
- 실측: 스트럼 지연 체감, 세기 범위(softSpeed/hardSpeed), 떨림 오작동(minSpeed/refractory), 뮤트 임계(20%), 보이싱 음색(브라우저 플럭 vs GarageBand), 왼손 라벨 안정성.

## Self-Review
- 스펙 3-1(Task 1), 3-2·3-3(Task 2 + main strumBand/stringsView), 3-4(Task 3), 3-5(Task 4), 3-6·3-7(Task 5), 4장 엣지(불응기·최소 속도·null 초기화·보이싱 없음·출력 교체·패닉 포함), 5장 테스트.
- 타입: `BothHands.left: ChosenHand | null` ↔ processLeftHand; `StrumEvent` ↔ pluck 인자; `StringsView` ↔ overlay; `voicing(symbol, count)`; `ChordOutput.pluck` 5인자 양쪽 구현 동일.
