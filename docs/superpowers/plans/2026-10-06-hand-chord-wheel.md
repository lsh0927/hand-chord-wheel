# Hand Chord Wheel 1차 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome에서 로컬로 도는 웹캠 악기. 오른손 위치로 12칸 코드 휠에서 코드를 고르고, 손 펼침 정도로 음량을 조절하며, Tone.js 신디사이저로 화음을 낸다.

**Architecture:** Vite + TypeScript, 프레임워크 없음. 순수 계산(각도→칸, 펼침%, 유지 규칙, 코드→MIDI)은 `src/mapping.ts`·`src/chords.ts`에 두고 Vitest로 테스트한다. 브라우저 전용 부분(카메라, MediaPipe, Tone.js, Canvas)은 얇은 래퍼 모듈로 분리하고 `src/main.ts`가 상태 전이(IDLE→READY→PLAYING)를 맡는다. 소리 출력은 `ChordOutput` 인터페이스 뒤에 숨겨 2차 MIDI 출력을 끼울 수 있게 한다.

**Tech Stack:** @mediapipe/tasks-vision 1.0.1, tone 15.1.22, tonal 6.4.3(고정), vite 8.3.3, vitest 5.0.3, typescript 5.9.3. Node 25.8.1, macOS, Chrome.

**Spec:** `docs/superpowers/specs/2026-10-06-hand-chord-wheel-design.md`

**규칙(전 작업 공통):**
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 한 줄.
- `public/models/`, `public/wasm/`, `node_modules/`는 절대 커밋하지 않는다(.gitignore 처리됨).
- 테스트는 `npx vitest run tests/<파일>` 로 개별 실행, 전체 검증은 `npm run verify`.
- 각 Task의 "Expected" 와 다르면 멈추고 원인을 찾는다(즉흥 패치 금지).

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts` | 의존성 고정, 타입 검사, 개발 서버 + Vitest 설정 |
| `index.html` | 비디오·캔버스·버튼·팔레트 입력. CSS 포함 |
| `scripts/setup-assets.sh` | 모델 내려받기(바이트 수 검증) + wasm 복사 |
| `scripts/verify-all.sh` | 타입 검사, 테스트, 자산 확인, 시크릿 검사, 버전 고정 확인 |
| `src/config.ts` | 모든 상수 |
| `src/mapping.ts` | 순수 함수: 각도, 칸, 데드존, 펼침, 지수 이동 평균, 유지 규칙 |
| `src/chords.ts` | 순수 함수: 팔레트 파싱, 코드→MIDI |
| `src/output.ts` | `ChordOutput` 인터페이스 |
| `src/audio.ts` | Tone.js 구현체 `ToneOutput` |
| `src/camera.ts` | getUserMedia |
| `src/tracker.ts` | MediaPipe 래퍼 + 오른손 고르기(순수 함수 `pickRightHand`) |
| `src/overlay.ts` | Canvas 그리기 + `wheelGeometry` |
| `src/main.ts` | 상태 전이, 프레임 루프, DOM 이벤트 |
| `tests/*.test.ts` | mapping, chords, tracker(pickRightHand), overlay(wheelGeometry) |
| `.claude/` | verifier·debugging 스킬, 영향 범위 훅 |
| `README.md`, `LICENSE` | 실행법, 라이선스(MIT, 저작권자 표기는 사용자 확인) |

---

### Task 1: 프로젝트 뼈대와 자산 준비

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`(임시), `scripts/setup-assets.sh`, `scripts/verify-all.sh`, `LICENSE`, `README.md`(임시)

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "hand-chord-wheel",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "setup": "bash scripts/setup-assets.sh",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "verify": "bash scripts/verify-all.sh"
  },
  "dependencies": {
    "@mediapipe/tasks-vision": "1.0.1",
    "tone": "15.1.22",
    "tonal": "6.4.3"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "vite": "8.3.3",
    "vitest": "5.0.3"
  }
}
```

- [ ] **Step 2: tsconfig.json 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": []
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

- [ ] **Step 3: vite.config.ts 작성 (Vitest 설정 포함)**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  server: { host: "127.0.0.1", port: 5173 },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 4: 임시 index.html 작성 (Task 9에서 교체)**

```html
<!doctype html>
<html lang="ko">
  <head><meta charset="utf-8" /><title>Hand Chord Wheel</title></head>
  <body>
    <p>Task 9에서 화면을 채웁니다.</p>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

그리고 `src/main.ts`를 임시로 만든다(타입 검사 통과용):

```ts
console.log("hand chord wheel: scaffold");
export {};
```

- [ ] **Step 5: scripts/setup-assets.sh 작성**

```bash
#!/usr/bin/env bash
# 모델(.task)과 MediaPipe wasm 파일을 public/ 아래에 준비한다. git에는 커밋하지 않는다.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_URL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
MODEL_BYTES=7819105
MODEL="$ROOT/public/models/hand_landmarker.task"
WASM_SRC="$ROOT/node_modules/@mediapipe/tasks-vision/wasm"
WASM_DST="$ROOT/public/wasm"

mkdir -p "$ROOT/public/models" "$WASM_DST"

size_of() { stat -f%z "$1" 2>/dev/null || echo 0; }

if [ "$(size_of "$MODEL")" != "$MODEL_BYTES" ]; then
  echo "모델 내려받는 중: $MODEL_URL"
  curl -fL --retry 3 -o "$MODEL" "$MODEL_URL" || { echo "FAIL: 모델 다운로드 실패"; exit 1; }
fi
if [ "$(size_of "$MODEL")" = "$MODEL_BYTES" ]; then
  echo "PASS: 모델 ($MODEL_BYTES bytes)"
else
  echo "FAIL: 모델 크기 $(size_of "$MODEL") != $MODEL_BYTES"; exit 1
fi

if [ ! -d "$WASM_SRC" ]; then
  echo "FAIL: $WASM_SRC 없음 — 먼저 npm install"; exit 1
fi
cp "$WASM_SRC"/* "$WASM_DST"/
count=$(ls "$WASM_DST" | wc -l | tr -d ' ')
[ "$count" -ge 6 ] && echo "PASS: wasm ${count}개 복사" || { echo "FAIL: wasm 파일 ${count}개 (6개 기대)"; exit 1; }
```

- [ ] **Step 6: scripts/verify-all.sh 작성**

```bash
#!/usr/bin/env bash
# 커밋 전 전체 검증. 결과는 PASS/FAIL/WARN.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
LOG="$(mktemp)"
fail=0

run() {
  local name="$1"; shift
  if "$@" >"$LOG" 2>&1; then echo "PASS: $name"; else echo "FAIL: $name"; tail -30 "$LOG"; fail=1; fi
}

run "타입 검사 (tsc --noEmit)" npx tsc --noEmit
run "단위 테스트 (vitest run)" npx vitest run

if [ -f public/models/hand_landmarker.task ] && [ "$(stat -f%z public/models/hand_landmarker.task)" = "7819105" ]; then
  echo "PASS: 모델 자산"
else
  echo "WARN: 모델 자산 없음/크기 불일치 — npm run setup"
fi
if [ -f public/wasm/vision_wasm_internal.wasm ]; then echo "PASS: wasm 자산"; else echo "WARN: wasm 자산 없음 — npm run setup"; fi

if grep -rnE "(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY)" src scripts index.html 2>/dev/null; then
  echo "FAIL: 시크릿으로 보이는 문자열"; fail=1
else
  echo "PASS: 시크릿 없음"
fi

if grep -q '"tonal": "6.4.3"' package.json; then echo "PASS: tonal 6.4.3 고정"; else echo "FAIL: tonal은 6.4.3 고정이어야 함(6.5.0은 import 깨짐)"; fail=1; fi

if git ls-files --error-unmatch public/models public/wasm >/dev/null 2>&1; then echo "FAIL: 대용량 자산이 git에 추적됨"; fail=1; else echo "PASS: 대용량 자산 미추적"; fi

rm -f "$LOG"
exit $fail
```

- [ ] **Step 7: LICENSE (MIT) 와 임시 README 작성**

LICENSE — 저작권자 표기는 ASSUMPTION(사용자 확인 후 수정):

```
MIT License

Copyright (c) 2026 Lee Seungheon (lsh0927)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

README.md(임시, Task 12에서 완성):

```markdown
# Hand Chord Wheel

웹캠으로 오른손을 추적해 코드 휠에서 코드를 고르고, 손 펼침으로 음량을 조절하는 로컬 악기.

    npm install
    npm run setup   # 손 추적 모델 7.8 MB 내려받기 + wasm 복사
    npm run dev     # http://127.0.0.1:5173 를 Chrome에서 열기
```

- [ ] **Step 8: 설치, 자산 준비, 검증**

Run: `chmod +x scripts/*.sh && npm install && npm run setup && npm run verify`
Expected:
```
PASS: 모델 (7819105 bytes)
PASS: wasm 6개 복사
PASS: 타입 검사 (tsc --noEmit)
FAIL: 단위 테스트 (vitest run)     ← 테스트 파일이 아직 없어 "No test files found"로 실패하는 것이 정상. Task 3에서 PASS로 바뀐다.
PASS: 모델 자산
PASS: wasm 자산
PASS: 시크릿 없음
PASS: tonal 6.4.3 고정
PASS: 대용량 자산 미추적
```

`npm install` 중 peer 경고가 나오면 기록만 하고 진행. 오류(ERESOLVE 등)면 멈추고 보고.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.ts scripts LICENSE README.md
git commit -m "chore: Vite+TypeScript 뼈대, 자산 준비/검증 스크립트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 상수 모듈

**Files:**
- Create: `src/config.ts`

- [ ] **Step 1: config.ts 작성**

```ts
// 모든 조정 가능한 상수. 숫자 근거는 설계 문서 3장.
export const CONFIG = {
  wheel: {
    outerRadiusRatio: 0.375, // 영상 높이 대비 바깥 반지름
    restRadiusRatio: 0.07, // 중앙 쉼 원판
    labelRadiusRatio: 0.8, // 바깥 반지름 대비 글자 위치
  },
  sector: { deadZoneDeg: 3 },
  openness: {
    closedRatio: 0.8, // ASSUMPTION — Task 11에서 실측 교정
    openRatio: 1.7, // ASSUMPTION — Task 11에서 실측 교정
    muteBelowPercent: 15,
  },
  smoothing: { alpha: 0.5 },
  hold: { lostGraceMs: 500 },
  tracker: {
    wasmPath: "/wasm",
    modelPath: "/models/hand_landmarker.task",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    swapHandedness: false, // Task 11에서 실측 후 결정
  },
  audio: {
    attack: 0.02,
    decay: 0.1,
    sustain: 0.8,
    release: 0.4,
    maxPolyphony: 8,
    lookAheadSec: 0.02,
    rampSec: 0.05,
  },
  palette: {
    default: ["B", "Em6", "A9", "D#7", "G#m", "A", "B7", "Emaj7", "E6", "G", "F#7sus4", "C#m7"],
    min: 6,
    max: 16,
    storageKey: "hcw.palette.v1",
  },
  fps: { warnBelow: 15 },
} as const;
```

- [ ] **Step 2: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 출력 없음(성공).

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: 상수 모듈(config)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 매핑 순수 함수 (TDD)

**Files:**
- Create: `src/mapping.ts`
- Test: `tests/mapping.test.ts`

- [ ] **Step 1: 각도·칸 테스트 작성 (실패 확인용)**

`tests/mapping.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  angleDeg,
  sectorFromAngle,
  nextSector,
  palmCenter,
  distance,
  opennessRatio,
  opennessPercent,
  isInRest,
  Ema,
  HoldTracker,
  type Landmarks,
} from "../src/mapping";

const C = { x: 640, y: 360 }; // 1280x720 중심

describe("angleDeg: 12시=0도, 시계 방향", () => {
  it("12시 방향은 0도", () => expect(angleDeg(C, { x: 640, y: 100 })).toBeCloseTo(0, 5));
  it("3시 방향은 90도", () => expect(angleDeg(C, { x: 900, y: 360 })).toBeCloseTo(90, 5));
  it("6시 방향은 180도", () => expect(angleDeg(C, { x: 640, y: 700 })).toBeCloseTo(180, 5));
  it("9시 방향은 270도", () => expect(angleDeg(C, { x: 100, y: 360 })).toBeCloseTo(270, 5));
  it("설계 예시 (790,150)은 약 35.5도", () => expect(angleDeg(C, { x: 790, y: 150 })).toBeCloseTo(35.54, 1));
});

describe("sectorFromAngle: 0번 칸이 12시 ±15도", () => {
  it.each([
    [0, 0],
    [14.9, 0],
    [15.1, 1],
    [35.5, 1],
    [180, 6],
    [359.9, 0],
    [-10, 0],
  ])("%s도 → %s번 칸 (12칸)", (deg, sector) => expect(sectorFromAngle(deg, 12)).toBe(sector));
  it("8칸이면 45도 간격: 45도 → 1번", () => expect(sectorFromAngle(45, 8)).toBe(1));
});

describe("nextSector: 경계 ±3도 데드존", () => {
  it("이전 칸 없으면 그대로 계산", () => expect(nextSector(null, 44.5, 12, 3)).toBe(1));
  it("1번 칸에서 44.5도는 유지", () => expect(nextSector(1, 44.5, 12, 3)).toBe(1));
  it("1번 칸에서 47.9도도 유지", () => expect(nextSector(1, 47.9, 12, 3)).toBe(1));
  it("1번 칸에서 48도는 2번으로 전환", () => expect(nextSector(1, 48, 12, 3)).toBe(2));
  it("0번 칸에서 343도(반시계 쪽 경계)는 유지", () => expect(nextSector(0, 343, 12, 3)).toBe(0));
  it("0번 칸에서 341도는 11번으로 전환", () => expect(nextSector(0, 341, 12, 3)).toBe(11));
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/mapping.test.ts`
Expected: FAIL — `Failed to resolve import "../src/mapping"` 또는 유사한 모듈 없음 오류.

- [ ] **Step 3: 각도·칸 구현**

`src/mapping.ts`:

```ts
// 손 랜드마크 → 악기 파라미터. 브라우저 API를 쓰지 않는 순수 함수만 둔다.

export interface Point {
  x: number;
  y: number;
}
export type Landmarks = ReadonlyArray<{ readonly x: number; readonly y: number }>;

/** 손바닥 관절: 손목, 검지·중지·약지·소지 뿌리 */
export const PALM_IDS = [0, 5, 9, 13, 17] as const;
/** 손끝: 엄지·검지·중지·약지·소지 */
export const TIP_IDS = [4, 8, 12, 16, 20] as const;

