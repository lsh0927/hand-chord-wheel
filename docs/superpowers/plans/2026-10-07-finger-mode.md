# 손가락 모드(3차) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선택 방식 상자에서 "손가락"을 고르면 펴진 손가락 수(1~5)로 코드를 고르고, 손 높이로 음량을 조절한다. 휠 모드는 그대로 남는다.

**Architecture:** 손가락 판정·개수·안정화·높이 변환은 순수 모듈 `src/fingers.ts`에 두고 Vitest로 검증한다. `main.ts`의 processFrame은 모드에 따라 두 함수로 분기하며, 소리 출력·패닉·Reset 대기 규칙은 1·2차 것을 그대로 쓴다. 화면은 휠 대신 배지 5개 부채꼴을 그린다.

**Tech Stack:** 기존(TypeScript, Vite, Vitest). 새 라이브러리 없음.

**Spec:** `docs/superpowers/specs/2026-10-07-finger-mode-design.md`

**규칙(공통):** 1차 계획과 동일.

---

### Task 1: 상수와 순수 함수 (TDD)

**Files:**
- Modify: `src/config.ts`
- Create: `src/fingers.ts`
- Test: `tests/fingers.test.ts`

- [ ] **Step 1: config 추가** (`midi: {` 블록 바로 위)

```ts
  select: {
    defaultMode: "fingers", // "fingers" | "wheel"
    modeStorageKey: "hcw.mode.v1",
  },
  fingers: {
    extendRatio: 1.15, // 끝-손목 거리 > PIP-손목 거리 × 비율 → 펴짐 (ASSUMPTION, 실측 교정)
    thumbRatio: 1.1, // 엄지 끝-소지뿌리 > 엄지 IP-소지뿌리 × 비율 → 펴짐 (ASSUMPTION)
    holdMs: 120, // 개수가 이 시간 유지되어야 확정
    heightTopLine: 0.25, // 이 높이(영상 높이 비율)에서 100%
    heightBottomLine: 0.85, // 이 높이에서 0%
  },
```

- [ ] **Step 2: 테스트 작성 (RED)**

