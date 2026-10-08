# 왼손 스트럼 모드(5차) 구현 계획 — 2판 (실패 분석 반영)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면 한쪽의 가상 줄 6개를 왼손 검지로 쓸면 오른손이 잡은 코드의 기타 모양 6음 보이싱이 줄별로 울린다(스트럼·아르페지오·업 스트로크·뮤트). 패드 모드(기존)는 그대로.

**Architecture:** 순수 모듈 셋(`strum.ts` 교차 감지, `chords.ts` voicing, `hands.ts` 두 손 선택) + 출력 인터페이스 확장(`pluck`, 예약 시각 추적) + main.ts 통합(오른손 `soundChord`, 왼손 `processLeftHand`, 왼손 상태는 오른손과 독립). 소리는 Tone PluckSynth 6줄(줄별 울림 시간 보정) 또는 MIDI 예약 전송(종료 메시지도 마지막 예약 뒤로).

**Tech Stack:** 기존 그대로(tone 15.1.22, tonal 6.4.3, tasks-vision 1.0.1). 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-10-08-strum-design.md` · **실패 분석:** `docs/superpowers/specs/2026-10-08-strum-failure-analysis.md`

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
    rearmDistRatio: 0.012, // 타격 뒤 피크가 줄에서 이만큼(영상 높이 비율, 720p≈8.6px) 떨어져야 다음 타격을 센다(떨림 차단)
    minSpeed: 0.05, // 영상 높이/초. 보조 가드
    maxJumpRatio: 0.2, // 프레임당 변위가 영상 높이의 이 비율을 넘으면 순간이동(라벨 뒤바뀜)으로 보고 타격 없음
    graceMs: 100, // 왼손이 이 시간 안에 다시 보이면 공백 전 위치와 잇는다
    softSpeed: 0.4, // 이 속도에서 최소 세기
    hardSpeed: 2.5, // 이 속도 이상이면 최대 세기
    minVelocity: 0.35,
    upStrokeScale: 0.85, // 업 스트로크는 조금 가볍게
    refractoryMs: 60, // 같은 줄 재타격 최소 간격(뮤트 홀드보다 길어야 한다)
    muteBelowPercent: 20, // 왼손 펼침 % 미만이면 뮤트
    muteVelocityScale: 0.6,
    muteHoldMs: 40, // 뮤트 음 길이(짧고 둔탁)
    scheduleAheadMs: 0, // 0 = 첫 타격 즉시(프레임 안 시차만 보존). 33~40이면 프레임 경계 시차까지 보존하되 그만큼 지연
    flashMs: 150,
    hintAfterMs: 3000,
    hintRepeatMs: 10000,
  },
  pluck: {
    attackNoise: 1,
    minBurstSec: 0.003, // 노이즈 버스트 최소 길이(고음 줄이 얇아지지 않게)
    dampening: 4000, // Hz
    muteDampening: 1500, // 뮤트 타격은 더 어둡게
    t60Sec: 1.5, // 줄 울림이 −60 dB까지 줄어드는 시간 → 줄마다 resonance 역산
    release: 0.08,
    stringGain: 0.5, // 6줄 합산 클리핑 방지 계수(실측 조정)
    velocityExponent: 1.5,
  },
```

- [ ] **Step 2: 테스트 추가 (RED)** — tests/hands.test.ts 끝에(상단 import에 `selectBothHands` 추가)

```ts
describe("selectBothHands", () => {
  const two = { landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Left", 0.94), cat("Right", 0.96)] };
  const O = { swap: false, minScore: 0.7, prevRight: null, prevLeft: null };
  it("오른손과 왼손을 각각 고르고, 고른 왼손은 회색 점 목록에 없다", () => {
    const r = selectBothHands(two, O);
    expect(r.right.chosen?.palm.x).toBeCloseTo(0.8, 6);
    expect(r.left?.palm.x).toBeCloseTo(0.2, 6);
    expect(r.right.otherPalms).toEqual([]);
  });
  it("swap이면 라벨이 반대로 배정된다", () => {
    const r = selectBothHands(two, { ...O, swap: true });
    expect(r.right.chosen?.palm.x).toBeCloseTo(0.2, 6);
    expect(r.left?.palm.x).toBeCloseTo(0.8, 6);
  });
  it("왼손 점수가 낮으면 왼손은 null이고 회색 점으로 남는다", () => {
    const r = selectBothHands({ landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Left", 0.5), cat("Right", 0.96)] }, O);
    expect(r.left).toBeNull();
    expect(r.right.otherPalms.length).toBe(1);
  });
  it("라벨이 뒤바뀐 프레임은 직전 위치로 되돌린다(두 손이 서로 상대의 직전 자리에 더 가까우면 맞바꿈)", () => {
    const flipped = { landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Right", 0.9), cat("Left", 0.9)] }; // 0.2가 Right로 읽힘
    const r = selectBothHands(flipped, { ...O, prevRight: { x: 0.8, y: 0.5 }, prevLeft: { x: 0.2, y: 0.5 } });
    expect(r.right.chosen?.palm.x).toBeCloseTo(0.8, 6);
    expect(r.left?.palm.x).toBeCloseTo(0.2, 6);
  });
  it("한 손이 두 라벨로 중복 검출되면(같은 자리) 왼손은 보류한다", () => {
    const dup = { landmarks: [lm(0.8), lm(0.81)], handedness: [cat("Right", 0.9), cat("Left", 0.8)] };
    const r = selectBothHands(dup, O);
    expect(r.right.chosen).not.toBeNull();
    expect(r.left).toBeNull();
  });
});
```
(`lm(x)`는 손바닥이 x에 오는 21점 손, `cat(label, score)`는 handedness 항목 — 파일 상단 기존 헬퍼. `lm`이 y를 0.5로 두는지 확인하고 아니면 prevRight/prevLeft의 y를 맞춘다.)