function at(lm: Landmarks, i: number): Point {
  const p = lm[i];
  if (!p) throw new Error(`landmark ${i} 없음 (길이 ${lm.length})`);
  return p;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function palmCenter(lm: Landmarks): Point {
  let x = 0;
  let y = 0;
  for (const i of PALM_IDS) {
    const p = at(lm, i);
    x += p.x;
    y += p.y;
  }
  return { x: x / PALM_IDS.length, y: y / PALM_IDS.length };
}

/** 12시 방향 0도, 시계 방향으로 증가. 화면 좌표(y 아래가 양수) 기준. 반환 0 ≤ deg < 360 */
export function angleDeg(center: Point, p: Point): number {
  const deg = (Math.atan2(p.x - center.x, -(p.y - center.y)) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/** n칸 휠에서 0번 칸이 12시를 중심으로 ±(360/n/2)도를 차지한다. */
export function sectorFromAngle(deg: number, n: number): number {
  const span = 360 / n;
  const norm = (((deg + span / 2) % 360) + 360) % 360;
  return Math.floor(norm / span) % n;
}

/**
 * 데드존 히스테리시스. prev 칸의 범위를 양쪽으로 deadZoneDeg만큼 넓혀,
 * 그 안에 있으면 prev를 유지하고 벗어나야 새 칸으로 바꾼다.
 */
export function nextSector(prev: number | null, deg: number, n: number, deadZoneDeg: number): number {
  const candidate = sectorFromAngle(deg, n);
  if (prev === null || candidate === prev) return candidate;
  const span = 360 / n;
  const delta = ((deg - prev * span + 540) % 360) - 180; // prev 중심 기준 -180..180
  return Math.abs(delta) < span / 2 + deadZoneDeg ? prev : candidate;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/mapping.test.ts`
Expected: 각도·칸 테스트 모두 PASS. (아직 import한 다른 함수가 없어 `opennessRatio is not a function` 류 오류가 나면 Step 5~8의 테스트를 추가하기 전까지는 해당 import를 잠시 지우지 말고 Step 5로 바로 진행한다 — Vitest는 미사용 import를 오류로 보지 않는다. 다만 ESM import 자체가 실패하면(`does not provide an export named`) Step 5~8의 구현을 먼저 채운다.)

- [ ] **Step 5: 펼침·쉼 원판 테스트 추가**

`tests/mapping.test.ts` 끝에 추가:

```ts
/** 합성 손: 손목(0.5,0.9), 손바닥 뿌리 4개 y=0.7, 손끝 5개는 뿌리에서 tipDist만큼 위 */
function syntheticHand(tipDist: number, scale = 1): Landmarks {
  const lm: { x: number; y: number }[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8 }));
  lm[0] = { x: 0.5, y: 0.9 };
  const mcpX = [0.4, 0.47, 0.53, 0.6];
  [5, 9, 13, 17].forEach((id, i) => (lm[id] = { x: mcpX[i]!, y: 0.7 }));
  [4, 8, 12, 16, 20].forEach((id, i) => (lm[id] = { x: 0.38 + i * 0.06, y: 0.7 - tipDist }));
  return lm.map((p) => ({ x: p.x * scale, y: p.y * scale }));
}

describe("palmCenter / distance", () => {
  it("합성 손의 손바닥 중심은 (0.5, 0.74)", () => {
    const c = palmCenter(syntheticHand(0.3));
    expect(c.x).toBeCloseTo(0.5, 6);
    expect(c.y).toBeCloseTo(0.74, 6);
  });
  it("distance는 유클리드 거리", () => expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5));
});

describe("opennessRatio: 손 크기로 정규화한 손끝 거리", () => {
  it("편 손(1.9 부근)이 주먹(0.45 부근)보다 크다", () => {
    const open = opennessRatio(syntheticHand(0.35));
    const fist = opennessRatio(syntheticHand(0.0));
    expect(open).toBeGreaterThan(1.5);
    expect(fist).toBeLessThan(0.6);
  });
  it("카메라 거리가 2배(좌표 ×0.5)여도 같은 값", () => {
    expect(opennessRatio(syntheticHand(0.35, 0.5))).toBeCloseTo(opennessRatio(syntheticHand(0.35)), 10);
  });
  it("손목과 중지 뿌리가 겹치면(크기 0) 0", () => {
    const lm = syntheticHand(0.3).map((p) => ({ ...p }));
    lm[9] = { ...lm[0]! };
    expect(opennessRatio(lm)).toBe(0);
  });
});

describe("opennessPercent: CLOSED=0.8 → 0%, OPEN=1.7 → 100%", () => {
  it("1.5 → 약 77.8%", () => expect(opennessPercent(1.5, 0.8, 1.7)).toBeCloseTo(77.78, 1));
  it("0.5 → 0% (하한)", () => expect(opennessPercent(0.5, 0.8, 1.7)).toBe(0));
  it("2.0 → 100% (상한)", () => expect(opennessPercent(2.0, 0.8, 1.7)).toBe(100));
  it("open ≤ closed 잘못된 설정이면 0", () => expect(opennessPercent(1.0, 1.7, 0.8)).toBe(0));
});

describe("isInRest", () => {
  it("중심에서 28px은 반지름 50 안", () => expect(isInRest(C, { x: 660, y: 380 }, 50)).toBe(true));
  it("중심에서 60px은 밖", () => expect(isInRest(C, { x: 700, y: 360 }, 50)).toBe(false));
});
```

- [ ] **Step 6: 실패 확인**

Run: `npx vitest run tests/mapping.test.ts`
Expected: FAIL — `opennessRatio`, `opennessPercent`, `isInRest` export 없음.

- [ ] **Step 7: 펼침·쉼 원판 구현**

`src/mapping.ts` 끝에 추가:

```ts
/** 손끝 5개와 손바닥 중심 거리의 평균을 손목–중지뿌리 거리로 나눈 값. 카메라 거리와 무관. */
export function opennessRatio(lm: Landmarks): number {
  const palm = palmCenter(lm);
  const scale = distance(at(lm, 0), at(lm, 9));
  if (scale <= 0) return 0;
  let sum = 0;
  for (const i of TIP_IDS) sum += distance(at(lm, i), palm);
  return sum / TIP_IDS.length / scale;
}

/** ratio를 closed(0%)~open(100%) 사이로 선형 변환해 0~100으로 클램프 */
export function opennessPercent(ratio: number, closed: number, open: number): number {
  if (open <= closed) return 0;
  const t = (ratio - closed) / (open - closed);
  return Math.min(1, Math.max(0, t)) * 100;
}

export function isInRest(center: Point, p: Point, restRadius: number): boolean {
  return distance(center, p) < restRadius;
}
```

- [ ] **Step 8: 통과 확인**

Run: `npx vitest run tests/mapping.test.ts`
Expected: PASS (Ema/HoldTracker 테스트는 아직 없음).

- [ ] **Step 9: 지수 이동 평균·유지 규칙 테스트 추가**

`tests/mapping.test.ts` 끝에 추가:

```ts
describe("Ema: 지수 이동 평균 α=0.5", () => {
  it("첫 값으로 초기화, 이후 절반씩 수렴", () => {
    const e = new Ema(0.5);
    expect(e.next(0)).toBe(0);
    [10, 10, 10, 10].forEach((v) => e.next(v));
    expect(e.value).toBeCloseTo(9.375, 6);
  });
  it("reset 후 첫 값으로 다시 초기화", () => {
    const e = new Ema(0.5);
    e.next(100);
    e.reset();
    expect(e.next(7)).toBe(7);
  });
});

describe("HoldTracker: 손 소실 500ms 유예", () => {
  it("400ms 소실은 유지, 600ms는 해제", () => {
    const h = new HoldTracker(500);
    expect(h.update(true, 0)).toBe(true);
    expect(h.update(false, 400)).toBe(true);
    expect(h.update(false, 600)).toBe(false);
  });
  it("한 번도 본 적 없으면 false", () => expect(new HoldTracker(500).update(false, 100)).toBe(false));
  it("reset 후에는 유예 없음", () => {
    const h = new HoldTracker(500);
    h.update(true, 0);
    h.reset();
    expect(h.update(false, 100)).toBe(false);
  });
});
```

- [ ] **Step 10: 실패 확인**

Run: `npx vitest run tests/mapping.test.ts`
Expected: FAIL — `Ema`, `HoldTracker` export 없음.

- [ ] **Step 11: 구현**

`src/mapping.ts` 끝에 추가:

```ts
/** 지수 이동 평균. 첫 샘플로 초기화한다. */
export class Ema {
  private v: number | null = null;
  constructor(private readonly alpha: number) {}
  get value(): number | null {
    return this.v;
  }
  next(x: number): number {
    this.v = this.v === null ? x : this.alpha * x + (1 - this.alpha) * this.v;
    return this.v;
  }
  reset(): void {
    this.v = null;
  }
}

/** 손이 잠깐 사라져도 graceMs 동안은 "있음"으로 취급 */
export class HoldTracker {
  private lastSeen: number | null = null;
  constructor(private readonly graceMs: number) {}
  update(present: boolean, nowMs: number): boolean {
    if (present) {
      this.lastSeen = nowMs;
      return true;
    }
    return this.lastSeen !== null && nowMs - this.lastSeen <= this.graceMs;
  }
  reset(): void {
    this.lastSeen = null;
  }
}
```

- [ ] **Step 12: 전체 통과 확인**

Run: `npx vitest run tests/mapping.test.ts`
Expected: `Tests  27 passed` 부근(개수는 위 테스트 수와 일치), 실패 0.

- [ ] **Step 13: Commit**

```bash
git add src/mapping.ts tests/mapping.test.ts
git commit -m "feat: 매핑 순수 함수(각도→칸, 데드존, 펼침%, EMA, 유지 규칙) + 테스트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 코드 이름 → MIDI, 팔레트 파싱 (TDD)

**Files:**
- Create: `src/chords.ts`
- Test: `tests/chords.test.ts`

- [ ] **Step 1: 테스트 작성**

`tests/chords.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { chordToMidi, isValidChord, parsePalette } from "../src/chords";

// tonal 6.4.3 실행값 (2026-10-06 검증). 근음(2옥타브) + 구성음(3옥타브부터).
const EXPECTED: Array<[string, number[]]> = [
  ["B", [47, 59, 63, 66]],
  ["Em6", [40, 52, 55, 59, 61]],
  ["A9", [45, 57, 61, 64, 67, 71]],
  ["D#7", [39, 51, 55, 58, 61]],
  ["G#m", [44, 56, 59, 63]],
  ["A", [45, 57, 61, 64]],
  ["B7", [47, 59, 63, 66, 69]],
  ["Emaj7", [40, 52, 56, 59, 63]],
  ["E6", [40, 52, 56, 59, 61]],
  ["G", [43, 55, 59, 62]],
  ["F#7sus4", [42, 54, 59, 61, 64]],
  ["C#m7", [37, 49, 52, 56, 59]],
];

describe("chordToMidi", () => {
  it.each(EXPECTED)("%s → %j", (symbol, midi) => expect(chordToMidi(symbol)).toEqual(midi));
  it("읽을 수 없는 기호는 빈 배열", () => expect(chordToMidi("Hxx")).toEqual([]));
  it("근음 없는 기호(maj7)는 빈 배열", () => expect(chordToMidi("maj7")).toEqual([]));
  it("D#7의 겹올림표(F##3)도 MIDI 55로 변환된다", () => expect(chordToMidi("D#7")).toContain(55));
});

describe("isValidChord", () => {
  it("B, F#7sus4는 유효", () => {
    expect(isValidChord("B")).toBe(true);
    expect(isValidChord("F#7sus4")).toBe(true);
  });
  it("Hxx, maj7, 빈 문자열은 무효", () => {
    expect(isValidChord("Hxx")).toBe(false);
    expect(isValidChord("maj7")).toBe(false);
    expect(isValidChord("")).toBe(false);
  });
});

describe("parsePalette", () => {
  const DEFAULT = "B Em6 A9 D#7 G#m A B7 Emaj7 E6 G F#7sus4 C#m7";
  it("공백 구분 12개 통과", () => {
    const r = parsePalette(DEFAULT, 6, 16);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chords).toHaveLength(12);
  });
  it("쉼표·연속 공백·앞뒤 공백 허용", () => {
    const r = parsePalette("  B, Em6,  A9 D#7 ,G#m A ", 6, 16);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chords).toEqual(["B", "Em6", "A9", "D#7", "G#m", "A"]);
  });
  it("6개 미만 거부", () => {
    const r = parsePalette("B Em6 A9", 6, 16);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("6~16");
  });
  it("16개 초과 거부", () => {
    const r = parsePalette(Array(17).fill("C").join(" "), 6, 16);
    expect(r.ok).toBe(false);
  });
  it("잘못된 기호 목록 반환, 나머지는 통과시키지 않음", () => {
    const r = parsePalette("B Em6 Hxx A9 D#7 Zq", 6, 16);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid).toEqual(["Hxx", "Zq"]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/chords.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`src/chords.ts`:

```ts
import { Chord, Note } from "tonal";

export type PaletteParse =
  | { ok: true; chords: string[] }
  | { ok: false; invalid: string[]; reason: string };

/** tonal이 읽을 수 있고 근음이 있는 코드 기호인가. "maj7"처럼 근음 없는 기호는 empty=false지만 tonic이 비어 있어 거부. */
export function isValidChord(symbol: string): boolean {
  if (!symbol) return false;
  const c = Chord.get(symbol);
  return !c.empty && !!c.tonic;
}

/** 근음을 2옥타브에, 구성음을 3옥타브부터 쌓은 MIDI 번호 배열. 읽을 수 없으면 []. */
export function chordToMidi(symbol: string): number[] {
  const c = Chord.get(symbol);
  if (c.empty || !c.tonic) return [];
  const notes = Chord.notes(symbol, `${c.tonic}3`);
  const midis = notes.map((n) => Note.midi(n)).filter((m): m is number => m !== null);
  const root = Note.midi(`${c.tonic}2`);
  return root === null ? midis : [root, ...midis];
}

/** 공백/쉼표로 구분된 팔레트 문자열 검사 */
export function parsePalette(input: string, min: number, max: number): PaletteParse {
  const tokens = input
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length < min || tokens.length > max) {
    return { ok: false, invalid: [], reason: `코드 수는 ${min}~${max}개여야 합니다 (현재 ${tokens.length}개)` };
  }
  const invalid = tokens.filter((t) => !isValidChord(t));
  if (invalid.length > 0) return { ok: false, invalid, reason: "읽을 수 없는 코드 기호" };
  return { ok: true, chords: tokens };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/chords.test.ts`
Expected: 전부 PASS. 12개 MIDI 배열 중 하나라도 다르면 tonal 버전을 확인한다(`npm ls tonal` → 6.4.3이어야 함).

- [ ] **Step 5: Commit**

```bash
git add src/chords.ts tests/chords.test.ts
git commit -m "feat: 코드 이름→MIDI 변환과 팔레트 파싱 + 테스트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 소리 출력 인터페이스와 Tone.js 구현

**Files:**
- Create: `src/output.ts`, `src/audio.ts`

- [ ] **Step 1: output.ts 작성**

```ts
/** 소리 출력 공통 인터페이스. 1차 ToneOutput, 2차 midiOut(Web MIDI → GarageBand/Logic). */
export interface ChordOutput {
  /** 사용자 클릭 핸들러 안에서 호출해야 한다(브라우저 오디오 정책). */
  start(): Promise<void>;
  /** 들고 있던 음을 놓고 새 화음을 바로 친다. */
  play(midi: readonly number[]): void;
  /** 0~1 음량. */
  setLevel(level: number): void;
  /** 들고 있던 음을 놓는다. */
  stop(): void;
}
```

- [ ] **Step 2: audio.ts 작성**

```ts
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

  setLevel(level: number): void {
    const v = Math.min(1, Math.max(0, level));
    this.gain?.gain.rampTo(v, CONFIG.audio.rampSec);
  }

  stop(): void {
    if (this.synth && this.heldHz.length > 0) this.synth.triggerRelease(this.heldHz);
    this.heldHz = [];
  }
}
```

- [ ] **Step 3: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 출력 없음. `oscillator`/`envelope` 옵션 타입 오류가 나면 `new Tone.PolySynth(Tone.Synth, {...} as Partial<Tone.SynthOptions>)` 대신 **먼저** `node_modules/tone/build/esm/instrument/PolySynth.d.ts` 82~83행의 생성자 시그니처를 읽고 맞춘다(기억으로 고치지 말 것).

- [ ] **Step 4: Commit**

```bash
git add src/output.ts src/audio.ts
git commit -m "feat: ChordOutput 인터페이스와 Tone.js 구현(ToneOutput)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 카메라

**Files:**
- Create: `src/camera.ts`

- [ ] **Step 1: 작성**

```ts
/** 전면 카메라를 열어 video에 연결하고 재생까지 기다린다. 거울 표시는 CSS(scaleX(-1))가 맡는다. */
export async function openCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
      facingMode: "user",
    },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise<void>((resolve) => {
    if (video.readyState >= 1) resolve();
    else video.onloadedmetadata = () => resolve();
  });
  await video.play();
}