`tests/fingers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fingerStates, fingerCount, fingerFlags, heightPercent, StableValue } from "../src/fingers";
import type { Landmarks } from "../src/mapping";

/**
 * 합성 오른손(픽셀, 거울 화면 기준). 손목(640,648), 네 손가락 뿌리 y=504.
 * 펴진 손가락: PIP y-40, DIP y-75, 끝 y-110. 접은 손가락: PIP y-40, DIP y-20, 끝 y+15(손바닥 쪽으로 돌아옴).
 * 엄지: CMC(590,610) MCP(560,575) IP(535,548), 펴짐 끝(490,505), 접힘 끝(585,548 — 소지 쪽으로).
 */
function hand(f: { thumb?: boolean; index?: boolean; middle?: boolean; ring?: boolean; pinky?: boolean }, rotateDeg = 0): Landmarks {
  const lm: { x: number; y: number }[] = Array.from({ length: 21 }, () => ({ x: 640, y: 560 }));
  lm[0] = { x: 640, y: 648 };
  lm[1] = { x: 590, y: 610 };
  lm[2] = { x: 560, y: 575 };
  lm[3] = { x: 535, y: 548 };
  lm[4] = f.thumb ? { x: 490, y: 505 } : { x: 585, y: 548 };
  const fingers: Array<[keyof typeof f, number, number]> = [
    ["index", 592, 5],
    ["middle", 632, 9],
    ["ring", 672, 13],
    ["pinky", 712, 17],
  ];
  for (const [name, x, mcp] of fingers) {
    const ext = !!f[name];
    lm[mcp] = { x, y: 504 };
    lm[mcp + 1] = { x, y: 464 };
    lm[mcp + 2] = { x, y: ext ? 429 : 484 };
    lm[mcp + 3] = { x, y: ext ? 394 : 519 };
  }
  if (rotateDeg === 0) return lm;
  const c = lm[0]!;
  const rad = (rotateDeg * Math.PI) / 180;
  return lm.map((p) => ({
    x: c.x + (p.x - c.x) * Math.cos(rad) - (p.y - c.y) * Math.sin(rad),
    y: c.y + (p.x - c.x) * Math.sin(rad) + (p.y - c.y) * Math.cos(rad),
  }));
}
const ALL = { thumb: true, index: true, middle: true, ring: true, pinky: true };

describe("fingerStates: 손가락별 펴짐", () => {
  it("활짝 편 손은 다섯 다 true, 주먹은 다 false", () => {
    expect(fingerStates(hand(ALL))).toEqual(ALL);
    expect(fingerStates(hand({}))).toEqual({ thumb: false, index: false, middle: false, ring: false, pinky: false });
  });
  it("검지만", () => expect(fingerStates(hand({ index: true }))).toMatchObject({ index: true, middle: false, ring: false, pinky: false }));
  it("손을 90도 돌려도 같다(손목 거리 비교는 회전 불변)", () => {
    const a = fingerStates(hand({ index: true, middle: true, thumb: true }));
    expect(fingerStates(hand({ index: true, middle: true, thumb: true }, 90))).toEqual(a);
    expect(fingerStates(hand({}, 180))).toEqual(fingerStates(hand({})));
  });
});

describe("fingerCount: 1~5, 엄지는 넷 다 펴졌을 때만", () => {
  it.each([
    [{}, 0],
    [{ index: true }, 1],
    [{ index: true, middle: true }, 2],
    [{ index: true, middle: true, ring: true }, 3],
    [{ index: true, middle: true, ring: true, pinky: true }, 4],
    [ALL, 5],
  ] as Array<[Record<string, boolean>, number]>)("%j → %s", (f, n) => expect(fingerCount(fingerStates(hand(f)))).toBe(n));
  it("검지 하나에 엄지가 벌어져 있어도 1 (엄지 무시)", () => expect(fingerCount(fingerStates(hand({ index: true, thumb: true })))).toBe(1));
  it("엄지만 펴면 0 (쉼)", () => expect(fingerCount(fingerStates(hand({ thumb: true })))).toBe(0));
  it("검지+소지(록 사인)도 2 — 조합은 구분하지 않는다", () => expect(fingerCount(fingerStates(hand({ index: true, pinky: true })))).toBe(2));
});

describe("fingerFlags: 디버그 표기", () => {
  it("펴진 손가락만 대문자", () => {
    expect(fingerFlags(fingerStates(hand({ index: true, middle: true })))).toBe("t I M r p");
    expect(fingerFlags(fingerStates(hand(ALL)))).toBe("T I M R P");
  });
});

describe("heightPercent: 바닥 85%→0, 25%→100 (H=720)", () => {
  it.each([
    [612, 0],
    [180, 100],
    [396, 50],
    [700, 0],
    [50, 100],
  ])("y=%s → %s%%", (y, pct) => expect(heightPercent(y, 720)).toBeCloseTo(pct, 6));
});

describe("StableValue: 120 ms 유지해야 바뀜", () => {
  it("첫 값은 즉시, 변경은 120 ms 뒤", () => {
    const s = new StableValue(120);
    expect(s.update(1, 0)).toBe(1);
    expect(s.update(2, 50)).toBe(1);
    expect(s.update(2, 119)).toBe(1);
    expect(s.update(2, 120)).toBe(2);
  });
  it("스치는 값은 무시된다 (1 → 2 → 3 빠르게)", () => {
    const s = new StableValue(120);
    s.update(1, 0);
    s.update(2, 40);
    expect(s.update(3, 80)).toBe(1);
    expect(s.update(3, 150)).toBe(1); // 3은 80부터 70 ms
    expect(s.update(3, 200)).toBe(3); // 120 ms 채움
  });
  it("되돌아가면 타이머가 다시 시작된다", () => {
    const s = new StableValue(120);
    s.update(1, 0);
    s.update(2, 100);
    expect(s.update(1, 150)).toBe(1);
    expect(s.update(2, 200)).toBe(1); // 2는 200부터 다시
    expect(s.update(2, 319)).toBe(1);
    expect(s.update(2, 320)).toBe(2);
  });
  it("reset 뒤 첫 값 즉시", () => {
    const s = new StableValue(120);
    s.update(4, 0);
    s.reset();
    expect(s.value).toBeNull();
    expect(s.update(2, 1000)).toBe(2);
  });
});
```

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run tests/fingers.test.ts` → FAIL(모듈 없음).

- [ ] **Step 4: 구현 (GREEN)**

`src/fingers.ts`:

```ts
// 손가락 개수 모드의 순수 함수. 브라우저 API 없음.
import { CONFIG } from "./config";
import { distance, type Landmarks, type Point } from "./mapping";