- [ ] **Step 3: 실패 확인** `npx vitest run tests/hands.test.ts`

- [ ] **Step 4: hands.ts 구현**

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
const DUP_DIST = 0.03; // 두 라벨이 같은 손을 가리킨다고 볼 손바닥 거리(정규화)

/** 라벨 wanted("Right"/"Left")이고 점수·화면 안 조건을 만족하는 손을 고른다. 후보가 여럿이면 직전 위치에 가까운 손 */
export function selectHand(result: HandsLike, wanted: "Right" | "Left", opts: { minScore: number; prevPalm: Point | null }): HandSelection {
  /* 기존 selectRightHand 본문 그대로, `const wanted = …` 줄만 제거 */
}

export function selectRightHand(result: HandsLike, opts: SelectOptions): HandSelection {
  return selectHand(result, opts.swap ? "Left" : "Right", { minScore: opts.minScore, prevPalm: opts.prevPalm });
}

/**
 * 오른손(코드)과 왼손(스트럼)을 한 번에. 라벨이 한 프레임 뒤바뀌면(두 손이 서로 상대의 직전 자리에 더 가까움) 맞바꾸고,
 * 한 손이 두 라벨로 중복 검출되면 왼손을 보류한다. 고른 왼손은 회색 점에서 뺀다.
 */