export function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
```

- [ ] **Step 2: 타입 검사 후 Commit**

Run: `npx tsc --noEmit` → 출력 없음.

```bash
git add src/camera.ts
git commit -m "feat: 카메라 열기/닫기

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: MediaPipe 래퍼와 오른손 고르기 (순수 부분 TDD)

**Files:**
- Create: `src/tracker.ts`
- Test: `tests/tracker.test.ts`

- [ ] **Step 1: pickRightHand 테스트 작성**

`tests/tracker.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickRightHand } from "../src/tracker";

const lm = (x: number) => Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 }));
const cat = (name: "Left" | "Right", score: number) => [{ categoryName: name, score, index: 0, displayName: "" }];

describe("pickRightHand", () => {
  it("두 손 중 Right 라벨 손을 고른다", () => {
    const r = pickRightHand({ landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Left", 0.94), cat("Right", 0.96)] }, false);
    expect(r?.score).toBe(0.96);
    expect(r?.landmarks[0]?.x).toBe(0.8);
  });
  it("swap=true면 Left 라벨 손을 고른다", () => {
    const r = pickRightHand({ landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Left", 0.94), cat("Right", 0.96)] }, true);
    expect(r?.landmarks[0]?.x).toBe(0.2);
  });
  it("Right가 없으면 null", () => {
    expect(pickRightHand({ landmarks: [lm(0.2)], handedness: [cat("Left", 0.9)] }, false)).toBeNull();
  });
  it("손이 없으면 null", () => expect(pickRightHand({ landmarks: [], handedness: [] }, false)).toBeNull());
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/tracker.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`src/tracker.ts`:

```ts
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { HandLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { CONFIG } from "./config";

export type Delegate = "GPU" | "CPU";
export interface RightHand {
  landmarks: NormalizedLandmark[];
  score: number;
}
type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
type HandsOnly = Pick<HandLandmarkerResult, "landmarks" | "handedness">;

/** handedness 라벨이 "Right"(swap이면 "Left")인 첫 손. 없으면 null. */
export function pickRightHand(result: HandsOnly, swap: boolean): RightHand | null {
  const wanted = swap ? "Left" : "Right";
  for (let i = 0; i < result.handedness.length; i++) {
    const cat = result.handedness[i]?.[0];
    const lm = result.landmarks[i];
    if (cat && lm && cat.categoryName === wanted) return { landmarks: lm, score: cat.score };
  }
  return null;
}

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private lastTs = -1;
  delegate: Delegate = "GPU";
  /** 디버그용: 마지막 프레임의 손 라벨들("Right:0.96") */
  lastLabels: string[] = [];

  async init(): Promise<Delegate> {
    const fileset = await FilesetResolver.forVisionTasks(CONFIG.tracker.wasmPath);
    try {
      this.landmarker = await this.create(fileset, "GPU");
      this.delegate = "GPU";
    } catch (e) {
      console.warn("GPU delegate 실패, CPU로 재시도", e);
      this.landmarker = await this.create(fileset, "CPU");
      this.delegate = "CPU";
    }
    return this.delegate;
  }

  private create(fileset: Fileset, delegate: Delegate): Promise<HandLandmarker> {
    return HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: CONFIG.tracker.modelPath, delegate },
      runningMode: "VIDEO",
      numHands: CONFIG.tracker.numHands,
      minHandDetectionConfidence: CONFIG.tracker.minHandDetectionConfidence,
      minHandPresenceConfidence: CONFIG.tracker.minHandPresenceConfidence,
      minTrackingConfidence: CONFIG.tracker.minTrackingConfidence,
    });
  }

  /** 현재 비디오 프레임에서 오른손. 타임스탬프는 단조 증가해야 한다. */
  detectRightHand(video: HTMLVideoElement, nowMs: number): RightHand | null {
    if (!this.landmarker) return null;
    const ts = Math.max(Math.floor(nowMs), this.lastTs + 1);
    this.lastTs = ts;
    const result = this.landmarker.detectForVideo(video, ts);
    this.lastLabels = result.handedness.map((h) => `${h[0]?.categoryName ?? "?"}:${(h[0]?.score ?? 0).toFixed(2)}`);
    return pickRightHand(result, CONFIG.tracker.swapHandedness);
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
```

- [ ] **Step 4: 통과 + 타입 검사**

Run: `npx vitest run tests/tracker.test.ts && npx tsc --noEmit`
Expected: 4 passed, tsc 출력 없음.

- [ ] **Step 5: Commit**

```bash
git add src/tracker.ts tests/tracker.test.ts
git commit -m "feat: MediaPipe Hand Landmarker 래퍼(GPU→CPU 폴백)와 오른손 선택 + 테스트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 화면 그리기 (overlay)

**Files:**
- Create: `src/overlay.ts`
- Test: `tests/overlay.test.ts`

- [ ] **Step 1: wheelGeometry 테스트 작성**

`tests/overlay.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { wheelGeometry } from "../src/overlay";

describe("wheelGeometry (1280x720)", () => {
  const g = wheelGeometry(1280, 720);
  it("중심은 영상 중앙", () => {
    expect(g.cx).toBe(640);
    expect(g.cy).toBe(360);
  });
  it("바깥 반지름 270, 쉼 원판 50.4, 글자 216", () => {
    expect(g.outerR).toBeCloseTo(270, 6);
    expect(g.restR).toBeCloseTo(50.4, 6);
    expect(g.labelR).toBeCloseTo(216, 6);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/overlay.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`src/overlay.ts`:

```ts
import { CONFIG } from "./config";
import type { Point } from "./mapping";

export interface WheelGeometry {
  cx: number;
  cy: number;
  outerR: number;
  restR: number;
  labelR: number;
}

export function wheelGeometry(width: number, height: number): WheelGeometry {
  const outerR = height * CONFIG.wheel.outerRadiusRatio;
  return {
    cx: width / 2,
    cy: height / 2,
    outerR,
    restR: height * CONFIG.wheel.restRadiusRatio,
    labelR: outerR * CONFIG.wheel.labelRadiusRatio,
  };
}

export interface HandView {
  palm: Point;
  tips: Point[];
}

export interface Scene {
  width: number;
  height: number;
  palette: readonly string[];
  selected: number | null;
  hand: HandView | null;
  openPercent: number;
  level: number;
  muted: boolean;
  fps: number;
  delegate: "GPU" | "CPU" | null;
  message: string | null; // 중앙 안내문
  notice: string | null; // 상단 짧은 알림
  debug: string | null; // ?debug=1 일 때만
}

/** "12시 기준 시계 방향 도" → canvas 라디안(3시 기준) */
const rad = (deg: number): number => ((deg - 90) * Math.PI) / 180;
const BLUE = "120,190,255";

export function drawScene(ctx: CanvasRenderingContext2D, s: Scene): void {
  const { width: W, height: H } = s;
  ctx.clearRect(0, 0, W, H);
  const g = wheelGeometry(W, H);
  const n = Math.max(1, s.palette.length);
  const span = 360 / n;

  // 선택 부채꼴
  if (s.selected !== null) {
    ctx.beginPath();
    ctx.moveTo(g.cx, g.cy);
    ctx.arc(g.cx, g.cy, g.outerR, rad(s.selected * span - span / 2), rad(s.selected * span + span / 2));
    ctx.closePath();
    ctx.fillStyle = s.muted ? `rgba(${BLUE},0.25)` : `rgba(${BLUE},0.55)`;
    ctx.fill();
  }

  // 바깥 원, 칸 경계선
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(g.cx, g.cy, g.outerR, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < n; k++) {
    const a = rad(k * span - span / 2);
    ctx.beginPath();
    ctx.moveTo(g.cx + g.restR * Math.cos(a), g.cy + g.restR * Math.sin(a));
    ctx.lineTo(g.cx + g.outerR * Math.cos(a), g.cy + g.outerR * Math.sin(a));
    ctx.stroke();
  }

  // 쉼 원판
  ctx.beginPath();
  ctx.arc(g.cx, g.cy, g.restR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(20,20,30,0.75)";
  ctx.fill();
  ctx.stroke();

  // 코드 이름
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 6;
  ctx.font = `600 ${Math.round(H * 0.035)}px system-ui, sans-serif`;
  for (let k = 0; k < n; k++) {
    const a = rad(k * span);
    ctx.fillText(s.palette[k] ?? "", g.cx + g.labelR * Math.cos(a), g.cy + g.labelR * Math.sin(a));
  }
  ctx.font = `700 ${Math.round(H * 0.028)}px system-ui, sans-serif`;
  ctx.fillText("RIGHT HAND — CHORDS", g.cx, g.cy - g.outerR - H * 0.035);
  ctx.shadowBlur = 0;

  // 손: 손끝 5개와 손바닥 중심
  if (s.hand) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (const t of s.hand.tips) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(s.hand.palm.x, s.hand.palm.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${BLUE},0.95)`;
    ctx.fill();
  }

  // HUD 좌상단
  const chordName = s.selected !== null ? (s.palette[s.selected] ?? "-") : "-";
  hudBox(ctx, 16, 16, "CHORD · R", chordName, H);
  hudBox(ctx, 16 + Math.round(H * 0.24), 16, "R OPEN", `${Math.round(s.openPercent)}%`, H);

  // 오른쪽 세로 음량 막대
  const barH = H * 0.5;
  const barX = W - 28;
  const barY = (H - barH) / 2;
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(barX, barY, 8, barH);
  ctx.fillStyle = `rgba(${BLUE},0.95)`;
  ctx.fillRect(barX, barY + barH * (1 - s.level), 8, barH * s.level);

  // fps / delegate / 디버그
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 ${Math.round(H * 0.02)}px system-ui, sans-serif`;
  const slow = s.fps > 0 && s.fps < CONFIG.fps.warnBelow;
  ctx.fillStyle = slow ? "#ffd166" : "rgba(255,255,255,0.7)";
  ctx.fillText(`${s.fps.toFixed(0)} fps${s.delegate ? ` · ${s.delegate}` : ""}${slow ? " · 느림" : ""}`, 16, H - 20);
  if (s.debug) ctx.fillText(s.debug, 16, H - 44);

  if (s.notice) {
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffd166";
    ctx.font = `600 ${Math.round(H * 0.025)}px system-ui, sans-serif`;
    ctx.fillText(s.notice, W / 2, 16);
  }
  if (s.message) centerMessage(ctx, W, H, s.message);
}

function hudBox(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, value: string, H: number): void {
  const w = Math.round(H * 0.22);
  const h = Math.round(H * 0.1);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `500 ${Math.round(H * 0.018)}px system-ui, sans-serif`;
  ctx.fillText(label, x + 10, y + 8);
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${Math.round(H * 0.045)}px system-ui, sans-serif`;
  ctx.fillText(value, x + 10, y + Math.round(H * 0.035));
}

function centerMessage(ctx: CanvasRenderingContext2D, W: number, H: number, text: string): void {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, H / 2 - H * 0.08, W, H * 0.16);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(H * 0.03)}px system-ui, sans-serif`;
  const lines = text.split("\n");
  lines.forEach((line, i) => ctx.fillText(line, W / 2, H / 2 + (i - (lines.length - 1) / 2) * H * 0.04));
}
```

- [ ] **Step 4: 통과 + 타입 검사**

Run: `npx vitest run tests/overlay.test.ts && npx tsc --noEmit`
Expected: 2 passed, tsc 출력 없음. `roundRect` 타입 오류가 나면 `lib`에 `"DOM"`이 들어 있는지 tsconfig를 확인한다(TypeScript 5.9의 lib.dom에 `roundRect`가 있다; 없다고 나오면 멈추고 보고).

- [ ] **Step 5: Commit**

```bash
git add src/overlay.ts tests/overlay.test.ts
git commit -m "feat: 휠·HUD·음량 막대 Canvas 그리기 + 기하 테스트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 화면(index.html)과 상태 전이(main.ts)

**Files:**
- Modify: `index.html` (Task 1 임시본 교체)
- Modify: `src/main.ts` (Task 1 임시본 교체)

- [ ] **Step 1: index.html 교체**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hand Chord Wheel</title>
    <style>
      :root { color-scheme: dark; --accent: rgb(120, 190, 255); }
      * { box-sizing: border-box; }
      html, body { margin: 0; height: 100%; background: #0b0c10; color: #fff; font-family: system-ui, -apple-system, sans-serif; }
      #stage { position: relative; width: 100vw; height: 100vh; overflow: hidden; background: #000; }
      #video, #overlay { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
      #video { transform: scaleX(-1); } /* 거울 표시. 캔버스는 좌표를 1-x로 바꿔 그린다 */
      .btn { position: absolute; z-index: 2; border: 1px solid rgba(255,255,255,0.35); background: rgba(0,0,0,0.55); color: #fff; font: 600 14px system-ui; padding: 8px 14px; border-radius: 8px; cursor: pointer; }
      .btn:disabled { opacity: 0.5; cursor: default; }
      #reset { top: 16px; right: 16px; }
      #bottom { position: absolute; z-index: 2; left: 16px; right: 56px; bottom: 44px; display: flex; gap: 8px; align-items: center; }
      #palette { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.35); background: rgba(0,0,0,0.55); color: #fff; font: 500 14px ui-monospace, monospace; }
      #palette-msg { position: absolute; z-index: 2; left: 16px; bottom: 80px; font: 500 13px system-ui; color: #9fe3a1; }
      #palette-msg.error { color: #ff8a80; }
      #start { font-size: 15px; }
    </style>
  </head>
  <body>
    <div id="stage">
      <video id="video" playsinline muted></video>
      <canvas id="overlay"></canvas>
      <button id="reset" class="btn" type="button">Reset</button>
      <div id="palette-msg"></div>
      <div id="bottom">
        <input id="palette" type="text" spellcheck="false" autocomplete="off" aria-label="코드 팔레트" />
        <button id="start" class="btn" type="button">Start</button>
      </div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: main.ts 교체**

```ts
import { CONFIG } from "./config";
import { openCamera } from "./camera";
import { HandTracker } from "./tracker";
import { ToneOutput } from "./audio";
import { chordToMidi, parsePalette } from "./chords";
import {
  angleDeg,
  nextSector,
  palmCenter,
  opennessRatio,
  opennessPercent,
  isInRest,
  Ema,
  HoldTracker,
  TIP_IDS,
  type Point,
} from "./mapping";
import { drawScene, wheelGeometry, type Scene, type HandView } from "./overlay";

type State = "IDLE" | "READY" | "PLAYING" | "ERROR";

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 요소가 없습니다`);
  return el as T;
}

const video = $<HTMLVideoElement>("video");
const canvas = $<HTMLCanvasElement>("overlay");
const startBtn = $<HTMLButtonElement>("start");
const resetBtn = $<HTMLButtonElement>("reset");
const paletteInput = $<HTMLInputElement>("palette");
const paletteMsg = $<HTMLElement>("palette-msg");
const ctx2d = canvas.getContext("2d");
if (!ctx2d) throw new Error("Canvas 2D 컨텍스트를 만들 수 없습니다");
const ctx: CanvasRenderingContext2D = ctx2d;
const debug = new URLSearchParams(location.search).has("debug");

const output = new ToneOutput();
const tracker = new HandTracker();
const hold = new HoldTracker(CONFIG.hold.lostGraceMs);
const emaX = new Ema(CONFIG.smoothing.alpha);
const emaY = new Ema(CONFIG.smoothing.alpha);
const emaRatio = new Ema(CONFIG.smoothing.alpha);

let state: State = "IDLE";
let palette: string[] = [...CONFIG.palette.default];
let midiByIndex: number[][] = palette.map(chordToMidi);
let currentSector: number | null = null; // 소리가 나고 있는 칸
let shownSector: number | null = null; // 화면에 표시 중인 칸(무음이어도)
let handView: HandView | null = null;
let openPercent = 0;
let level = 0;
let lastRatio = 0;
let message: string | null = "Start를 누르면 카메라와 소리가 켜집니다";
let notice: string | null = null;
let noticeUntil = 0;
let lastVideoTime = -1;
const frameTimes: number[] = [];

function setState(s: State): void {
  state = s;
}

function showNotice(text: string, ms = 4000): void {
  notice = text;
  noticeUntil = performance.now() + ms;
}

function resetFilters(): void {
  emaX.reset();
  emaY.reset();
  emaRatio.reset();
}

/** 소리를 멈추고 READY로. 표시 칸은 호출자가 정한다. */
function silence(): void {
  if (state === "PLAYING") {
    output.stop();
    setState("READY");
  }
  currentSector = null;
  level = 0;
}

// ── 팔레트 ──────────────────────────────────────────────
function applyPalette(chords: string[]): void {
  palette = chords;
  midiByIndex = palette.map(chordToMidi);
  shownSector = null;
  silence();
}

function loadPalette(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(CONFIG.palette.storageKey);
  } catch {
    saved = null; // 저장소 사용 불가(시크릿 모드 등)
  }
  if (saved) {
    const parsed = parsePalette(saved, CONFIG.palette.min, CONFIG.palette.max);
    if (parsed.ok) applyPalette(parsed.chords);
  }
  paletteInput.value = palette.join(" ");
}

paletteInput.addEventListener("change", () => {
  const parsed = parsePalette(paletteInput.value, CONFIG.palette.min, CONFIG.palette.max);
  if (!parsed.ok) {
    paletteMsg.textContent = parsed.invalid.length ? `${parsed.reason}: ${parsed.invalid.join(", ")}` : parsed.reason;
    paletteMsg.classList.add("error");
    return;
  }
  paletteMsg.textContent = `${parsed.chords.length}개 코드 적용`;
  paletteMsg.classList.remove("error");
  applyPalette(parsed.chords);
  paletteInput.value = parsed.chords.join(" ");
  try {
    localStorage.setItem(CONFIG.palette.storageKey, parsed.chords.join(" "));
  } catch {
    /* 저장 실패는 무시 */
  }
});

// ── 시작 / 리셋 ──────────────────────────────────────────
function describeError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  const text = e instanceof Error ? e.message : String(e);
  if (name === "NotAllowedError") return "카메라 권한이 거부되었습니다.\n주소창 왼쪽 아이콘 → 카메라 → 허용 후 '다시 시도'";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "카메라를 찾을 수 없습니다. 연결을 확인하세요.";
  if (name === "NotReadableError") return "다른 앱이 카메라를 쓰고 있습니다. 그 앱을 닫고 '다시 시도'";
  if (/wasm|\.task|fetch|404|Failed to load/i.test(text)) return "손 추적 모델 또는 wasm 파일을 찾지 못했습니다.\n터미널에서 npm run setup 실행 후 새로고침";
  return `시작 실패: ${text}`;
}