export interface FingerStates {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

function at(lm: Landmarks, i: number): Point {
  const p = lm[i];
  if (!p) throw new Error(`landmark ${i} 없음 (길이 ${lm.length})`);
  return p;
}

/**
 * 손가락별 펴짐. 네 손가락은 '끝이 PIP보다 손목에서 멀면' 펴짐(평면 회전 불변).
 * 엄지는 '끝이 IP보다 소지 뿌리에서 멀면' 펴짐(접으면 끝이 손바닥 안쪽, 소지 쪽으로 들어온다).
 */
export function fingerStates(
  lm: Landmarks,
  extendRatio: number = CONFIG.fingers.extendRatio,
  thumbRatio: number = CONFIG.fingers.thumbRatio,
): FingerStates {
  const wrist = at(lm, 0);
  const ext = (pip: number, tip: number): boolean => distance(at(lm, tip), wrist) > distance(at(lm, pip), wrist) * extendRatio;
  const pinkyMcp = at(lm, 17);
  const thumb = distance(at(lm, 4), pinkyMcp) > distance(at(lm, 3), pinkyMcp) * thumbRatio;
  return { thumb, index: ext(6, 8), middle: ext(10, 12), ring: ext(14, 16), pinky: ext(18, 20) };
}

/** 1=검지, 2=+중지, 3=+약지, 4=+소지, 5=+엄지. 엄지는 넷 다 펴졌을 때만 센다(엄지 오판이 1~3에 번지지 않게). */
export function fingerCount(s: FingerStates): number {
  const four = [s.index, s.middle, s.ring, s.pinky].filter(Boolean).length;
  return four === 4 && s.thumb ? 5 : four;
}

/** 디버그 표기: 펴진 손가락만 대문자. 예 "t I M r p" */
export function fingerFlags(s: FingerStates): string {
  return [
    [s.thumb, "t"],
    [s.index, "i"],
    [s.middle, "m"],
    [s.ring, "r"],
    [s.pinky, "p"],
  ]
    .map(([on, ch]) => (on ? String(ch).toUpperCase() : String(ch)))
    .join(" ");
}

/** 손 높이 → 0~100. bottomLine(85%)에서 0, topLine(25%)에서 100 */
export function heightPercent(
  y: number,
  height: number,
  topLine: number = CONFIG.fingers.heightTopLine,
  bottomLine: number = CONFIG.fingers.heightBottomLine,
): number {
  const span = height * (bottomLine - topLine);
  if (span <= 0) return 0;
  const t = (height * bottomLine - y) / span;
  return Math.min(1, Math.max(0, t)) * 100;
}

/** 값이 holdMs 동안 유지되어야 확정값이 바뀐다. 첫 값은 즉시 확정. */
export class StableValue {
  private candidate: number | null = null;
  private candidateSince = 0;
  private stable: number | null = null;
  constructor(private readonly holdMs: number) {}
  get value(): number | null {
    return this.stable;
  }
  update(v: number, nowMs: number): number | null {
    if (v !== this.candidate) {
      this.candidate = v;
      this.candidateSince = nowMs;
    }
    if (this.stable === null) this.stable = v;
    else if (v !== this.stable && nowMs - this.candidateSince >= this.holdMs) this.stable = v;
    return this.stable;
  }
  reset(): void {
    this.candidate = null;
    this.candidateSince = 0;
    this.stable = null;
  }
}
```

- [ ] **Step 5: 통과 + 타입 검사** — Run: `npx vitest run tests/fingers.test.ts && npx tsc --noEmit` → 전부 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/fingers.ts tests/fingers.test.ts
git commit -m "feat: 손가락 펴짐 판정·개수·안정화·높이 음량 순수 함수 + 테스트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 화면(배지 패널)과 모드 분기

**Files:**
- Modify: `index.html`, `src/overlay.ts`, `src/main.ts`

- [ ] **Step 1: index.html** — 출력 상자 앞에:

```html
          <select id="mode" class="sel" aria-label="선택 방식">
            <option value="fingers">선택: 손가락</option>
            <option value="wheel">선택: 휠</option>
          </select>
```

- [ ] **Step 2: overlay.ts**

(a) `Scene`에 추가: `mode: "wheel" | "fingers"; fingerCount: number | null;`

(b) drawScene에서 휠을 그리는 부분(선택 부채꼴 ~ 제목)을 `if (s.mode === "wheel") { …기존 코드… } else { drawFingerPanel(ctx, g, s, H); }` 로 감싼다. 손 점·HUD·막대·정보 줄·알림은 공통.

(c) HUD 둘째 상자 라벨: `hudBox(ctx, 16 + Math.round(H * 0.24), 16, s.mode === "fingers" ? "R HEIGHT" : "R OPEN", …)`.

(d) 손 그리기 뒤, 손가락 모드면 원시 개수 표시:

```ts
  if (s.hand && s.mode === "fingers" && s.fingerCount !== null) {
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(H * 0.045)}px system-ui, sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 6;
    ctx.fillText(String(s.fingerCount), s.hand.palm.x + 16, s.hand.palm.y - 16);
    ctx.shadowBlur = 0;
  }