export function selectBothHands(result: HandsLike, opts: BothOptions): BothHands {
  let right = selectHand(result, opts.swap ? "Left" : "Right", { minScore: opts.minScore, prevPalm: opts.prevRight });
  let leftSel = selectHand(result, opts.swap ? "Right" : "Left", { minScore: opts.minScore, prevPalm: opts.prevLeft });
  const r = right.chosen;
  const l = leftSel.chosen;
  if (r && l && opts.prevRight && opts.prevLeft) {
    const crossed = distance(r.palm, opts.prevLeft) < distance(r.palm, opts.prevRight) && distance(l.palm, opts.prevRight) < distance(l.palm, opts.prevLeft);
    if (crossed) {
      const swappedRight: HandSelection = { ...right, chosen: l, otherPalms: right.otherPalms.filter((p) => p.x !== l.palm.x || p.y !== l.palm.y).concat([r.palm]) };
      right = swappedRight;
      leftSel = { ...leftSel, chosen: r };
    }
  }
  let left = leftSel.chosen;
  if (left && right.chosen && distance(left.palm, right.chosen.palm) < DUP_DIST) left = null; // 같은 손 중복 검출
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
(main.ts 호출부는 Task 5에서 맞춘다. 그 전까지 tsc 오류는 정상.)

- [ ] **Step 6: hands 테스트 통과 → Commit** `feat: 두 손 선택(selectBothHands: 라벨 뒤바뀜·중복 검출 방어) + 스트럼 상수`

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
const det = () => new StrumDetector({ rearmDistRatio: 0.012, minSpeed: 0.05, maxJumpRatio: 0.2, graceMs: 100, refractoryMs: 60 });
const up = (d: StrumDetector, y: number, t: number, x = 100) => d.update({ x, y }, t, LINES, BAND, H);

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
    expect(up(d, 250, 0)).toEqual([]);
    const ev = up(d, 270, 33);
    expect(ev.length).toBe(1);
    expect(ev[0]).toMatchObject({ string: 0, dir: "down" });
  });
  it("위로 지나면 up", () => {
    const d = det();
    up(d, 270, 0);
    expect(up(d, 250, 33)[0]).toMatchObject({ string: 0, dir: "up" });
  });
  it("한 프레임에 3줄을 지나면 보간 시각 순으로 돌려준다", () => {
    const d = det();
    up(d, 250, 0);
    const ev = up(d, 350, 40); // 259.2, 298.8, 338.4 통과
    expect(ev.map((e) => e.string)).toEqual([0, 1, 2]);
    expect(ev[0]!.tMs).toBeCloseTo((40 * (259.2 - 250)) / 100, 3);
    expect(ev[1]!.tMs).toBeCloseTo((40 * (298.8 - 250)) / 100, 3);
    expect(ev[2]!.tMs).toBeGreaterThan(ev[1]!.tMs);
  });
  it("교차 지점 x가 대역 밖이면 무시한다", () => {
    const d = det();
    up(d, 250, 0, 600);
    expect(up(d, 270, 33, 600)).toEqual([]);
  });
  it("느린 통과(0.08 영상높이/초)도 센다 — 아르페지오", () => {
    const d = det();
    up(d, 240, 0);
    up(d, 256, 33); // 아직 위
    expect(up(d, 258, 66)).toEqual([]);
    expect(up(d, 260, 99).length).toBe(1); // 2px/33ms = 0.084 H/s
  });
  it("줄 근처 떨림(±3px)은 재장전 거리(8.6px) 미만이라 한 번도 세지 않는다", () => {
    const d = det();
    up(d, 257, 0); // 줄 바로 위에서 등장 → 장전 안 됨
    let n = 0;
    for (let i = 1; i <= 10; i++) n += up(d, i % 2 ? 262 : 257, i * 33).length;
    expect(n).toBe(0);
  });
  it("타격 뒤 줄에서 8.6px 이상 떨어져야 다음 타격을 센다", () => {
    const d = det();
    up(d, 240, 0);
    expect(up(d, 262, 33).length).toBe(1); // 타격, 줄에서 2.8px → 미장전
    expect(up(d, 256, 66)).toEqual([]); // 되돌아 지났지만 미장전
    up(d, 240, 99); // 19px 떨어짐 → 장전
    expect(up(d, 262, 132).length).toBe(1);
  });
  it("같은 줄은 60 ms 안에 다시 치지 않는다(불응기)", () => {
    const d = det();
    up(d, 230, 0);
    expect(up(d, 290, 20).length).toBe(1); // 30px 지나감 → 장전됨
    expect(up(d, 230, 40).length).toBe(0); // 20 ms 뒤 되돌아옴 → 불응기
    expect(up(d, 290, 120).length).toBe(1);
  });
  it("프레임당 변위가 0.2H를 넘으면 순간이동으로 보고 타격 없음", () => {
    const d = det();
    up(d, 250, 0);
    expect(up(d, 650, 33)).toEqual([]); // 0.56H 점프(라벨 뒤바뀜)
    expect(up(d, 640, 66)).toEqual([]); // 이후 정상 추적
  });
  it("100 ms 안의 공백은 잇는다(공백 전 위치 → 재등장 위치)", () => {
    const d = det();
    up(d, 250, 0);
    d.update(null, 33, LINES, BAND, H);
    const ev = up(d, 350, 66);
    expect(ev.map((e) => e.string)).toEqual([0, 1, 2]);
  });
  it("100 ms를 넘는 공백 뒤에는 새 손으로 본다", () => {
    const d = det();
    up(d, 250, 0);
    d.update(null, 33, LINES, BAND, H);
    expect(up(d, 350, 200)).toEqual([]);
  });
  it("속도는 영상 높이/초 단위", () => {
    const d = det();
    up(d, 230, 0);
    const ev = up(d, 302, 100); // 72px/0.1s = 1 H/s
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
export interface StrumOptions {
  rearmDistRatio: number; // 타격 뒤 줄에서 이만큼(H 비율) 떨어져야 재장전
  minSpeed: number; // 영상 높이/초(보조 가드)
  maxJumpRatio: number; // 프레임당 변위 상한(H 비율) — 넘으면 순간이동
  graceMs: number; // 이 시간 안의 공백은 잇는다
  refractoryMs: number;
}

/** 줄 y좌표(픽셀). 0번이 위(가장 낮은 음) */
export function stringLines(H: number, topY: number, gapY: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => (topY + gapY * i) * H);
}

export class StrumDetector {
  private prev: { x: number; y: number; t: number } | null = null;
  private lostAt: number | null = null;
  private lastStrike: number[] = [];
  private armed: boolean[] = []; // 줄별 장전 상태

  constructor(private readonly o: StrumOptions) {}

  update(p: Point | null, now: number, lines: readonly number[], band: StrumBand, H: number): StrumEvent[] {
    if (!p) {
      if (this.prev && this.lostAt === null) this.lostAt = now; // 공백 시작
      return [];
    }
    if (this.lostAt !== null) {
      if (now - this.lostAt > this.o.graceMs) this.prev = null; // 긴 공백 → 새 손
      this.lostAt = null;
    }
    const prev = this.prev;
    this.prev = { x: p.x, y: p.y, t: now };
    const D = this.o.rearmDistRatio * H;
    if (!prev || now <= prev.t) {
      // 첫 프레임: 줄에서 충분히 떨어진 줄만 장전(줄 바로 위에서 나타나면 떨어질 때까지 대기)
      this.armed = lines.map((ly) => Math.abs(p.y - ly) >= D);
      return [];
    }
    if (Math.hypot(p.x - prev.x, p.y - prev.y) > this.o.maxJumpRatio * H) return []; // 순간이동(라벨 뒤바뀜 등)
    const dt = (now - prev.t) / 1000;
    const speed = Math.abs(p.y - prev.y) / H / dt;
    const out: StrumEvent[] = [];
    for (let i = 0; i < lines.length; i++) {
      const ly = lines[i] ?? 0;
      const a = prev.y - ly;
      const b = p.y - ly;
      const crossed = a !== 0 && ((a < 0 && b >= 0) || (a > 0 && b <= 0));
      if (crossed && (this.armed[i] ?? true) && speed >= this.o.minSpeed) {
        const f = a / (a - b); // 선분 위 교차 비율 0~1
        const x = prev.x + (p.x - prev.x) * f;
        const t = prev.t + (now - prev.t) * f;
        if (x >= band.x0 && x <= band.x1 && t - (this.lastStrike[i] ?? -Infinity) >= this.o.refractoryMs) {
          this.lastStrike[i] = t;
          out.push({ string: i, dir: p.y > prev.y ? "down" : "up", tMs: t, speed });
          this.armed[i] = Math.abs(b) >= D; // 지나간 뒤 충분히 멀면 바로 재장전
          continue;
        }
      }
      if (!(this.armed[i] ?? true) && Math.abs(b) >= D) this.armed[i] = true; // 줄에서 멀어지면 재장전
    }
    out.sort((e1, e2) => e1.tMs - e2.tMs);
    return out;
  }

  reset(): void {
    this.prev = null;
    this.lostAt = null;
    this.lastStrike = [];
    this.armed = [];
  }
}

/** 속도(영상 높이/초) → 세기 0~1. soft 이하는 minVelocity, hard 이상은 1, 사이는 선형 */
export function velocityFromSpeed(speed: number, soft: number, hard: number, minVelocity: number): number {
  if (!Number.isFinite(speed)) return minVelocity;
  const t = Math.min(1, Math.max(0, (speed - soft) / (hard - soft)));
  return minVelocity + (1 - minVelocity) * t;
}
```
(`armed[i] ?? true`: lines 길이가 바뀌어 배열이 짧으면 장전된 것으로 본다.)

- [ ] **Step 4: 통과 → Commit** `feat: 스트럼 교차 감지기(재장전 거리·순간이동 가드·공백 잇기) + 테스트`

---

### Task 3: 6음 보이싱 (TDD)

**Files:** `src/chords.ts`, `tests/chords.test.ts`

- [ ] **Step 1: 테스트 (RED)** — tests/chords.test.ts 끝에(import에 `voicing` 추가)

```ts
describe("voicing (기타 모양 6음)", () => {
  it("3화음은 E자 바레 모양: 근음·5도·근음·3도·5도·근음", () => {
    expect(voicing("A")).toEqual([45, 52, 57, 61, 64, 69]); // A2 E3 A3 C#4 E4 A4 = 개방현 A
    expect(voicing("B")).toEqual([47, 54, 59, 63, 66, 71]); // 바레 B
    expect(voicing("C")).toEqual([48, 55, 60, 64, 67, 72]); // 근음이 E2 아래라 C3부터
  });
  it("7화음은 E7 모양: 7도가 3도보다 아래", () => {
    expect(voicing("B7")).toEqual([47, 54, 57, 63, 66, 71]); // B2 F#3 A3 D#4 F#4 B4
    expect(voicing("Emaj7")).toEqual([40, 47, 51, 56, 59, 64]); // E2 B2 D#3 G#3 B3 E4
    expect(voicing("F#7sus4")).toEqual([42, 49, 52, 59, 61, 66]); // 4도가 3도 자리
  });
  it("6화음·add는 근음·5도·근음·3도·추가음·근음", () => {
    expect(voicing("Em6")).toEqual([40, 47, 52, 55, 61, 64]); // E2 B2 E3 G3 C#4 E4 = 개방현 Em6
    expect(voicing("Cadd9")).toEqual([48, 55, 62, 64, 67, 72]); // 기본 배치가 C6까지 치솟아 대체 배치
  });
  it("9화음은 근음·3도·7도·9도·5도·근음(재즈 배치)", () => {
    expect(voicing("A9")).toEqual([45, 49, 55, 59, 64, 69]);
  });
  it("파워코드는 근음·5도만 교대로", () => {
    expect(voicing("A5")).toEqual([45, 52, 57, 64, 69, 76]);
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
 * 기타 모양 보이싱. tonal의 음정으로 역할(근음·3도/sus·5도·7도·추가음)을 나누고 코드 종류별 틀에 맞춰
 * "직전 음보다 높은 가장 가까운 그 음"을 쌓는다. 근음은 lowest(E2=40) 이상에서 가장 가까운 음.
 *   3화음 R-5-R-3-5-R (E자 바레) · 7화음 R-5-7-3-5-R (E7 모양) · 6/add R-5-R-3-X-R · 9화음 R-3-7-X-5-R · 파워 R-5-R-5-R-5
 * 틀이 둘이면 윗음이 근음+27반음을 넘지 않는 첫 틀을 고른다(Cadd9처럼 치솟는 배치 방지).
 */
export function voicing(symbol: string, count = 6, lowest = 40): number[] {
  const c = Chord.get(symbol);
  if (c.empty || !c.tonic) return [];
  const rootPc = Note.get(c.tonic).chroma;
  if (typeof rootPc !== "number") return [];
  let fifth: number | undefined;
  let third: number | undefined;
  let seventh: number | undefined;
  const extras: number[] = [];
  c.intervals.forEach((iv, i) => {
    const pc = Note.get(c.notes[i] ?? "").chroma;
    if (typeof pc !== "number") return;
    const deg = parseInt(iv, 10);
    if (deg === 1) return;
    if (deg === 5 && fifth === undefined) fifth = pc;
    else if ((deg === 3 || deg === 2 || deg === 4) && third === undefined) third = pc;
    else if (deg === 7 && seventh === undefined) seventh = pc;
    else extras.push(pc);
  });
  const R = rootPc;
  const F = fifth ?? third ?? R;
  const T = third ?? fifth ?? R;
  const S = seventh;
  const X = extras[0];
  let templates: number[][];
  if (S !== undefined && X !== undefined) templates = [[R, T, S, X, F, R], [R, F, S, T, X, R]];
  else if (S !== undefined) templates = [[R, F, S, T, F, R]];
  else if (X !== undefined) templates = [[R, F, R, T, X, R], [R, F, X, T, F, R]];
  else if (third === undefined && fifth !== undefined) templates = [[R, F, R, F, R, F]];
  else templates = [[R, F, R, T, F, R]];
  const root = lowest + ((R - (lowest % 12) + 12) % 12);
  const build = (order: number[]): number[] => {
    const out = [root];
    for (let i = 1; out.length < count; i++) {
      const pc = order[i % order.length] ?? R;
      const prev = out[out.length - 1] ?? root;
      let n = prev + ((pc - (prev % 12) + 12) % 12);
      if (n === prev) n += 12;
      out.push(n);
    }
    return out;
  };
  const results = templates.map(build);
  return results.find((v) => (v[v.length - 1] ?? root) <= root + 27) ?? results.reduce((a, b) => ((a[a.length - 1] ?? 0) <= (b[b.length - 1] ?? 0) ? a : b));
}
```

- [ ] **Step 4: 통과 → Commit** `feat: 코드 → 기타 모양 6음 보이싱`

---

### Task 4: 출력 — pluck (TDD는 MIDI만)

**Files:** `src/output.ts`, `src/audio.ts`, `src/midi.ts`, `tests/midi-output.test.ts`

- [ ] **Step 1: output.ts 인터페이스**

```ts
  /**
   * 줄 하나를 튕긴다(스트럼 모드). voice: 줄 번호(0~5), delayMs: 지금부터의 지연(≥0, 프레임 안 시차 보존용),
   * velocity: 0~1, holdMs: null이면 다음 타격·stop()까지 울림, 숫자면 그 뒤 끊는다(뮤트).
   * 구현은 줄별 마지막 예약 시각을 기억해, stop()·패닉의 종료 메시지를 그 뒤에 보내야 한다(예약된 Note On이 종료 뒤에 켜지면 음이 걸린다).
   */
  pluck(voice: number, midi: number, velocity: number, delayMs: number, holdMs: number | null, muted: boolean): void;
```
`stop()` 주석을 "들고 있던 음과 울리는 줄을 모두 놓는다(예약된 타격보다 뒤에)."로.

- [ ] **Step 2: 테스트 (RED)** — tests/midi-output.test.ts: fakePort의 `send`를 `(m: number[], at?: number) => { …; log.push([...m]); times.push(at); }`로 바꾸고 `times: (number | undefined)[]`를 반환에 추가. 끝에:

```ts
describe("MidiOutput.pluck", () => {
  it("Note On을 예약 전송하고, 뮤트는 holdMs 뒤 Note Off를 예약한다", async () => {
    const f = fakePort();
    const out = new MidiOutput(f.port, vi.fn());
    await out.start();
    out.pluck(2, 57, 0.5, 0, 40, true);
    expect(f.log).toEqual([[0x90 | CH, 57, 64], [0x80 | CH, 57, 0]]);
    expect(typeof f.times[0]).toBe("number");
    expect(f.times[1]! - f.times[0]!).toBeCloseTo(40, 6);
  });
  it("같은 줄을 다시 치면 이전 음 Note Off가 먼저 나가고, stop()이 울리는 줄을 모두 끈다", async () => {
    const f = fakePort();
    const out = new MidiOutput(f.port, vi.fn());
    await out.start();
    out.pluck(0, 40, 1, 0, null, false);
    out.pluck(0, 45, 1, 10, null, false);
    expect(f.log).toEqual([[0x90 | CH, 40, 127], [0x80 | CH, 40, 0], [0x90 | CH, 45, 127]]);
    expect(f.times[2]! - f.times[1]!).toBe(0); // 같은 타격 안
    f.log.length = 0;
    out.stop();
    expect(f.log).toEqual([[0x80 | CH, 45, 0]]);
  });
  it("stop()·panic()의 종료 메시지는 마지막 예약 Note On보다 뒤 시각으로 예약된다(걸린 음 방지)", async () => {
    const f = fakePort();
    const out = new MidiOutput(f.port, vi.fn());
    await out.start();
    out.pluck(5, 71, 1, 30, null, false);
    const onAt = f.times[0]!;
    out.stop();
    expect(f.times[1]!).toBeGreaterThan(onAt);
    out.pluck(1, 52, 1, 25, null, false);
    const onAt2 = f.times[2]!;
    out.panic();
    for (const t of f.times.slice(3)) expect(t!).toBeGreaterThan(onAt2);
  });
  it("세기는 벨로시티 1~127로", async () => {
    const f = fakePort();
    const out = new MidiOutput(f.port, vi.fn());
    await out.start();
    out.pluck(1, 52, 0.35, 0, null, false);
    out.pluck(2, 57, 0, 0, null, false);
    expect(f.log[0]![2]).toBe(44);
    expect(f.log[1]![2]).toBe(1);
  });
});
```
(0x90 Note On, 0x80 Note Off. 기존 테스트의 `log` 형태는 유지.) 기존 panic 테스트가 `send`에 timestamp가 붙어도 통과하는지 확인(메시지 내용 비교만 하므로 통과).

- [ ] **Step 3: midi.ts 구현**

```ts
  private stringNotes: (number | undefined)[] = []; // 줄별 울리는 음(스트럼)
  private lastScheduledAt = 0; // 마지막 예약 시각 — 종료 메시지는 이 뒤에

  pluck(voice: number, midi: number, velocity: number, delayMs: number, holdMs: number | null, _muted: boolean): void {
    if (this.disposed) return;
    const ch = CONFIG.midi.channel;
    const at = performance.now() + Math.max(0, delayMs);
    const msgs: Array<[MidiMessage, number]> = [];
    const prev = this.stringNotes[voice];
    if (prev !== undefined) msgs.push([noteOff(ch, prev), at]);
    msgs.push([noteOn(ch, midi, Math.round(Math.min(1, Math.max(0, velocity)) * 127)), at]);
    let last = at;
    if (holdMs !== null) {
      last = at + holdMs;
      msgs.push([noteOff(ch, midi), last]);
      this.stringNotes[voice] = undefined;
    } else {
      this.stringNotes[voice] = midi;
    }
    this.lastScheduledAt = Math.max(this.lastScheduledAt, last);
    this.sendAllAt(msgs);
  }

  /** 종료 메시지를 보낼 시각: 지금과 마지막 예약 중 늦은 쪽 + 1 ms */
  private afterScheduled(): number {
    return Math.max(performance.now(), this.lastScheduledAt) + 1;
  }
  /** 패드 음 + 울리는 줄 전부 */
  private ringing(): number[] {
    return [...this.held, ...this.stringNotes.filter((n): n is number => n !== undefined)];
  }
```
- `stop()`: `const notes = this.ringing(); if (notes.length === 0) return; const at = this.afterScheduled(); this.held = []; this.stringNotes = []; this.sendAllAt(notes.map((n) => [noteOff(ch, n), at] as [MidiMessage, number]));`
- `panic()`·`dispose()`·`fail()`: `panicMessages(this.ringing(), ch)`를 `afterScheduled()` 시각으로 보낸다(`trySendRawAt(msgs, at)` — trySendRaw의 timestamp 판). 그 뒤 `this.held = []; this.stringNotes = [];`.
- `setLevel`의 CC는 그대로 즉시.
- `sendAllAt(msgs: Array<[MidiMessage, number]>)`: sendAll과 같은 오류 처리로 `this.port.send(m, at)`.
- import에 `noteOn` 추가.

- [ ] **Step 4: audio.ts 구현**

```ts
  private strings: { synth: Tone.PluckSynth; gain: Tone.Gain; at: number }[] = []; // at: 마지막 예약 시각(초)
  // start()에서 synth 생성 뒤:
    const master = this.gain;
    const p = CONFIG.pluck;
    this.strings = Array.from({ length: CONFIG.strum.strings }, () => {
      const gain = new Tone.Gain(0).connect(master);
      const synth = new Tone.PluckSynth({ attackNoise: p.attackNoise, dampening: p.dampening, resonance: 0.9, release: p.release }).connect(gain);
      return { synth, gain, at: 0 };
    });

  pluck(voice: number, midi: number, velocity: number, delayMs: number, holdMs: number | null, muted: boolean): void {
    const s = this.strings[voice];
    if (!s || !this.isRunning()) return; // 일시중지 중 예약하면 재개 순간 한꺼번에 터진다
    const p = CONFIG.pluck;
    const t = Tone.now() + Math.max(0, delayMs) / 1000;
    const hz = Tone.Frequency(midi, "midi").toFrequency();
    // 줄 울림 시간을 음높이와 무관하게 T60으로 맞춘다: 피드백 g^(t·f) = 0.001 → g = 0.001^(1/(T60·f))
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

  stop(): void {
    if (this.synth && this.heldHz.length > 0) this.synth.triggerRelease(this.heldHz);
    this.heldHz = [];
    const now = Tone.now();
    for (const s of this.strings) s.synth.triggerRelease(Math.max(now, s.at) + 0.001); // 예약된 타격보다 뒤에 놓는다
  }
```
(`resonance`·`attackNoise`·`dampening`은 PluckSynth의 공개 속성 — tone 15.1.22 d.ts 확인. `dampening`은 setter가 즉시 적용되어 울리던 그 줄의 음색이 ≤33 ms 먼저 바뀌지만 재타격 직전이라 무해.)

- [ ] **Step 5: `npx vitest run tests/midi-output.test.ts` 통과, tsc(main.ts 오류는 Task 5 전까지 허용) → Commit** `feat: 출력 pluck — Tone PluckSynth 6줄(T60 보정), MIDI 예약 전송과 종료 메시지 순서 보장`

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
- `Scene`에 `leftHand: HandView | null; pick: Point | null; strings: StringsView | null;` 추가,
```ts
export interface StringsView {
  x0: number;
  x1: number;
  ys: number[]; // 위(낮은 줄)부터
  flash: number[]; // 줄별 0~1(타격 직후 1)
}
```
- 유령 손 블록을 `drawGhostHand(ctx, hand, connections, rgb)`로 뽑아 오른손 `"255,255,255"`, 왼손 `"170,255,190"`(관절선·점만).
- 줄(손 그리기 전):
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
(a) import: `voicing`(chords), `StrumDetector, stringLines, velocityFromSpeed, type StrumBand`(strum), `type ChosenHand`(hands), `type StringsView`(overlay).
(b) 상태(`let selectMode` 옆):
```ts
type PlayMode = "strum" | "pad";
const playSelect = $<HTMLSelectElement>("play");
let playMode: PlayMode = CONFIG.play.defaultMode;
const strum = new StrumDetector({
  rearmDistRatio: CONFIG.strum.rearmDistRatio,
  minSpeed: CONFIG.strum.minSpeed,
  maxJumpRatio: CONFIG.strum.maxJumpRatio,
  graceMs: CONFIG.strum.graceMs,
  refractoryMs: CONFIG.strum.refractoryMs,
});
const leftEmaRatio = new Ema(CONFIG.smoothing.alpha);
let prevLeftPalmNorm: Point | null = null;
let leftView: HandView | null = null;
let pickPoint: Point | null = null;
let leftOpenPercent = 100;
let voicingNotes: number[] | null = null; // 스트럼 모드에서 오른손이 잡은 코드의 6음(없으면 null)
let voicingSector: number | null = null;
const strikeAt: number[] = []; // 줄별 마지막 타격 시각(번쩍임)
let strumHintSince: number | null = null;
let lastStrumHint = -Infinity;
let bothLabelsSeen = false; // 두 손이 다 보이는데 왼손이 null → '좌우 바꾸기' 안내
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
  resetLeftHandState();
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
(d) 상태 초기화 분리 — **오른손 '없음' 분기(매 프레임 실행)는 왼손을 건드리지 않는다**:
```ts
/** 왼손(스트럼) 상태. Reset·오류 진입·워치독·모드 변경·좌우 바꾸기에서만 부른다 — 오른손이 없다고 지우면 '줄만 번쩍' 피드백이 깨진다 */
function resetLeftHandState(): void {
  leftView = null;
  pickPoint = null;
  prevLeftPalmNorm = null;
  strum.reset();
  leftEmaRatio.reset();
  strikeAt.length = 0;
  strumHintSince = null;
}
```
`silence()`에 `voicingNotes = null; voicingSector = null;` 추가. Reset 핸들러·`enterError`·워치독 분기·`swapInput` change 핸들러(기존 `prevPalmNorm = null` 옆에 `silence(); resetLeftHandState();`)에서 `resetLeftHandState()` 호출. 워치독 조건에 `|| leftView !== null` 추가.
(e) 오른손 코드 확정 지점 통일 — 휠·손가락 경로의 `if (state !== "PLAYING" || sector !== currentSector) { … out.play(midi) … }` 블록을 `if (!soundChord(sector, midi)) return;`로:
```ts
/** 코드가 정해졌을 때. 패드 모드는 바로 울리고, 스트럼 모드는 보이싱만 바꾼다(소리는 왼손이 낸다). 실패(출력 교체)면 false */
function soundChord(sector: number, midi: readonly number[]): boolean {
  if (playMode === "strum") {
    if (sector !== voicingSector) {
      silence(); // 프렛 손이 바뀌면 울리던 줄은 멎는다(기타와 같음). silence()가 보이싱을 비우므로 그 뒤에 넣는다
      voicingSector = sector;
      const v = voicing(palette[sector] ?? "", CONFIG.strum.strings);
      voicingNotes = v.length > 0 ? v : null; // 빈 배열은 '코드 없음'과 같다(거짓 안내 방지)
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
(f) processFrame: `const both = tracker.detect(video, now, { swap, prevRight: prevPalmNorm, prevLeft: prevLeftPalmNorm }); const sel = both.right; bothLabelsSeen = sel.labels.length >= 2;` 그리고 `otherPalms = [...sel.otherPalms, ...(playMode !== "strum" && both.left ? [both.left.palm] : [])].map(...)`. 기존 오른손 본문(안내문부터)을 `processRightHand(sel, now, W, H, center)`로 옮기고 processFrame은 `processRightHand(...); processLeftHand(both.left, now, W, H);`.
(g) 왼손:
```ts
function strumBand(W: number): StrumBand {
  const b = wheelAnchor === "bottom-left" ? CONFIG.strum.bandRight : wheelAnchor === "center" ? CONFIG.strum.bandCenter : CONFIG.strum.bandLeft;
  return { x0: b[0] * W, x1: b[1] * W };
}
/** 스트럼 모드: 왼손 검지 끝이 줄을 지나면 그 줄의 음을 튕긴다. 오른손 유무와 독립 */
function processLeftHand(left: ChosenHand | null, now: number, W: number, H: number): void {
  if (playMode !== "strum") return;
  const lines = stringLines(H, CONFIG.strum.topY, CONFIG.strum.gapY, CONFIG.strum.strings);
  if (!left) {
    leftView = null;
    pickPoint = null;
    strum.update(null, now, lines, strumBand(W), H); // 공백 시작(100 ms 안에 돌아오면 잇는다)
    strumHint(now, false);
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
  const events = strum.update(pick, now, lines, strumBand(W), H);
  if (events.length === 0) return;
  const first = events[0]?.tMs ?? now;
  const offset = Math.max(0, CONFIG.strum.scheduleAheadMs - (now - first)); // 0이면 첫 타격 즉시
  const muted = leftOpenPercent < CONFIG.strum.muteBelowPercent;
  for (const e of events) {
    strikeAt[e.string] = now;
    const midi = voicingNotes?.[e.string];
    if (midi === undefined || !armed) continue; // 코드 없음·Reset 대기: 줄만 번쩍인다
    const vel =
      velocityFromSpeed(e.speed, CONFIG.strum.softSpeed, CONFIG.strum.hardSpeed, CONFIG.strum.minVelocity) *
      (muted ? CONFIG.strum.muteVelocityScale : 1) *
      (e.dir === "up" ? CONFIG.strum.upStrokeScale : 1);
    output.pluck(e.string, midi, vel, offset + (e.tMs - first), muted ? CONFIG.strum.muteHoldMs : null, muted);
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
    showNotice(
      bothLabelsSeen
        ? "두 손이 모두 오른손으로 읽힙니다 — '좌우 바꾸기'를 켜거나 손바닥을 카메라 쪽으로"
        : "왼손 검지로 줄 6개를 쓸어내리면 소리가 납니다",
      4000,
    );
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
(i) 부팅: `loadMode();` 옆에 `loadPlayMode();`. 영향 훅에 `src/strum.ts` 분기.

- [ ] **Step 4: `npx tsc --noEmit && npx vitest run` 통과. Playwright**: `#play` 기본 "strum"·저장·복원, 줄 6개와 "STRUM · L" 렌더(스크린샷, 16:9와 4:3 640×480 뷰포트 둘 다), "코드 패드"로 바꾸면 줄 사라짐.

- [ ] **Step 5: Commit** `feat: 왼손 스트럼 모드 — 가상 줄 6개, 기타 보이싱, 줄별 pluck, 연주 방식 상자`

---

### Task 6: 문서·QA·실측
- README "연주: 스트럼" 절(왼손 검지, 줄 6개, 다운/업, 뮤트, 코드 바꾸면 멎음, 패널 반대편, 보이싱 예), GarageBand 절에 통기타/일렉 트랙 안내, 구조에 `strum.ts`. gotchas(예약 전송은 종료도 예약 뒤로, 왼손 상태는 오른손과 독립, 속도 문턱 대신 재장전 거리), impact-matrix·symptom-map(스트럼 안 울림: 보이싱 없음·대역 밖·미장전·armed·일시중지), 훅.
- `npm run verify` → 커밋 → 리뷰 워크플로우 → main 병합·푸시.
- 실측: 스트럼 지연 체감(`scheduleAheadMs` 0 vs 33), 세기 범위(softSpeed/hardSpeed), 떨림(rearmDistRatio), 뮤트 임계·음색, 보이싱 음색(브라우저 플럭 T60 1.5 vs GarageBand), 왼손 라벨 안정성(`?debug=1` labels), 6줄 합산 음량(stringGain), 4:3 카메라 대역 겹침.

## Self-Review
- 실패 분석 결정 전부 반영: 종료 메시지 예약(Task 4 양쪽), 왼손 상태 독립(Task 5 (d)), 재장전 거리(Task 2), 순간이동 가드·공백 잇기(Task 2), 라벨 뒤바뀜 교차 검사·중복 검출(Task 1), 좌우 바꾸기 초기화(Task 5 (d)), isRunning 가드·T60·버스트·rampTo·release 0.08·뮤트 dampening·stringGain·세기 지수(Task 4), 업 스트로크(Task 5), voicing 빈 배열 null, 안내문 분기, 워치독 왼손, scheduleAhead 노브, muteHold 40 < refractory 60.
- 타입: `pluck` 6인자 양쪽 구현·인터페이스 동일; `StrumOptions` ↔ config; `BothHands.left` ↔ processLeftHand; `StringsView` ↔ overlay.