function resize(): void {
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
}

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  try {
    const audioReady = output.start(); // 사용자 제스처 컨텍스트 안에서 즉시 시작
    message = "카메라 여는 중…";
    await openCamera(video);
    resize();
    message = "손 추적 모델 불러오는 중…";
    await audioReady;
    const delegate = await tracker.init();
    message = null;
    setState("READY");
    startBtn.textContent = "실행 중";
    if (delegate === "CPU") showNotice("GPU 모드 실패 → CPU 모드(느림, 약 107 ms/프레임)", 6000);
  } catch (e) {
    console.error(e);
    setState("ERROR");
    message = describeError(e);
    startBtn.disabled = false;
    startBtn.textContent = "다시 시도";
  }
});

resetBtn.addEventListener("click", () => {
  silence();
  shownSector = null;
  handView = null;
  hold.reset();
  resetFilters();
  openPercent = 0;
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) silence();
});

// ── 프레임 처리 ──────────────────────────────────────────
function processFrame(now: number): void {
  const W = canvas.width;
  const H = canvas.height;
  const geo = wheelGeometry(W, H);
  const center: Point = { x: geo.cx, y: geo.cy };

  const hand = tracker.detectRightHand(video, now);
  const present = hold.update(hand !== null, now);

  if (hand) {
    // 거울 표시 좌표로 변환: x → (1 - x)
    const pts: Point[] = hand.landmarks.map((l) => ({ x: (1 - l.x) * W, y: l.y * H }));
    const rawPalm = palmCenter(pts);
    const palm: Point = { x: emaX.next(rawPalm.x), y: emaY.next(rawPalm.y) };
    const ratio = emaRatio.next(opennessRatio(hand.landmarks));
    lastRatio = ratio;
    openPercent = opennessPercent(ratio, CONFIG.openness.closedRatio, CONFIG.openness.openRatio);
    handView = { palm, tips: TIP_IDS.map((i) => pts[i] ?? palm) };

    if (isInRest(center, palm, geo.restR)) {
      shownSector = null;
      silence();
      return;
    }
    const deg = angleDeg(center, palm);
    const sector = nextSector(shownSector, deg, palette.length, CONFIG.sector.deadZoneDeg);
    shownSector = sector;

    if (openPercent < CONFIG.openness.muteBelowPercent) {
      silence();
      return;
    }
    if (state !== "PLAYING" || sector !== currentSector) {
      output.play(midiByIndex[sector] ?? []);
      currentSector = sector;
      setState("PLAYING");
    }
    level = (openPercent / 100) ** 2;
    output.setLevel(level);
    return;
  }

  if (!present) {
    // 유예 500ms 초과: 완전히 놓는다
    handView = null;
    shownSector = null;
    openPercent = 0;
    resetFilters();
    silence();
  }
  // 유예 시간 안이면 마지막 상태 유지
}