```

(e) 배지 패널 함수:

```ts
/** 손가락 모드: 번호 배지 5개를 휠 자리에 부채꼴로. 선택 배지는 파랑(무음이면 연하게) */
function drawFingerPanel(ctx: CanvasRenderingContext2D, g: WheelGeometry, s: Scene, H: number): void {
  const r = g.outerR * 0.7;
  const badgeR = H * 0.055;
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${Math.round(H * 0.028)}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText("RIGHT HAND — FINGERS", g.cx, g.cy - g.outerR - H * 0.035);
  ctx.shadowBlur = 0;
  for (let i = 0; i < 5; i++) {
    const a = rad(-70 + 35 * i);
    const x = g.cx + r * Math.cos(a);
    const y = g.cy + r * Math.sin(a);
    const name = s.palette[i];
    const selected = s.selected === i;
    ctx.beginPath();
    ctx.arc(x, y, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = selected ? (s.muted ? `rgba(${BLUE},0.35)` : `rgba(${BLUE},0.85)`) : "rgba(0,0,0,0.5)";
    ctx.fill();
    ctx.strokeStyle = name ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = name ? "#fff" : "rgba(255,255,255,0.35)";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.round(badgeR * 0.9)}px system-ui, sans-serif`;
    ctx.fillText(String(i + 1), x, y - badgeR * 0.1);
    ctx.font = `600 ${Math.round(H * 0.026)}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 6;
    ctx.fillText(name ?? "—", x, y + badgeR + 4);
    ctx.shadowBlur = 0;
  }
}
```

- [ ] **Step 3: main.ts**

(a) import: `import { fingerCount, fingerFlags, fingerStates, heightPercent, StableValue } from "./fingers";`

(b) 상태(출력 상자 변수들 아래):

```ts
type SelectMode = "wheel" | "fingers";
const modeSelect = $<HTMLSelectElement>("mode");
let selectMode: SelectMode = CONFIG.select.defaultMode;
const fingerStable = new StableValue(CONFIG.fingers.holdMs);
let rawFingerCount: number | null = null;
let fingerDebug = "";
```

(c) `resetHandState()`에 `fingerStable.reset(); rawFingerCount = null; fingerDebug = "";` 추가.

(d) processFrame: `handView = { palm, tips: … };` 바로 다음 줄에 분기 삽입:

```ts
    if (selectMode === "fingers") {
      processFingerFrame(pts, palm, H);
      return;
    }