function fpsNow(now: number): number {
  while (frameTimes.length > 0) {
    const first = frameTimes[0];
    if (first === undefined || now - first <= 1000) break;
    frameTimes.shift();
  }
  return frameTimes.length;
}

function draw(now: number): void {
  if (notice && now > noticeUntil) notice = null;
  const scene: Scene = {
    width: canvas.width,
    height: canvas.height,
    palette,
    selected: shownSector,
    hand: handView,
    openPercent,
    level,
    muted: state !== "PLAYING",
    fps: state === "IDLE" ? 0 : fpsNow(now),
    delegate: state === "IDLE" || state === "ERROR" ? null : tracker.delegate,
    message,
    notice,
    debug: debug ? `ratio ${lastRatio.toFixed(2)} | ${tracker.lastLabels.join(" ") || "no hand"}` : null,
  };
  drawScene(ctx, scene);
}

function loop(now: number): void {
  if ((state === "READY" || state === "PLAYING") && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    processFrame(now);
    frameTimes.push(now);
  }
  draw(now);
  requestAnimationFrame(loop);
}

// ── 부팅 ────────────────────────────────────────────────
resize();
loadPalette();
requestAnimationFrame(loop);
```

- [ ] **Step 3: 타입 검사와 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc 출력 없음, 테스트 전부 PASS.

- [ ] **Step 4: 실행해서 눈으로 확인**

Run: `npm run dev` 후 Chrome에서 `http://127.0.0.1:5173` 열기.
확인 순서:
1. 휠과 12개 코드 이름이 보이고 글자가 뒤집히지 않는다.
2. Start → 카메라 허용 → 거울처럼 보이는 영상 위에 휠.
3. 오른손을 들면 손끝 점 5개와 파란 손바닥 점이 **손 위치와 일치**한다(좌우가 어긋나면 `1 - l.x` 변환을 의심).
4. 손을 1시 방향에 두면 Em6 칸이 파랗게 되고 소리가 난다. 주먹을 쥐면 멈춘다.
5. 좌하단에 `~30 fps · GPU`.
6. `http://127.0.0.1:5173/?debug=1`로 열면 좌하단에 `ratio 1.xx | Right:0.9x` 가 보인다.

문제가 있으면 멈추고 증상·콘솔 오류를 기록한다(Task 11에서 handedness·보정값을 다룬다).

- [ ] **Step 5: Commit**

```bash
git add index.html src/main.ts
git commit -m "feat: 화면 구성과 상태 전이(IDLE→READY→PLAYING), 팔레트 입력, Reset

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: QA 인프라 (verifier·debugging 스킬, 영향 범위 훅)

**Files:**
- Create: `.claude/settings.json`, `.claude/hooks/check-impact.sh`
- Create: `.claude/skills/music-verifier/SKILL.md`, `.claude/skills/music-verifier/gotchas.md`, `.claude/skills/music-verifier/references/impact-matrix.md`, `.claude/skills/music-verifier/scripts/verify-all.sh`
- Create: `.claude/skills/music-debugging/SKILL.md`, `.claude/skills/music-debugging/references/symptom-map.md`, `.claude/skills/music-debugging/scripts/check-assets.sh`

- [ ] **Step 1: 영향 범위 훅**

`.claude/hooks/check-impact.sh`:

```bash
#!/usr/bin/env bash
# PostToolUse(Edit|Write) 훅: 바뀐 파일이 어떤 기능에 영향을 주는지 알려준다.
set -uo pipefail
INPUT="$(cat)"
FILE="$(printf '%s' "$INPUT" | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))
except Exception:
    print("")' 2>/dev/null)"