```

그리고 processFrame 아래에 함수 추가:

```ts
/** 손가락 모드: 펴진 손가락 수로 코드, 손 높이로 음량 */
function processFingerFrame(pts: Point[], palm: Point, H: number): void {
  const states = fingerStates(pts);
  const raw = fingerCount(states);
  rawFingerCount = raw;
  fingerDebug = fingerFlags(states);
  const stable = fingerStable.update(raw, performance.now()) ?? 0;
  openPercent = heightPercent(palm.y, H);
  if (stable === 0) {
    shownSector = null;
    armed = true; // 주먹 = 쉼이자 재무장
    silence();
    return;
  }
  const sector = stable - 1;
  if (sector >= palette.length) {
    shownSector = null;
    silence();
    return;
  }
  shownSector = sector;
  if (!armed) {
    silence();
    return;
  }
  const midi = midiByIndex[sector] ?? [];
  if (midi.length === 0) {
    silence();
    return;
  }
  if (state !== "PLAYING" || sector !== currentSector) {
    const out = output;
    out.play(midi);
    if (output !== out) {
      silence();
      return;
    }
    currentSector = sector;
    setState("PLAYING");
  }
  level = (openPercent / 100) ** 2;
  output.setLevel(level);
}
```

(e) 모드 상자(휠 위치 블록 앞):

```ts
// ── 선택 방식 ────────────────────────────────────────────
function isSelectMode(v: string): v is SelectMode {
  return v === "wheel" || v === "fingers";
}
function applyMode(m: SelectMode): void {
  selectMode = m;
  modeSelect.value = m;
  shownSector = null;
  fingerStable.reset();
  sounding.reset();
  outsideRest?.reset();
  silence();
}
function loadMode(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(CONFIG.select.modeStorageKey);
  } catch {
    saved = null;
  }
  applyMode(saved && isSelectMode(saved) ? saved : CONFIG.select.defaultMode);
}
modeSelect.addEventListener("change", () => {
  const v = modeSelect.value;
  if (!isSelectMode(v)) return;
  applyMode(v);
  try {
    localStorage.setItem(CONFIG.select.modeStorageKey, v);
  } catch {
    /* 무시 */
  }
});
```

(f) draw(): Scene에 `mode: selectMode, fingerCount: selectMode === "fingers" ? rawFingerCount : null,` 추가. debug 문자열 끝에 `${selectMode === "fingers" ? ` | ${fingerDebug} raw ${rawFingerCount ?? "-"} stable ${fingerStable.value ?? "-"}` : ""}` 추가.

(g) 부팅: `loadWheelAnchor();` 다음에 `loadMode();`.

(h) processFrame의 Scene 타입 검사: `handView`가 null일 때 `s.hand` 조건으로 처리됨(기존).

- [ ] **Step 4: 타입 검사·전체 테스트** — `npx tsc --noEmit && npx vitest run` → 전부 PASS.

- [ ] **Step 5: 브라우저 확인(Playwright run_code)** — 모드 상자 기본값 `fingers`, 패널 스크린샷(배지 5개·제목 FINGERS·HUD "R HEIGHT"), `wheel`로 바꾸면 휠 복귀 + 저장값, 새로고침 복원.

- [ ] **Step 6: Commit**

```bash
git add index.html src/overlay.ts src/main.ts
git commit -m "feat: 손가락 모드(개수 1~5 → 코드, 높이 → 음량, 120ms 안정화) + 배지 패널 + 모드 상자

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 문서·QA