[ -z "$FILE" ] && exit 0
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
REL="${FILE#"$ROOT"/}"
case "$REL" in
  src/mapping.ts) echo "[impact] mapping.ts → 코드 선택(각도·데드존)·펼침%·유지 규칙 전부. tests/mapping.test.ts 실행, 칸 경계 깜빡임 수동 확인" ;;
  src/chords.ts) echo "[impact] chords.ts → 팔레트 파싱·MIDI 번호. tests/chords.test.ts 실행, 12개 기본 코드 소리 확인" ;;
  src/audio.ts|src/output.ts) echo "[impact] 소리 출력 → ChordOutput 인터페이스 변경 시 2차 midiOut.ts 호환 확인, 코드 변경 시 release→attack 확인" ;;
  src/tracker.ts) echo "[impact] 손 추적 → swapHandedness 실측 재확인, GPU→CPU 폴백 확인, tests/tracker.test.ts" ;;
  src/config.ts) echo "[impact] 상수 → 보정값(closed/open)·데드존·유예 변경 시 수동 합격 기준 5개 재수행" ;;
  src/main.ts) echo "[impact] 상태 전이 → 수동 합격 기준 5개 재수행(fps≥25, 경계 5초 불변, 주먹 100ms 무음, Reset 즉시 무음, 손 이탈 0.5초 무음)" ;;
  src/overlay.ts|index.html) echo "[impact] 화면 → 거울 좌표(x→1-x) 일치, HUD 글자 반전 여부, tests/overlay.test.ts" ;;
  scripts/setup-assets.sh|.gitignore) echo "[impact] 자산 준비 → 새 clone에서 npm run setup 재검증, public/models·public/wasm 미추적 확인" ;;
  package.json) echo "[impact] 의존성 → tonal 6.4.3 고정 유지 확인, npm run verify" ;;
esac
exit 0
```

`.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/check-impact.sh" }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: verifier 스킬**

`.claude/skills/music-verifier/SKILL.md`:

```markdown
---
name: music-verifier
description: Hand Chord Wheel 커밋 전 확정적 검증. 타입 검사·단위 테스트·자산·시크릿·버전 고정·대용량 파일 미추적을 한 번에 확인한다. "검증해", "verify", 커밋 직전에 사용.
---

# music-verifier

## 언제
- 코드 수정 후 커밋 직전 (필수)
- 의존성 변경 후
- 새 clone에서 환경 점검

## 절차
1. `bash .claude/skills/music-verifier/scripts/verify-all.sh` 실행 (프로젝트 `scripts/verify-all.sh`를 호출)
2. 출력의 FAIL 0개 확인. WARN(자산 없음)은 `npm run setup`으로 해소.
3. 바뀐 파일을 `references/impact-matrix.md`에서 찾아 수동 확인 항목을 수행.
4. 새 실패 패턴을 만났으면 `gotchas.md`에 증상/원인/규칙/적용 시점 형식으로 추가.

## 수동 합격 기준 (main.ts·config.ts·mapping.ts 변경 시)
- Chrome 내장 카메라에서 25 fps 이상
- 칸 경계에 손을 5초 두어도 코드 불변
- 주먹 쥐면 100 ms 안에 무음
- Reset 즉시 무음
- 손을 화면 밖으로 빼면 0.5초 뒤 무음
```

`.claude/skills/music-verifier/gotchas.md`:

```markdown
# Gotchas — 반복 실패 패턴

형식: **증상** / **원인** / **규칙** / **적용 시점**

1. **증상** `npm install` 후 tonal import가 `Cannot find package .../dist/index.js`로 실패
   **원인** tonal 6.5.0(2026-09-28)의 @tonaljs/abc-notation이 main 경로 파일을 포함하지 않음
   **규칙** tonal은 6.4.3 고정. verify-all.sh가 검사한다
   **적용 시점** 의존성 업데이트 때

2. **증상** HUD 글자가 좌우 반전되어 보임
   **원인** 캔버스에 CSS scaleX(-1)을 적용함
   **규칙** 비디오만 반전하고 캔버스는 좌표를 `1 - x`로 변환해 그린다
   **적용 시점** overlay.ts·index.html 수정 때

(이후 버그를 만날 때마다 추가)
```

`.claude/skills/music-verifier/references/impact-matrix.md`:

```markdown
# 변경 영역 → 영향 기능

| 변경 파일 | 영향 | 자동 검증 | 수동 확인 |
|---|---|---|---|
| src/mapping.ts | 코드 선택, 펼침%, 유지 규칙 | tests/mapping.test.ts | 경계 깜빡임, 주먹 무음 |
| src/chords.ts | 팔레트, MIDI 번호 | tests/chords.test.ts | 12개 코드 소리 |
| src/audio.ts, src/output.ts | 소리 | tsc | 코드 전환 시 끊김/겹침 |
| src/tracker.ts | 손 검출, 좌우 라벨 | tests/tracker.test.ts | ?debug=1 라벨 확인 |
| src/overlay.ts, index.html | 화면 | tests/overlay.test.ts | 글자 반전, 손 점 위치 |
| src/main.ts | 상태 전이 | tsc | 수동 합격 기준 5개 |
| src/config.ts | 모든 임계값 | 전체 테스트 | 수동 합격 기준 5개 |
| scripts/setup-assets.sh, .gitignore | 자산/저장소 | verify-all.sh 미추적 검사 | 새 clone 재현 |
```

`.claude/skills/music-verifier/scripts/verify-all.sh`:

```bash
#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
exec bash "$ROOT/scripts/verify-all.sh"
```

- [ ] **Step 3: debugging 스킬**

`.claude/skills/music-debugging/SKILL.md`:

```markdown
---
name: music-debugging
description: Hand Chord Wheel 증상별 진단 런북. 소리 안 남, 손 인식 안 됨, 좌우 반대, 코드 깜빡임, 느림, 모델 로드 실패를 다룬다. "안 돼", "소리가", "인식이" 같은 증상 보고에 사용.
---

# music-debugging

## 흐름
1. 증상을 `references/symptom-map.md`에서 찾는다.
2. 먼저 `bash .claude/skills/music-debugging/scripts/check-assets.sh`로 자산·버전을 확인한다.
3. 브라우저는 Chrome인지, 주소가 `http://127.0.0.1:5173` 또는 `localhost`인지 확인한다(파일 직접 열기·다른 호스트명은 카메라 불가).
4. `?debug=1`로 열어 좌하단 `ratio`와 handedness 라벨을 읽는다.
5. 원인을 코드로 확인한 뒤에만 수정한다. 고치면 verifier 실행 + gotchas 추가.
```

`.claude/skills/music-debugging/references/symptom-map.md`:

```markdown
# 증상 → 원인 → 조치

| 증상 | 가능한 원인 | 확인 | 조치 |
|---|---|---|---|
| Start 눌러도 카메라 안 켜짐 | 권한 거부 / 다른 앱 점유 / http가 localhost 아님 | 중앙 메시지의 오류 이름, Chrome 자물쇠 아이콘 | 권한 허용 후 '다시 시도'; 다른 앱 종료; 127.0.0.1 사용 |
| "모델 또는 wasm 파일을 찾지 못했습니다" | `npm run setup` 미실행, public/ 경로 변경 | check-assets.sh | `npm run setup` 후 새로고침 |
| 소리가 전혀 안 남 | Tone.start가 제스처 밖에서 호출 / 음량 0 / 시스템 출력 장치 | 콘솔 `Tone.getContext().state`, 음량 막대 | Start를 클릭으로 시작; 손 펼침 15% 이상인지 |
| 손이 있는데 인식 안 됨 | 왼손만 보임 / 라벨 반대 / 조명 어두움 | `?debug=1` 라벨 | 오른손 사용; `config.tracker.swapHandedness` 토글 후 재확인 |
| 손 점이 실제 손과 좌우 반대 | 좌표 변환(1-x) 누락/중복 | main.ts processFrame | 변환 한 번만 적용 |
| 코드가 경계에서 깜빡임 | 데드존 작음 / 필터 꺼짐 | config.sector.deadZoneDeg, smoothing.alpha | 데드존 3→5도, alpha 0.5→0.35 |
| 주먹 쥐어도 소리 안 멈춤 | closed/open 보정값이 사용자 손과 안 맞음 | `?debug=1` ratio 읽기 | Task 11 절차로 재실측 |
| fps 15 미만 | CPU 모드 폴백 / 다른 탭·앱 GPU 점유 | 좌하단 `CPU` 표시 | 콘솔 GPU 실패 원인 확인; 해상도 1280→960 |
| 코드 전환 시 음이 겹침/끊김 | release·attack 순서, lookAhead | audio.ts play() | heldHz 관리 확인; lookAhead 0.02→0.05 |
```

`.claude/skills/music-debugging/scripts/check-assets.sh`:

```bash
#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT" || exit 1
m=public/models/hand_landmarker.task
if [ -f "$m" ] && [ "$(stat -f%z "$m")" = "7819105" ]; then echo "PASS: 모델 7819105 bytes"; else echo "FAIL: 모델 없음/크기 불일치 → npm run setup"; fi
n=$(ls public/wasm 2>/dev/null | wc -l | tr -d ' ')
[ "$n" -ge 6 ] && echo "PASS: wasm ${n}개" || echo "FAIL: wasm ${n}개 → npm run setup"
echo "node: $(node -v)"
for p in @mediapipe/tasks-vision tone tonal vite vitest typescript; do
  v=$(node -e "console.log(require('./node_modules/$p/package.json').version)" 2>/dev/null || echo "미설치")
  echo "$p: $v"
done
grep -q '"tonal": "6.4.3"' package.json && echo "PASS: tonal 6.4.3 고정" || echo "WARN: tonal 고정 아님"
```

- [ ] **Step 4: 실행 권한, 훅 동작 확인, Commit**

Run: `chmod +x .claude/hooks/check-impact.sh .claude/skills/*/scripts/*.sh && echo '{"tool_input":{"file_path":"'"$PWD"'/src/mapping.ts"}}' | CLAUDE_PROJECT_DIR="$PWD" bash .claude/hooks/check-impact.sh`
Expected: `[impact] mapping.ts → ...` 한 줄 출력.

```bash
git add .claude
git commit -m "chore: verifier·debugging 스킬과 영향 범위 훅

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: 첫날 실측 — handedness 방향과 펼침 보정값

**Files:**
- Modify: `src/config.ts` (`openness.closedRatio`, `openness.openRatio`, `tracker.swapHandedness`)
- Modify: `README.md` (실측 기록)

- [ ] **Step 1: 디버그 모드로 실행**

Run: `npm run dev` → Chrome에서 `http://127.0.0.1:5173/?debug=1` → Start.

- [ ] **Step 2: handedness 확인**

오른손만 들고 좌하단 라벨을 읽는다.
- `Right:0.9x`면 그대로(`swapHandedness: false`).
- `Left:0.9x`로 나오고 손 점이 안 찍히면(오른손이 무시됨) `src/config.ts`의 `swapHandedness`를 `true`로 바꾸고 새로고침해 손 점이 찍히는지 확인한다.
결과를 README "실측 기록"에 적는다(날짜, 라벨, 결정).

- [ ] **Step 3: 펼침 보정값 측정**

손을 휠 중심에서 바깥쪽에 두고(쉼 원판 밖), 다음을 각 3초씩 유지하며 `ratio` 값을 읽는다:
1. 완전히 편 손 → 최소값을 `openMeasured`로 기록(예: 1.62)
2. 꽉 쥔 주먹 → 최대값을 `closedMeasured`로 기록(예: 0.91)
3. 카메라에서 1 m 떨어져 반복 → 값이 ±0.1 안에서 같은지 확인(정규화 검증)

`src/config.ts`에 반영: `closedRatio = closedMeasured + 0.05`, `openRatio = openMeasured - 0.05` (여유 0.05씩 안쪽으로). 예: 0.96, 1.57.

- [ ] **Step 4: 재확인**

새로고침 후: 편 손 → 95% 이상, 주먹 → 0%, 반쯤 편 손 → 40~70% 사이에서 부드럽게 움직이고 소리 음량이 따라간다. 주먹에서 100 ms 안에 무음.

- [ ] **Step 5: 전체 검증과 Commit**

Run: `npm run verify`
Expected: FAIL 0.

```bash
git add src/config.ts README.md
git commit -m "feat: 실측으로 handedness 방향과 펼침 보정값 확정

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: README 완성, 수동 합격 기준, GitHub 올리기

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README 완성**

```markdown
# Hand Chord Wheel

웹캠으로 **오른손**을 추적해 화면 위 코드 휠에서 코드를 고르고, 손을 편 정도로 음량을 조절하는 로컬 악기입니다. 영상은 브라우저 밖으로 나가지 않습니다(서버 없음).

## 요구 사항
- macOS + Chrome (Web MIDI 2차 기능을 위해 Chrome 권장. Safari는 Web MIDI 미지원)
- Node 22.12 이상 (개발 환경 25.8.1에서 확인)
- 웹캠

## 실행
```bash
npm install
npm run setup   # 손 추적 모델(7.8 MB) 내려받기 + MediaPipe wasm(34 MB) 복사. 1회
npm run dev     # http://127.0.0.1:5173 를 Chrome에서 열기
```
카메라 권한은 `localhost`/`127.0.0.1`에서만 열립니다. HTML 파일을 직접 열면 동작하지 않습니다.

## 사용법
- **Start**: 소리와 카메라를 켭니다(브라우저 정책상 클릭이 필요).
- **오른손 위치**: 휠 중심에서 손이 있는 방향의 칸이 선택됩니다. 12시 칸이 0번.
- **손 펼침(R OPEN)**: 음량. 15% 미만(주먹)이면 무음.
- **휠 중앙 원판**: 손을 넣으면 쉼(무음).
- **Reset**: 소리와 상태 초기화.
- **팔레트**: 하단 글상자에 코드 이름을 공백으로 구분해 입력(6~16개). 예: `B Em6 A9 D#7 G#m A B7 Emaj7 E6 G F#7sus4 C#m7`. 브라우저에 저장됩니다.
- `?debug=1`을 붙이면 좌하단에 펼침 비율과 손 라벨이 표시됩니다.

## 구조
- `src/mapping.ts` 각도→칸, 펼침%, 데드존, 지수 이동 평균, 유지 규칙 (순수 함수, 테스트 있음)
- `src/chords.ts` 코드 이름→MIDI 번호 (tonal 6.4.3)
- `src/tracker.ts` MediaPipe Hand Landmarker 1.0.1 (GPU, 실패 시 CPU)
- `src/audio.ts` Tone.js 15 PolySynth. `ChordOutput` 인터페이스 뒤에 있어 2차에 MIDI 출력을 추가할 수 있음
- `src/overlay.ts` Canvas 그리기, `src/main.ts` 상태 전이

## 검증
```bash
npm run verify   # 타입 검사 + 단위 테스트 + 자산 확인 + 시크릿 검사
```

## 실측 기록
- (Task 11에서 기록: 날짜, handedness 라벨 결과, closed/open 측정값)

## 2차 계획
- Web MIDI → IAC Driver → GarageBand/Logic Pro 출력
- 왼손 기능, One Euro Filter, 녹음

## 참고한 공개 프로젝트
- [soundgo](https://github.com/Gojaehyeon/soundgo) (MIT) — 코드 휠·펼침 표시 아이디어
- [gesture-synth](https://github.com/ericwei97-cloud/gesture-synth) — 구조 참고. 코드는 가져오지 않음

## 라이선스
MIT
```

- [ ] **Step 2: 수동 합격 기준 5개 수행**

`npm run dev` 상태에서:
1. 좌하단 fps 25 이상
2. 칸 경계(예: Em6/A9 사이)에 손을 5초 → 코드 불변
3. 주먹 → 100 ms 안에 무음
4. Reset → 즉시 무음, HUD `-`
5. 손을 화면 밖으로 → 0.5초 뒤 무음, HUD `-`
실패 항목은 symptom-map.md를 따라 원인을 찾고 고친 뒤 재수행.

- [ ] **Step 3: 전체 검증과 Commit**

Run: `npm run verify`
Expected: FAIL 0.

```bash
git add README.md
git commit -m "docs: README 완성(실행법, 사용법, 구조, 2차 계획)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: GitHub 올리기 (사용자 확인 후)**

사용자에게 저장소 이름(기본 제안 `hand-chord-wheel`)과 공개 여부를 확인한 뒤:

```bash
gh repo create hand-chord-wheel --public --source=. --remote=origin --push --description "Webcam hand-tracking chord wheel instrument (MediaPipe + Tone.js), local-only"
```

Expected: 저장소 URL 출력, `main` 푸시 완료. 푸시 전에 `git ls-files | grep -E "^public/(models|wasm)/"` 가 비어 있는지 확인(대용량 자산 미추적).

---

## Self-Review (작성자 점검 기록)

- **Spec coverage:** 1장 범위(Task 9), 2장 파일 구조·의존성·저장소 규칙(Task 1·12), 3-1 루프·GPU/CPU(Task 7·9), 3-2 각도(Task 3), 3-3 데드존·유예(Task 3·9), 3-4 펼침(Task 3·11), 3-5 음량·트리거(Task 5·9), 3-6 EMA(Task 3), 3-7 코드→MIDI(Task 4), 3-8 팔레트(Task 4·9), 3-9 출력 인터페이스(Task 5), 3-10 화면(Task 8·9), 4장 상태 전이(Task 9), 5장 오류(Task 9 describeError·notice), 6장 테스트(Task 3·4·7·8·12), QA 인프라(Task 10). 누락 없음.
- **Placeholder scan:** TBD/TODO 없음. README "실측 기록" 빈 줄은 Task 11에서 채우는 의도된 입력란.
- **Type consistency:** `ChordOutput.play(midi: readonly number[])` ↔ `midiByIndex: number[][]` 전달 OK. `HandView{palm,tips}` ↔ main.ts `handView` OK. `nextSector(prev, deg, n, deadZoneDeg)` 호출 인자 순서 일치. `HandTracker.lastLabels`·`delegate`를 main.ts에서 사용 — 정의됨. `Scene.notice/debug/muted` 모두 drawScene에서 소비.