- README 사용법에 "선택 방식" 항목: 손가락 모드 설명(1~5, 주먹 쉼·재타격, 높이 음량, 120 ms), 휠 모드로 되돌리는 법. 테스트 수 갱신.
- `.claude/hooks/check-impact.sh`에 `src/fingers.ts)` 분기, impact-matrix 행, symptom-map 행(엄지·약지 오판 → 비율 교정, 스침 → holdMs), gotchas(엄지 규칙).
- `npm run verify` FAIL 0 → 커밋.

### Task 4: 실측
- `?debug=1`에서 1~5 전환, 손 90도 기울임, 엄지 벌림, 빠른 1→3 전환, 높이 음량, 주먹 재타격, Reset 대기. 오판이 잦으면 extendRatio/thumbRatio/holdMs 교정 후 README 실측 기록·푸시.

## Self-Review
- Spec 3-1·3-2(Task 1), 3-3(StableValue), 3-4(processFingerFrame), 3-5(heightPercent·level), 3-6(applyMode·저장), 4장(drawFingerPanel·HUD·숫자), 5장(엣지: 팔레트 5개 미만 → sector ≥ length 처리, 소실 → resetHandState가 fingerStable 초기화), 6장(테스트·Playwright·실측).
- 타입: `Scene.mode/fingerCount` ↔ draw(); `processFingerFrame(pts, palm, H)` 인자 ↔ 호출; `fingerFlags` 출력 형식 ↔ 테스트 "t I M r p".

---

## 부록: 실패 분석 반영 (2판 변경 요약) — 구현은 이 부록 기준
1. `tests/fingers.test.ts` StableValue 첫 테스트: `update(2,169) → 1`, `update(2,170) → 2`.
2. `src/fingers.ts`: `fingerRatios(lm): FingerRatios`(순수, 다섯 비율) + `FingerDetector`(Hysteresis 5개: 손가락 enter 1.20/exit 1.10, 엄지 1.18/1.05; `update(lm): FingerStates`, `updateRatios(r)`, `reset()`). `fingerStates(lm)`는 히스테리시스 없는 즉시 판정으로 남겨 테스트·디버그에 쓴다. 합성 손의 펴진 엄지 끝을 (470, 495)로 바꿔 ratio 1.33으로.
3. `src/main.ts`: `const fingerDetector = new FingerDetector()`; processFingerFrame(pts, palm, H, now, inFrame): inFrame=false면 stable 갱신·판정 생략(직전 유지, fingerDebug="손목 화면 밖"); percent 하한 10; `level = (percent/100) ** CONFIG.fingers.levelExponent`; resetHandState·applyMode에서 `fingerDetector.reset()`; Reset 안내문 모드별; debug `h nn%`.
4. `src/overlay.ts`: `muted` 대신 `dim = s.muted || s.level < 0.02`로 배지·부채꼴 연하게; 안내문 상자를 앵커 반대편에(`messageBox`); 패널 제목 아래 작은 안내.
5. `index.html`: 위치 상자 문구 "위치: …", aria-label "패널 위치".
6. `src/config.ts`: fingers에 `enterRatio 1.20, exitRatio 1.10, thumbEnterRatio 1.18, thumbExitRatio 1.05, levelExponent 1.5, minPercent 10, frameMargin 0.05`(extendRatio·thumbRatio는 즉시 판정용으로 유지).
7. README·symptom-map: 휠 모드 한정 표기, 손가락 모드 사용법, 주먹 해제.
8. 테스트 추가: FingerDetector 경계 시퀀스(1.25→on, 1.15→유지, 1.05→off, 1.15→유지 off), heightPercent span≤0 → 0, 21개 미만 throw, StableValue 같은 후보 유지.
