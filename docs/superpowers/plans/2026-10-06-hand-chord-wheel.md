# Hand Chord Wheel 1차 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome에서 로컬로 도는 웹캠 악기. 오른손 위치로 12칸 코드 휠에서 코드를 고르고, 손 펼침 정도로 음량을 조절하며, Tone.js 신디사이저로 화음을 낸다.

**Architecture:** Vite + TypeScript, 프레임워크 없음. 순수 계산(각도→칸, 펼침%, 히스테리시스, 유지 규칙, 코드→MIDI, 손 고르기)은 `src/mapping.ts`·`src/chords.ts`·`src/hands.ts`에 두고 Vitest로 테스트한다. 브라우저 전용 부분(카메라, MediaPipe, Tone.js, Canvas)은 얇은 래퍼 모듈로 분리하고 `src/main.ts`가 상태 전이(IDLE→READY→PLAYING, ERROR)를 맡는다. 소리 출력은 `ChordOutput` 인터페이스 뒤에 숨겨 2차 MIDI 출력을 끼울 수 있게 한다.

**Tech Stack:** @mediapipe/tasks-vision 1.0.1, tone 15.1.22, tonal 6.4.3(고정), vite 8.3.3, vitest 5.0.3, typescript 5.9.3. Node 25.8.1, macOS, Chrome.

**Spec:** `docs/superpowers/specs/2026-10-06-hand-chord-wheel-design.md` (8장 "실패 분석 반영" 포함)
**실패 분석:** `docs/superpowers/specs/2026-10-06-failure-analysis.md` — 이 계획은 그 결과(CRITICAL 3, GAP 12)를 모두 반영한 2판이다.

**규칙(전 작업 공통):**
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 한 줄.
- `public/models/`, `public/wasm/`, `node_modules/`는 절대 커밋하지 않는다(.gitignore 처리됨).
- 테스트는 `npx vitest run tests/<파일>` 로 개별 실행, 전체 검증은 `npm run verify`.
- 각 Task의 "Expected" 와 다르면 멈추고 원인을 찾는다(즉흥 패치 금지). 라이브러리 시그니처가 의심되면 `node_modules/<pkg>`의 `.d.ts`를 읽는다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts` | 의존성 고정, 타입 검사, 개발 서버 + Vitest 설정 |
| `index.html` | 16:9 프레임 안에 비디오·캔버스·버튼·팔레트 입력·좌우 바꾸기 체크박스. CSS 포함 |
| `scripts/setup-assets.sh` | 모델 내려받기(바이트 수 검증) + wasm 복사. macOS/Linux 공용(`wc -c`) |
| `scripts/verify-all.sh` | 타입 검사, 테스트, 자산 확인, 시크릿 검사, 버전 고정 확인, 대용량 미추적 확인 |
| `src/config.ts` | 모든 상수(임계값·타임아웃 포함) |
| `src/mapping.ts` | 순수 함수: 각도, 칸, 데드존, 펼침, 지수 이동 평균, 유지 규칙, 히스테리시스 |
| `src/chords.ts` | 순수 함수: 팔레트 파싱(표기 정규화), 코드→MIDI |
| `src/hands.ts` | 순수 함수: MediaPipe 결과에서 오른손 고르기(점수·화면 안·연속성) |
| `src/output.ts` | `ChordOutput` 인터페이스 |
| `src/audio.ts` | Tone.js 구현체 `ToneOutput` (+ 컨텍스트 상태 감시·재개) |
| `src/camera.ts` | 지원 여부 확인, getUserMedia, 트랙 종료 콜백, 닫기 |
| `src/tracker.ts` | MediaPipe 래퍼(GPU→CPU 폴백) → `hands.ts` 호출 |
| `src/overlay.ts` | Canvas 그리기 + `wheelGeometry` |
| `src/main.ts` | 상태 전이, 시작 절차(자산 확인→소리→모델→카메라, 타임아웃), 프레임 루프(예외 격리·워치독), DOM 이벤트 |
| `tests/*.test.ts` | mapping, chords, hands, overlay(wheelGeometry) |
| `.claude/` | verifier·debugging 스킬, 영향 범위 훅 |
| `README.md`, `LICENSE` | 실행법, 라이선스(MIT, 저작권자 표기는 사용자 확인) |

---

### Task 1: 프로젝트 뼈대와 자산 준비

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`(임시), `src/main.ts`(임시), `scripts/setup-assets.sh`, `scripts/verify-all.sh`, `LICENSE`, `README.md`(임시)

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

- [ ] **Step 4: 임시 index.html / main.ts 작성 (Task 9에서 교체)**

`index.html`:

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

`src/main.ts`:

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

# macOS/Linux 공용 (stat -f/-c 차이를 피한다)
size_of() { if [ -f "$1" ]; then wc -c < "$1" | tr -d ' '; else echo 0; fi; }

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

size_of() { if [ -f "$1" ]; then wc -c < "$1" | tr -d ' '; else echo 0; fi; }

run() {
  local name="$1"; shift
  if "$@" >"$LOG" 2>&1; then echo "PASS: $name"; else echo "FAIL: $name"; tail -30 "$LOG"; fail=1; fi
}

run "타입 검사 (tsc --noEmit)" npx tsc --noEmit
run "단위 테스트 (vitest run)" npx vitest run

if [ "$(size_of public/models/hand_landmarker.task)" = "7819105" ]; then
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
// 모든 조정 가능한 상수. 숫자 근거는 설계 문서 3장·8장.
export const CONFIG = {
  wheel: {
    outerRadiusRatio: 0.375, // 영상 높이 대비 바깥 반지름
    restRadiusRatio: 0.07, // 중앙 쉼 원판(진입 기준)
    restExitFactor: 1.3, // 쉼 원판 이탈은 반지름 × 1.3 밖으로 나가야 함 (히스테리시스)
    labelRadiusRatio: 0.8, // 바깥 반지름 대비 글자 위치
  },
  sector: { deadZoneDeg: 3 },
  openness: {
    closedRatio: 0.8, // ASSUMPTION — Task 11에서 실측 교정
    openRatio: 1.7, // ASSUMPTION — Task 11에서 실측 교정
    muteBelowPercent: 15, // 이 미만이면 무음으로 진입
    unmuteAbovePercent: 20, // 이 이상이어야 다시 소리 (히스테리시스)
  },
  smoothing: {
    alpha: 0.5,
    resetAfterGapMs: 100, // 손이 이만큼 안 보였다 다시 나타나면 필터 초기화
  },
  hold: { lostGraceMs: 500 },
  tracker: {
    wasmPath: "/wasm",
    modelPath: "/models/hand_landmarker.task",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    minHandednessScore: 0.7, // 이 미만 점수의 손은 무시(가장자리 잘림 등)
    swapHandedness: false, // Task 11에서 실측 후 기본값 결정. 런타임 체크박스로도 바꿀 수 있음
    swapStorageKey: "hcw.swap.v1",
  },
  audio: {
    attack: 0.02,
    decay: 0.1,
    sustain: 0.8,
    release: 0.4,
    maxPolyphony: 32, // Tone 기본값. 놓은 음도 여음이 끝날 때까지 슬롯을 차지하므로 8은 부족
    lookAheadSec: 0.02,
    rampSec: 0.05,
  },
  startup: {
    assetCheckMs: 5000,
    audioMs: 3000,
    modelMs: 20000,
    cameraMs: 60000, // 권한 팝업에서 사용자가 고민하는 시간 포함
  },
  loop: { maxConsecutiveErrors: 30 }, // 약 1초 연속 실패면 ERROR
  notice: {
    defaultMs: 4000,
    leftOnlyAfterMs: 1000, // 다른 손만 1초 이상 보이면 안내
    leftOnlyRepeatMs: 5000,
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

- [ ] **Step 1: 각도·칸 테스트 작성**

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
  Hysteresis,
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
  it("팔레트가 줄어 이전 칸 번호가 범위를 벗어나면 새로 계산", () => expect(nextSector(11, 10, 6, 3)).toBe(0));
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/mapping.test.ts`
Expected: FAIL — `Failed to resolve import "../src/mapping"` 류 모듈 없음 오류.

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
 * 그 안에 있으면 prev를 유지하고 벗어나야 새 칸으로 바꾼다. prev가 범위 밖(팔레트 축소)이면 새로 계산.
 */
export function nextSector(prev: number | null, deg: number, n: number, deadZoneDeg: number): number {
  const candidate = sectorFromAngle(deg, n);
  if (prev === null || prev >= n || candidate === prev) return candidate;
  const span = 360 / n;
  const delta = ((deg - prev * span + 540) % 360) - 180; // prev 중심 기준 -180..180
  return Math.abs(delta) < span / 2 + deadZoneDeg ? prev : candidate;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/mapping.test.ts`
Expected: 각도·칸 테스트 PASS. (아직 구현하지 않은 export 때문에 import 단계에서 `does not provide an export named` 오류가 나면 Step 5~11의 구현을 먼저 채운 뒤 다시 실행한다.)

- [ ] **Step 5: 펼침·쉼 원판 테스트 추가**

`tests/mapping.test.ts` 끝에 추가:

```ts
/** 합성 손(픽셀 좌표): 손목(640,648), 손바닥 뿌리 4개 y=504, 손끝 5개는 뿌리에서 tipDist만큼 위 */
function syntheticHand(tipDist: number, scale = 1): Landmarks {
  const lm: { x: number; y: number }[] = Array.from({ length: 21 }, () => ({ x: 640, y: 576 }));
  lm[0] = { x: 640, y: 648 };
  const mcpX = [512, 602, 678, 768];
  [5, 9, 13, 17].forEach((id, i) => (lm[id] = { x: mcpX[i]!, y: 504 }));
  [4, 8, 12, 16, 20].forEach((id, i) => (lm[id] = { x: 486 + i * 77, y: 504 - tipDist }));
  return lm.map((p) => ({ x: p.x * scale, y: p.y * scale }));
}

describe("palmCenter / distance", () => {
  it("합성 손의 손바닥 중심은 (640, 532.8)", () => {
    const c = palmCenter(syntheticHand(200));
    expect(c.x).toBeCloseTo(640, 6);
    expect(c.y).toBeCloseTo(532.8, 6);
  });
  it("distance는 유클리드 거리", () => expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5));
});

describe("opennessRatio: 손 크기로 정규화한 손끝 거리", () => {
  it("편 손이 주먹보다 크다 (1.5 초과 vs 0.6 미만)", () => {
    const open = opennessRatio(syntheticHand(250));
    const fist = opennessRatio(syntheticHand(0));
    expect(open).toBeGreaterThan(1.5);
    expect(fist).toBeLessThan(0.6);
  });
  it("카메라 거리가 2배(좌표 ×0.5)여도 같은 값", () => {
    expect(opennessRatio(syntheticHand(250, 0.5))).toBeCloseTo(opennessRatio(syntheticHand(250)), 10);
  });
  it("손목과 중지 뿌리가 겹치면(크기 0) 0", () => {
    const lm = syntheticHand(200).map((p) => ({ ...p }));
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
/**
 * 손끝 5개와 손바닥 중심 거리의 평균을 손목–중지뿌리 거리로 나눈 값. 카메라 거리와 무관.
 * 반드시 등방(픽셀) 좌표로 호출한다. MediaPipe 정규화 좌표(x는 가로폭 기준, y는 세로폭 기준)로 부르면
 * 손 회전에 따라 값이 달라진다.
 */
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
Expected: PASS (Ema/HoldTracker/Hysteresis 테스트는 아직 없음).

- [ ] **Step 9: 지수 이동 평균·유지 규칙·히스테리시스 테스트 추가**

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
  it("한 번도 본 적 없으면 false, lastSeenMs는 null", () => {
    const h = new HoldTracker(500);
    expect(h.update(false, 100)).toBe(false);
    expect(h.lastSeenMs).toBeNull();
  });
  it("lastSeenMs는 마지막으로 본 시각", () => {
    const h = new HoldTracker(500);
    h.update(true, 120);
    h.update(false, 300);
    expect(h.lastSeenMs).toBe(120);
  });
  it("reset 후에는 유예 없음", () => {
    const h = new HoldTracker(500);
    h.update(true, 0);
    h.reset();
    expect(h.update(false, 100)).toBe(false);
  });
});

describe("Hysteresis: 켜짐 enter 이상, 꺼짐 exit 이하", () => {
  it("소리: 20% 이상에서 켜지고 15% 미만에서 꺼진다", () => {
    const s = new Hysteresis(20, 15);
    expect(s.update(14)).toBe(false);
    expect(s.update(17)).toBe(false); // 아직 enter(20) 미만
    expect(s.update(21)).toBe(true);
    expect(s.update(17)).toBe(true); // exit(15) 이상이라 유지
    expect(s.update(14.9)).toBe(false);
  });
  it("쉼 원판 밖 판정: 65.5px 이상에서 '밖', 50.4px 미만에서 '안'", () => {
    const outside = new Hysteresis(65.5, 50.4);
    expect(outside.update(60)).toBe(false); // 처음엔 안
    expect(outside.update(70)).toBe(true);
    expect(outside.update(55)).toBe(true); // 애매 구간은 유지
    expect(outside.update(50)).toBe(false);
  });
  it("reset(초기값)", () => {
    const s = new Hysteresis(20, 15);
    s.update(30);
    s.reset();
    expect(s.active).toBe(false);
  });
});
```

- [ ] **Step 10: 실패 확인**

Run: `npx vitest run tests/mapping.test.ts`
Expected: FAIL — `Ema`, `HoldTracker`, `Hysteresis` export 없음.

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
  get lastSeenMs(): number | null {
    return this.lastSeen;
  }
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

/** 두 임계값 히스테리시스. value ≥ enter 이면 켜지고, value < exit 이면 꺼진다 (enter > exit). */
export class Hysteresis {
  private on = false;
  constructor(
    private readonly enter: number,
    private readonly exit: number,
  ) {}
  get active(): boolean {
    return this.on;
  }
  update(value: number): boolean {
    if (this.on) {
      if (value < this.exit) this.on = false;
    } else if (value >= this.enter) {
      this.on = true;
    }
    return this.on;
  }
  reset(initial = false): void {
    this.on = initial;
  }
}
```

- [ ] **Step 12: 전체 통과 확인**

Run: `npx vitest run tests/mapping.test.ts`
Expected: 모두 PASS, 실패 0.

- [ ] **Step 13: Commit**

```bash
git add src/mapping.ts tests/mapping.test.ts
git commit -m "feat: 매핑 순수 함수(각도→칸, 데드존, 펼침%, EMA, 유지 규칙, 히스테리시스) + 테스트

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
  it("유효한 코드는 항상 1음 이상", () => {
    for (const [s] of EXPECTED) expect(chordToMidi(s).length).toBeGreaterThan(0);
  });
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
  it("공백 구분 12개 통과, 표기 그대로 유지", () => {
    const r = parsePalette(DEFAULT, 6, 16);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chords).toEqual(DEFAULT.split(" "));
  });
  it("쉼표·연속 공백·앞뒤 공백 허용", () => {
    const r = parsePalette("  B, Em6,  A9 D#7 ,G#m A ", 6, 16);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chords).toEqual(["B", "Em6", "A9", "D#7", "G#m", "A"]);
  });
  it("소문자 근음은 표준 표기로 정규화 (em6 → Em6, bb → Bb)", () => {
    const r = parsePalette("em6 a9 bb Bbmaj7 f#7sus4 G", 6, 16);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chords).toEqual(["Em6", "A9", "Bb", "Bbmaj7", "F#7sus4", "G"]);
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

/** 공백/쉼표로 구분된 팔레트 문자열 검사. 통과한 기호는 tonal의 표준 표기(Chord.get().symbol)로 정규화한다. */
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
  const chords = tokens.map((t) => Chord.get(t).symbol || t);
  return { ok: true, chords };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/chords.test.ts`
Expected: 전부 PASS. 12개 MIDI 배열 중 하나라도 다르면 `npm ls tonal`로 6.4.3인지 확인한다.

- [ ] **Step 5: Commit**

```bash
git add src/chords.ts tests/chords.test.ts
git commit -m "feat: 코드 이름→MIDI 변환과 팔레트 파싱(표기 정규화) + 테스트

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
  /** 사용자 클릭 핸들러 안에서 동기적으로 호출을 시작해야 한다(브라우저 오디오 정책). */
  start(): Promise<void>;
  /** 들고 있던 음을 놓고 새 화음을 바로 친다. 빈 배열이면 놓기만 한다. */
  play(midi: readonly number[]): void;
  /** 0~1 음량. */
  setLevel(level: number): void;
  /** 들고 있던 음을 놓는다. */
  stop(): void;
  /** 출력 장치가 실제로 소리를 낼 수 있는 상태인가 */
  isRunning(): boolean;
  /** 일시중지된 출력을 다시 켠다(사용자 제스처 안에서 호출) */
  resume(): Promise<void>;
  /** 실행 가능 상태가 바뀔 때 알림 */
  onStateChange(cb: (running: boolean) => void): void;
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
```

- [ ] **Step 3: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 출력 없음. 옵션 타입 오류가 나면 **먼저** `node_modules/tone/build/esm/instrument/PolySynth.d.ts` 82~83행(생성자 오버로드)과 `core/context/BaseContext.d.ts` 11행(`Emitter<"statechange" | "tick">`)을 읽고 맞춘다(기억으로 고치지 말 것).

- [ ] **Step 4: Commit**

```bash
git add src/output.ts src/audio.ts
git commit -m "feat: ChordOutput 인터페이스와 Tone.js 구현(ToneOutput, 컨텍스트 상태 감시)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 카메라

**Files:**
- Create: `src/camera.ts`

- [ ] **Step 1: 작성**

```ts
/** 보안 컨텍스트·API 지원 여부. 실패하면 한국어 메시지를 가진 Error를 던진다(접두어 UNSUPPORTED). */
export function assertCameraSupported(): void {
  if (!window.isSecureContext) {
    throw new Error("UNSUPPORTED: 이 주소에서는 카메라를 쓸 수 없습니다.\nChrome에서 http://127.0.0.1:5173 또는 http://localhost:5173 로 여세요");
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    throw new Error("UNSUPPORTED: 이 브라우저는 카메라 API를 지원하지 않습니다. Chrome을 사용하세요");
  }
}

/**
 * 전면 카메라를 열어 video에 연결하고 재생까지 기다린다. 거울 표시는 CSS(scaleX(-1))가 맡는다.
 * 이미 열린 스트림이 있으면 먼저 닫는다(재시도 누수 방지). 트랙이 끝나면(뽑힘·다른 앱 점유) onEnded를 1회 부른다.
 */
export async function openCamera(video: HTMLVideoElement, onEnded: () => void): Promise<void> {
  stopCamera(video);
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
      facingMode: "user",
    },
    audio: false,
  });
  const track = stream.getVideoTracks()[0];
  track?.addEventListener("ended", onEnded, { once: true });
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
git commit -m "feat: 카메라 지원 확인, 열기(트랙 종료 콜백), 닫기

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 오른손 고르기(순수, TDD)와 MediaPipe 래퍼

**Files:**
- Create: `src/hands.ts`, `src/tracker.ts`
- Test: `tests/hands.test.ts`

- [ ] **Step 1: selectRightHand 테스트 작성**

`tests/hands.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectRightHand } from "../src/hands";

/** 21개 랜드마크를 모두 (x, 0.5)에 둔 가짜 손. visibility는 MediaPipe 타입과 맞추기 위해 둔다. */
const lm = (x: number) => Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0, visibility: 1 }));
const cat = (name: "Left" | "Right", score: number) => [{ categoryName: name, score, index: 0, displayName: "" }];
const OPTS = { swap: false, minScore: 0.7, prevPalm: null };

describe("selectRightHand", () => {
  it("두 손 중 Right 라벨 손을 고르고, 나머지는 otherPalms에", () => {
    const r = selectRightHand({ landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Left", 0.94), cat("Right", 0.96)] }, OPTS);
    expect(r.chosen?.score).toBe(0.96);
    expect(r.chosen?.palm.x).toBeCloseTo(0.8, 6);
    expect(r.otherPalms).toHaveLength(1);
    expect(r.labels).toEqual(["Left:0.94", "Right:0.96"]);
  });
  it("swap=true면 Left 라벨 손을 고른다", () => {
    const r = selectRightHand({ landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Left", 0.94), cat("Right", 0.96)] }, { ...OPTS, swap: true });
    expect(r.chosen?.palm.x).toBeCloseTo(0.2, 6);
  });
  it("Right가 없으면 chosen null, 라벨은 남는다", () => {
    const r = selectRightHand({ landmarks: [lm(0.2)], handedness: [cat("Left", 0.9)] }, OPTS);
    expect(r.chosen).toBeNull();
    expect(r.labels).toEqual(["Left:0.90"]);
  });
  it("손이 없으면 전부 비어 있다", () => {
    expect(selectRightHand({ landmarks: [], handedness: [] }, OPTS)).toEqual({ chosen: null, otherPalms: [], labels: [] });
  });
  it("점수 0.7 미만은 무시", () => {
    const r = selectRightHand({ landmarks: [lm(0.5)], handedness: [cat("Right", 0.55)] }, OPTS);
    expect(r.chosen).toBeNull();
  });
  it("손바닥 중심이 화면 밖(x>1)이면 무시", () => {
    const r = selectRightHand({ landmarks: [lm(1.2)], handedness: [cat("Right", 0.95)] }, OPTS);
    expect(r.chosen).toBeNull();
  });
  it("오른손이 둘이면 직전 위치에 가까운 손", () => {
    const r = selectRightHand(
      { landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Right", 0.9), cat("Right", 0.99)] },
      { ...OPTS, prevPalm: { x: 0.25, y: 0.5 } },
    );
    expect(r.chosen?.palm.x).toBeCloseTo(0.2, 6);
    expect(r.otherPalms).toHaveLength(1);
  });
  it("오른손이 둘이고 직전 위치가 없으면 점수 높은 손", () => {
    const r = selectRightHand({ landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Right", 0.9), cat("Right", 0.99)] }, OPTS);
    expect(r.chosen?.palm.x).toBeCloseTo(0.8, 6);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/hands.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: hands.ts 구현 (MediaPipe를 import하지 않는 순수 모듈)**

```ts
import { distance, palmCenter, type Point } from "./mapping";

export interface LandmarkLike {
  readonly x: number;
  readonly y: number;
}
/** MediaPipe HandLandmarkerResult의 구조적 최소 타입 */
export interface HandsLike {
  landmarks: ReadonlyArray<ReadonlyArray<LandmarkLike>>;
  handedness: ReadonlyArray<ReadonlyArray<{ categoryName: string; score: number }>>;
}
export interface ChosenHand {
  landmarks: ReadonlyArray<LandmarkLike>;
  score: number;
  /** 정규화 좌표(0~1) 손바닥 중심 */
  palm: Point;
}
export interface HandSelection {
  chosen: ChosenHand | null;
  /** 선택되지 않은 손들의 손바닥 중심(정규화) — 화면에 회색 점으로 표시 */
  otherPalms: Point[];
  /** 디버그/안내용 라벨 "Right:0.96" */
  labels: string[];
}
export interface SelectOptions {
  swap: boolean;
  minScore: number;
  prevPalm: Point | null;
}

/**
 * handedness 라벨이 "Right"(swap이면 "Left")이고 점수가 충분하며 손바닥이 화면 안인 손을 고른다.
 * 후보가 여럿이면 직전 손바닥 위치에 가장 가까운 손, 직전 위치가 없으면 점수가 높은 손.
 */
export function selectRightHand(result: HandsLike, opts: SelectOptions): HandSelection {
  const wanted = opts.swap ? "Left" : "Right";
  const labels: string[] = [];
  const candidates: ChosenHand[] = [];
  const otherPalms: Point[] = [];

  for (let i = 0; i < result.handedness.length; i++) {
    const cat = result.handedness[i]?.[0];
    const lm = result.landmarks[i];
    if (!cat || !lm || lm.length < 21) continue;
    labels.push(`${cat.categoryName}:${cat.score.toFixed(2)}`);
    const palm = palmCenter(lm);
    const inside = palm.x >= 0 && palm.x <= 1 && palm.y >= 0 && palm.y <= 1;
    if (cat.categoryName === wanted && cat.score >= opts.minScore && inside) {
      candidates.push({ landmarks: lm, score: cat.score, palm });
    } else {
      otherPalms.push(palm);
    }
  }

  const first = candidates[0];
  if (!first) return { chosen: null, otherPalms, labels };
  let chosen = first;
  if (candidates.length > 1) {
    const prev = opts.prevPalm;
    chosen = prev
      ? candidates.reduce((a, b) => (distance(b.palm, prev) < distance(a.palm, prev) ? b : a))
      : candidates.reduce((a, b) => (b.score > a.score ? b : a));
    for (const c of candidates) if (c !== chosen) otherPalms.push(c.palm);
  }
  return { chosen, otherPalms, labels };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/hands.test.ts`
Expected: 8 passed.

- [ ] **Step 5: tracker.ts 작성**

```ts
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { CONFIG } from "./config";
import { selectRightHand, type HandSelection } from "./hands";
import type { Point } from "./mapping";

export type Delegate = "GPU" | "CPU";
type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
const EMPTY: HandSelection = { chosen: null, otherPalms: [], labels: [] };

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private lastTs = -1;
  delegate: Delegate = "GPU";

  /** wasm·모델 로드. GPU delegate 실패 시 CPU로 한 번 더 시도. 둘 다 실패하면 두 번째 예외를 던진다. */
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

  /** 현재 비디오 프레임에서 오른손 고르기. 타임스탬프는 단조 증가해야 한다. */
  detect(video: HTMLVideoElement, nowMs: number, opts: { swap: boolean; prevPalm: Point | null }): HandSelection {
    if (!this.landmarker) return EMPTY;
    const ts = Math.max(Math.floor(nowMs), this.lastTs + 1);
    this.lastTs = ts;
    const result = this.landmarker.detectForVideo(video, ts);
    return selectRightHand(result, { swap: opts.swap, minScore: CONFIG.tracker.minHandednessScore, prevPalm: opts.prevPalm });
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
```

- [ ] **Step 6: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 출력 없음. (`HandLandmarkerResult`가 `HandsLike`에 구조적으로 대입 가능해야 한다. 오류가 나면 `node_modules/@mediapipe/tasks-vision/vision.d.ts`의 `HandLandmarkerResult`·`Category`·`NormalizedLandmark`를 읽고 `HandsLike`를 맞춘다.)

- [ ] **Step 7: Commit**

```bash
git add src/hands.ts src/tracker.ts tests/hands.test.ts
git commit -m "feat: 오른손 선택 순수 함수(점수·화면 안·연속성) + MediaPipe 래퍼(GPU→CPU 폴백) + 테스트

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
  it("바깥 반지름 270, 쉼 원판 50.4(이탈 65.52), 글자 216", () => {
    expect(g.outerR).toBeCloseTo(270, 6);
    expect(g.restR).toBeCloseTo(50.4, 6);
    expect(g.restExitR).toBeCloseTo(65.52, 6);
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
  restExitR: number;
  labelR: number;
}

export function wheelGeometry(width: number, height: number): WheelGeometry {
  const outerR = height * CONFIG.wheel.outerRadiusRatio;
  const restR = height * CONFIG.wheel.restRadiusRatio;
  return {
    cx: width / 2,
    cy: height / 2,
    outerR,
    restR,
    restExitR: restR * CONFIG.wheel.restExitFactor,
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
  otherPalms: Point[]; // 선택되지 않은 손(회색 점)
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

/** roundRect 미지원 브라우저 폴백 */
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

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

  // 선택되지 않은 손: 회색 점
  ctx.fillStyle = "rgba(200,200,200,0.5)";
  for (const p of s.otherPalms) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // 선택된 손: 손끝 5개와 손바닥 중심
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
  roundedRect(ctx, x, y, w, h, 8);
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
  const lines = text.split("\n");
  const boxH = Math.max(H * 0.16, lines.length * H * 0.045 + H * 0.06);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, H / 2 - boxH / 2, W, boxH);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(H * 0.03)}px system-ui, sans-serif`;
  lines.forEach((line, i) => ctx.fillText(line, W / 2, H / 2 + (i - (lines.length - 1) / 2) * H * 0.045));
}
```

- [ ] **Step 4: 통과 + 타입 검사**

Run: `npx vitest run tests/overlay.test.ts && npx tsc --noEmit`
Expected: 2 passed, tsc 출력 없음. (`ctx.roundRect` 타입은 TypeScript 5.9.3 lib.dom.d.ts에 있음을 확인했다.)

- [ ] **Step 5: Commit**

```bash
git add src/overlay.ts tests/overlay.test.ts
git commit -m "feat: 휠·HUD·음량 막대·다른 손 표시 Canvas 그리기 + 기하 테스트

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
      #stage { width: 100vw; height: 100vh; display: grid; place-items: center; background: #000; overflow: hidden; }
      /* 비디오 비율의 프레임. 버튼·입력도 이 안에 두어 캔버스와 같은 박스를 공유한다 */
      #frame { position: relative; aspect-ratio: 16 / 9; width: min(100vw, calc(100vh * 16 / 9)); }
      #video, #overlay { position: absolute; inset: 0; width: 100%; height: 100%; }
      #video { transform: scaleX(-1); object-fit: cover; } /* 거울 표시. 캔버스는 좌표를 1-x로 바꿔 그린다 */
      .btn { border: 1px solid rgba(255,255,255,0.35); background: rgba(0,0,0,0.55); color: #fff; font: 600 14px system-ui; padding: 8px 14px; border-radius: 8px; cursor: pointer; }
      .btn:disabled { opacity: 0.5; cursor: default; }
      .btn:focus-visible { outline: 2px solid var(--accent); }
      #reset { position: absolute; z-index: 2; top: 16px; right: 16px; }
      #bottom { position: absolute; z-index: 2; left: 16px; right: 56px; bottom: 44px; display: flex; gap: 8px; align-items: center; }
      #palette { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.35); background: rgba(0,0,0,0.55); color: #fff; font: 500 14px ui-monospace, monospace; }
      #palette.invalid { border-color: #ff8a80; }
      #swap-label { display: flex; align-items: center; gap: 6px; font: 500 13px system-ui; white-space: nowrap; background: rgba(0,0,0,0.55); padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.35); }
      #palette-msg { position: absolute; z-index: 2; left: 16px; bottom: 84px; font: 500 13px system-ui; color: #9fe3a1; }
      #palette-msg.error { color: #ff8a80; }
      #start { font-size: 15px; }
    </style>
  </head>
  <body>
    <div id="stage">
      <div id="frame">
        <video id="video" playsinline muted></video>
        <canvas id="overlay"></canvas>
        <button id="reset" class="btn" type="button">Reset</button>
        <div id="palette-msg"></div>
        <div id="bottom">
          <input id="palette" type="text" spellcheck="false" autocomplete="off" aria-label="코드 팔레트" />
          <label id="swap-label"><input id="swap" type="checkbox" /> 좌우 바꾸기</label>
          <button id="start" class="btn" type="button">Start</button>
        </div>
      </div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: main.ts 교체**

```ts
import { CONFIG } from "./config";
import { assertCameraSupported, openCamera, stopCamera } from "./camera";
import { HandTracker } from "./tracker";
import { ToneOutput } from "./audio";
import { chordToMidi, parsePalette } from "./chords";
import {
  angleDeg,
  nextSector,
  palmCenter,
  opennessRatio,
  opennessPercent,
  distance,
  Ema,
  HoldTracker,
  Hysteresis,
  TIP_IDS,
  type Point,
} from "./mapping";
import { drawScene, wheelGeometry, type Scene, type HandView } from "./overlay";

type State = "IDLE" | "STARTING" | "READY" | "PLAYING" | "ERROR";

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 요소가 없습니다`);
  return el as T;
}

const frame = $<HTMLDivElement>("frame");
const video = $<HTMLVideoElement>("video");
const canvas = $<HTMLCanvasElement>("overlay");
const startBtn = $<HTMLButtonElement>("start");
const resetBtn = $<HTMLButtonElement>("reset");
const paletteInput = $<HTMLInputElement>("palette");
const paletteMsg = $<HTMLElement>("palette-msg");
const swapInput = $<HTMLInputElement>("swap");
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
const sounding = new Hysteresis(CONFIG.openness.unmuteAbovePercent, CONFIG.openness.muteBelowPercent);
let outsideRest: Hysteresis | null = null; // 반지름은 영상 크기에 따라 resize()에서 만든다

let state: State = "IDLE";
let palette: string[] = [...CONFIG.palette.default];
let midiByIndex: number[][] = palette.map(chordToMidi);
let swap: boolean = CONFIG.tracker.swapHandedness;
let currentSector: number | null = null; // 소리가 나고 있는 칸
let shownSector: number | null = null; // 화면에 표시 중인 칸(무음이어도)
let handView: HandView | null = null;
let otherPalms: Point[] = [];
let prevPalmNorm: Point | null = null; // 직전 손바닥(정규화) — 두 오른손 중 연속성 선택용
let openPercent = 0;
let level = 0;
let lastRatio = 0;
let armed = true; // Reset 뒤에는 손이 한 번 사라지거나 쉼 원판을 지나야 다시 소리
let audioSuspended = false;
let message: string | null = "Start를 누르면 카메라와 소리가 켜집니다";
let notice: string | null = null;
let noticeUntil = 0;
let lastVideoTime = -1;
let lastFrameAt = 0;
let consecutiveErrors = 0;
let otherOnlySince: number | null = null;
let lastOtherNotice = -Infinity;
let labelsForDebug: string[] = [];
let paletteMsgTimer: number | null = null;
const frameTimes: number[] = [];

function setState(s: State): void {
  state = s;
}

function showNotice(text: string, ms: number = CONFIG.notice.defaultMs): void {
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

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`TIMEOUT: ${what}가 ${ms} ms 안에 끝나지 않았습니다`)), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

// ── 팔레트 ──────────────────────────────────────────────
function applyPalette(chords: string[]): void {
  palette = chords;
  midiByIndex = palette.map(chordToMidi);
  shownSector = null;
  silence();
}

function setPaletteMsg(text: string, isError: boolean): void {
  paletteMsg.textContent = text;
  paletteMsg.classList.toggle("error", isError);
  if (paletteMsgTimer !== null) window.clearTimeout(paletteMsgTimer);
  paletteMsgTimer = window.setTimeout(() => {
    paletteMsg.textContent = "";
    paletteMsgTimer = null;
  }, CONFIG.notice.defaultMs);
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
    paletteInput.classList.add("invalid");
    setPaletteMsg(parsed.invalid.length ? `${parsed.reason}: ${parsed.invalid.join(", ")}` : parsed.reason, true);
    return;
  }
  paletteInput.classList.remove("invalid");
  setPaletteMsg(`${parsed.chords.length}개 코드 적용`, false);
  applyPalette(parsed.chords);
  paletteInput.value = parsed.chords.join(" ");
  try {
    localStorage.setItem(CONFIG.palette.storageKey, parsed.chords.join(" "));
  } catch {
    /* 저장 실패는 무시 */
  }
});

// 거부된 입력은 포커스를 잃을 때 현재 팔레트로 되돌려 화면과 입력창이 어긋나지 않게 한다
paletteInput.addEventListener("blur", () => {
  if (paletteInput.classList.contains("invalid")) {
    paletteInput.value = palette.join(" ");
    paletteInput.classList.remove("invalid");
  }
});

// ── 좌우 바꾸기 ──────────────────────────────────────────
function loadSwap(): void {
  try {
    const saved = localStorage.getItem(CONFIG.tracker.swapStorageKey);
    if (saved === "1" || saved === "0") swap = saved === "1";
  } catch {
    /* 무시 */
  }
  swapInput.checked = swap;
}

swapInput.addEventListener("change", () => {
  swap = swapInput.checked;
  prevPalmNorm = null;
  try {
    localStorage.setItem(CONFIG.tracker.swapStorageKey, swap ? "1" : "0");
  } catch {
    /* 무시 */
  }
});

// ── 시작 / 리셋 / 오류 ──────────────────────────────────
function describeError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  const text = e instanceof Error ? e.message : e instanceof Event ? `리소스 로드 실패 (${e.type})` : String(e);
  for (const prefix of ["UNSUPPORTED: ", "ASSET_MISSING: ", "TIMEOUT: ", "AUDIO: "]) {
    if (text.startsWith(prefix)) return text.slice(prefix.length);
  }
  if (name === "NotAllowedError") return "카메라 권한이 거부되었습니다.\n주소창 왼쪽 아이콘 → 카메라 → 허용 후 '다시 시도'";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "카메라를 찾을 수 없습니다. 연결을 확인하세요.";
  if (name === "NotReadableError") return "다른 앱이 카메라를 쓰고 있습니다. 그 앱을 닫고 '다시 시도'";
  return `시작 실패: ${text}`;
}

/** 모델·wasm 파일이 서버에 있는지 HEAD로 확인. 없으면 결정적인 메시지로 실패한다. */
async function checkAssets(): Promise<void> {
  const urls = [CONFIG.tracker.modelPath, `${CONFIG.tracker.wasmPath}/vision_wasm_internal.wasm`];
  for (const u of urls) {
    const r = await fetch(u, { method: "HEAD" });
    if (!r.ok) throw new Error(`ASSET_MISSING: ${u} 를 찾지 못했습니다 (HTTP ${r.status}).\n터미널에서 npm run setup 실행 후 새로고침`);
  }
}

function resize(): void {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;
  frame.style.aspectRatio = `${w} / ${h}`;
  frame.style.width = `min(100vw, calc(100vh * ${w} / ${h}))`;
  const g = wheelGeometry(w, h);
  outsideRest = new Hysteresis(g.restExitR, g.restR);
}

function enterError(text: string): void {
  silence();
  handView = null;
  otherPalms = [];
  shownSector = null;
  stopCamera(video);
  setState("ERROR");
  message = text;
  startBtn.disabled = false;
  startBtn.textContent = "다시 시도";
  startBtn.focus();
}

function onCameraEnded(): void {
  if (state === "ERROR" || state === "IDLE") return;
  enterError("카메라 연결이 끊어졌습니다(뽑힘 또는 다른 앱이 사용 중).\n'다시 시도'를 누르세요");
}

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  setState("STARTING");
  // 사용자 제스처 컨텍스트 안에서 동기적으로 시작. 거부는 아래 await에서 받되, 그 전에 다른 단계가 실패해도 미처리 거부가 남지 않게 한다.
  const audioReady = output.start().catch((e: unknown) => {
    throw new Error(`AUDIO: 소리를 켤 수 없습니다 (${e instanceof Error ? e.message : String(e)})`);
  });
  audioReady.catch(() => {});
  try {
    assertCameraSupported();
    message = "파일 확인 중…";
    await withTimeout(checkAssets(), CONFIG.startup.assetCheckMs, "자산 확인");
    message = "소리 켜는 중…";
    await withTimeout(audioReady, CONFIG.startup.audioMs, "소리 켜기");
    message = "손 추적 모델 불러오는 중…";
    const delegate = await withTimeout(tracker.init(), CONFIG.startup.modelMs, "모델 로드");
    message = "카메라 여는 중… (권한을 허용해 주세요)";
    await withTimeout(openCamera(video, onCameraEnded), CONFIG.startup.cameraMs, "카메라 열기");
    resize();
    message = null;
    lastVideoTime = -1;
    lastFrameAt = performance.now();
    consecutiveErrors = 0;
    setState("READY");
    startBtn.textContent = "실행 중";
    if (delegate === "CPU") showNotice("GPU 모드 실패 → CPU 모드(느림, 약 107 ms/프레임)", 6000);
    if (!output.isRunning()) {
      audioSuspended = true;
      showNotice("소리가 아직 꺼져 있습니다. 화면을 한 번 클릭하세요", 6000);
    }
  } catch (e) {
    console.error(e);
    tracker.close();
    enterError(describeError(e));
  }
});

resetBtn.addEventListener("click", () => {
  silence();
  shownSector = null;
  handView = null;
  otherPalms = [];
  prevPalmNorm = null;
  hold.reset();
  resetFilters();
  sounding.reset();
  outsideRest?.reset();
  openPercent = 0;
  armed = false;
  if (state === "READY") showNotice("초기화됨 — 손을 내렸다 올리면 다시 소리가 납니다", 3000);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) silence();
});

// 오디오 컨텍스트가 멈추면(절전 복귀·출력 장치 전환) 안내하고, 다음 클릭/키에서 재개
output.onStateChange((running) => {
  audioSuspended = !running;
  if (!running && (state === "READY" || state === "PLAYING")) {
    silence();
    showNotice("오디오가 일시중지되었습니다. 화면을 클릭하면 다시 켜집니다", 8000);
  }
});
async function resumeAudioIfNeeded(): Promise<void> {
  if (!audioSuspended) return;
  try {
    await output.resume();
    if (output.isRunning()) {
      audioSuspended = false;
      showNotice("소리 켜짐", 1500);
    }
  } catch (e) {
    console.warn("오디오 재개 실패", e);
  }
}
document.addEventListener("pointerdown", () => void resumeAudioIfNeeded());
document.addEventListener("keydown", () => void resumeAudioIfNeeded());

// ── 프레임 처리 ──────────────────────────────────────────
function processFrame(now: number): void {
  const W = canvas.width;
  const H = canvas.height;
  const geo = wheelGeometry(W, H);
  const center: Point = { x: geo.cx, y: geo.cy };

  const sel = tracker.detect(video, now, { swap, prevPalm: prevPalmNorm });
  labelsForDebug = sel.labels;
  otherPalms = sel.otherPalms.map((p) => ({ x: (1 - p.x) * W, y: p.y * H }));
  const hand = sel.chosen;

  // 다른 손만 보일 때 안내 (1초 이상 지속, 5초에 한 번)
  if (!hand && sel.labels.length > 0) {
    otherOnlySince ??= now;
    if (now - otherOnlySince > CONFIG.notice.leftOnlyAfterMs && now - lastOtherNotice > CONFIG.notice.leftOnlyRepeatMs) {
      showNotice("오른손이 보이지 않습니다(다른 손만 감지). 오른손을 들거나 '좌우 바꾸기'를 켜 보세요", 3000);
      lastOtherNotice = now;
    }
  } else {
    otherOnlySince = null;
  }

  const prevSeen = hold.lastSeenMs;
  const present = hold.update(hand !== null, now);

  if (hand) {
    // 잠깐(≤100ms) 끊긴 건 연속으로 보고, 더 길게 사라졌다 나타나면 필터를 초기화해 이전 위치에서 끌려오지 않게 한다
    if (prevSeen !== null && now - prevSeen > CONFIG.smoothing.resetAfterGapMs) resetFilters();
    prevPalmNorm = hand.palm;

    // 거울 표시 좌표(픽셀)로 변환: x → (1 - x). 펼침 비율도 이 등방 좌표로 계산한다
    const pts: Point[] = hand.landmarks.map((l) => ({ x: (1 - l.x) * W, y: l.y * H }));
    const rawPalm = palmCenter(pts);
    const palm: Point = { x: emaX.next(rawPalm.x), y: emaY.next(rawPalm.y) };
    const ratio = emaRatio.next(opennessRatio(pts));
    lastRatio = ratio;
    openPercent = opennessPercent(ratio, CONFIG.openness.closedRatio, CONFIG.openness.openRatio);
    handView = { palm, tips: TIP_IDS.map((i) => pts[i] ?? palm) };

    const isOutside = outsideRest ? outsideRest.update(distance(center, palm)) : true;
    if (!isOutside) {
      shownSector = null;
      armed = true;
      silence();
      return;
    }
    const deg = angleDeg(center, palm);
    const sector = nextSector(shownSector, deg, palette.length, CONFIG.sector.deadZoneDeg);
    shownSector = sector;

    if (!sounding.update(openPercent) || !armed) {
      silence();
      return;
    }
    const midi = midiByIndex[sector] ?? [];
    if (midi.length === 0) {
      silence();
      return;
    }
    if (state !== "PLAYING" || sector !== currentSector) {
      output.play(midi);
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
    prevPalmNorm = null;
    openPercent = 0;
    armed = true;
    resetFilters();
    sounding.reset();
    outsideRest?.reset();
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
  const active = state === "READY" || state === "PLAYING";
  const scene: Scene = {
    width: canvas.width,
    height: canvas.height,
    palette,
    selected: shownSector,
    hand: handView,
    otherPalms,
    openPercent,
    level,
    muted: state !== "PLAYING",
    fps: active ? fpsNow(now) : 0,
    delegate: active ? tracker.delegate : null,
    message,
    notice,
    debug: debug ? `ratio ${lastRatio.toFixed(2)} | ${labelsForDebug.join(" ") || "no hand"} | ${state}${armed ? "" : " (Reset 대기)"}` : null,
  };
  drawScene(ctx, scene);
}

function loop(now: number): void {
  try {
    const active = state === "READY" || state === "PLAYING";
    if (active) {
      if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        lastFrameAt = now;
        processFrame(now);
        frameTimes.push(now);
      } else if (state === "PLAYING" && now - lastFrameAt > CONFIG.hold.lostGraceMs) {
        // 워치독: 영상이 멈추면(트랙 종료·절전·다른 앱) 프레임 없이도 500ms 안에 끈다
        handView = null;
        shownSector = null;
        silence();
        showNotice("영상이 멈춰 소리를 껐습니다", 3000);
      }
    }
    consecutiveErrors = 0;
  } catch (e) {
    consecutiveErrors++;
    console.error(e);
    silence();
    if (consecutiveErrors >= CONFIG.loop.maxConsecutiveErrors) {
      tracker.close();
      enterError(`처리 중 오류가 반복됩니다.\n${describeError(e)}`);
    }
  }
  try {
    draw(now);
  } catch (e) {
    console.error(e);
  }
  requestAnimationFrame(loop);
}

// ── 부팅 ────────────────────────────────────────────────
resize();
loadPalette();
loadSwap();
try {
  assertCameraSupported();
} catch (e) {
  message = describeError(e);
  startBtn.disabled = true;
}
if (/Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent)) {
  showNotice("Safari는 테스트되지 않았습니다. Chrome을 권장합니다", 6000);
}
requestAnimationFrame(loop);
```

- [ ] **Step 3: 타입 검사와 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc 출력 없음, 테스트 전부 PASS.

- [ ] **Step 4: 실행해서 눈으로 확인**

Run: `npm run dev` 후 Chrome에서 `http://127.0.0.1:5173` 열기.
확인 순서:
1. 휠과 12개 코드 이름이 보이고 글자가 뒤집히지 않는다. 창 크기를 바꿔도 Reset·입력창이 영상 프레임 안에 머문다.
2. Start → 중앙 메시지가 "파일 확인 중 → 소리 켜는 중 → 모델 불러오는 중 → 카메라 여는 중" 순서로 바뀌고 카메라 허용 뒤 거울 영상 위에 휠.
3. 오른손을 들면 손끝 점 5개와 파란 손바닥 점이 **손 위치와 일치**한다(좌우가 어긋나면 `1 - l.x` 변환을 의심). 왼손을 들면 회색 점 1개가 찍히고 1초 뒤 상단에 안내.
4. 손을 1시 방향에 두면 Em6 칸이 파랗게 되고 소리가 난다. 주먹을 쥐면 멈추고, 다시 펴면(20% 이상) 난다.
5. 손을 12칸 한 바퀴 2초 안에 훑어도 콘솔에 "Max polyphony exceeded" 경고가 없다.
6. 좌하단에 `~30 fps · GPU`.
7. `?debug=1`로 열면 좌하단에 `ratio 1.xx | Right:0.9x | PLAYING`.
8. 연주 중 카메라를 손으로 완전히 가리거나(손 소실) Zoom 등으로 카메라를 뺏으면 0.5초 안에 무음. 뺏긴 경우 "카메라 연결이 끊어졌습니다" + '다시 시도'.
9. `public/wasm`을 잠시 다른 이름으로 바꾸고 새로고침 → Start → "…vision_wasm_internal.wasm 를 찾지 못했습니다 (HTTP 404)" 메시지. 원래대로 되돌리고 '다시 시도'로 복구.

문제가 있으면 멈추고 증상·콘솔 오류를 기록한다(Task 11에서 handedness·보정값을 다룬다).

- [ ] **Step 5: Commit**

```bash
git add index.html src/main.ts
git commit -m "feat: 화면 구성과 상태 전이(시작 절차 타임아웃, 루프 예외 격리, 워치독, 히스테리시스, 좌우 바꾸기)

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
  src/mapping.ts) echo "[impact] mapping.ts → 코드 선택(각도·데드존)·펼침%·히스테리시스·유지 규칙 전부. tests/mapping.test.ts 실행, 칸 경계·쉼 원판·15/20% 경계 깜빡임 수동 확인" ;;
  src/chords.ts) echo "[impact] chords.ts → 팔레트 파싱·표기 정규화·MIDI 번호. tests/chords.test.ts 실행, 12개 기본 코드 소리 확인" ;;
  src/hands.ts) echo "[impact] hands.ts → 오른손 선택(점수·화면 안·연속성). tests/hands.test.ts 실행, 두 손 동시 노출 수동 확인" ;;
  src/audio.ts|src/output.ts) echo "[impact] 소리 출력 → ChordOutput 인터페이스 변경 시 2차 midiOut.ts 호환 확인, 코드 전환 시 release→attack, maxPolyphony 32 유지, 절전 복귀 재개" ;;
  src/tracker.ts) echo "[impact] 손 추적 → GPU→CPU 폴백 확인, 타임스탬프 단조 증가" ;;
  src/camera.ts) echo "[impact] 카메라 → 재시도 시 이전 스트림 정리, 트랙 ended 콜백, 비보안 컨텍스트 메시지" ;;
  src/config.ts) echo "[impact] 상수 → 보정값(closed/open)·데드존·유예·타임아웃 변경 시 수동 합격 기준 재수행" ;;
  src/main.ts) echo "[impact] 상태 전이 → 수동 합격 기준 전부 재수행(fps≥25, 경계 5초 불변, 주먹 100ms 무음, Reset, 손 이탈 0.5초, 카메라 뺏김 0.5초, 12칸 훑기 Note dropped 없음)" ;;
  src/overlay.ts|index.html) echo "[impact] 화면 → 거울 좌표(x→1-x) 일치, HUD 글자 반전 여부, 프레임 비율, tests/overlay.test.ts" ;;
  scripts/setup-assets.sh|scripts/verify-all.sh|.gitignore) echo "[impact] 자산/검증 → 새 clone에서 npm run setup 재검증, macOS/Linux 공용(wc -c), public/models·public/wasm 미추적 확인" ;;
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
- 주먹 쥐면 100 ms 안에 무음, 다시 펴면(20% 이상) 소리
- Reset → 즉시 무음, 손을 내렸다 올리기 전까지 무음 유지
- 손을 화면 밖으로 빼면 0.5초 뒤 무음
- 연주 중 카메라를 다른 앱이 가져가면 0.5초 안에 무음 + '다시 시도' 안내
- 12칸을 2초 안에 한 바퀴 훑어도 콘솔에 "Max polyphony exceeded" 없음
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

3. **증상** 코드를 빠르게 바꾸면 일부 음이 빠진 얇은 화음이 남
   **원인** Tone.js PolySynth는 놓은 음도 여음(release 0.4초)이 끝날 때까지 보이스 슬롯을 차지. maxPolyphony가 작으면 "Max polyphony exceeded. Note dropped."
   **규칙** maxPolyphony는 32(Tone 기본값) 이상 유지
   **적용 시점** audio.ts·config.audio 수정 때

4. **증상** 손을 옆으로 눕히면 주먹인데 소리가 새거나 편 손이 100%에 못 미침
   **원인** 펼침 비율을 MediaPipe 정규화 좌표(가로·세로 단위가 다름)로 계산
   **규칙** opennessRatio는 반드시 픽셀 좌표(pts)로 호출
   **적용 시점** main.ts processFrame 수정 때

5. **증상** Linux에서 `npm run setup`이 모델을 받고도 "크기 0 != 7819105"로 실패
   **원인** `stat -f%z`는 macOS 전용
   **규칙** 파일 크기는 `wc -c <`로 잰다
   **적용 시점** 셸 스크립트 작성 때

(이후 버그를 만날 때마다 추가)
```

`.claude/skills/music-verifier/references/impact-matrix.md`:

```markdown
# 변경 영역 → 영향 기능

| 변경 파일 | 영향 | 자동 검증 | 수동 확인 |
|---|---|---|---|
| src/mapping.ts | 코드 선택, 펼침%, 히스테리시스, 유지 규칙 | tests/mapping.test.ts | 경계 깜빡임, 주먹 무음/재개 |
| src/chords.ts | 팔레트, 표기 정규화, MIDI 번호 | tests/chords.test.ts | 12개 코드 소리 |
| src/hands.ts | 오른손 선택 | tests/hands.test.ts | 두 손 동시 노출, 왼손만 노출 안내 |
| src/audio.ts, src/output.ts | 소리, 컨텍스트 상태 | tsc | 코드 전환 시 끊김/겹침, 절전 복귀 |
| src/camera.ts | 카메라 열기/닫기/종료 감지 | tsc | 재시도 누수(LED), 카메라 뺏김 |
| src/tracker.ts | 손 검출, GPU 폴백 | tsc | ?debug=1 라벨 확인 |
| src/overlay.ts, index.html | 화면 | tests/overlay.test.ts | 글자 반전, 손 점 위치, 프레임 비율 |
| src/main.ts | 상태 전이, 시작 절차, 루프 | tsc | 수동 합격 기준 7개 |
| src/config.ts | 모든 임계값·타임아웃 | 전체 테스트 | 수동 합격 기준 7개 |
| scripts/*.sh, .gitignore | 자산/저장소 | verify-all.sh 미추적 검사 | 새 clone 재현 |
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
description: Hand Chord Wheel 증상별 진단 런북. 소리 안 남, 손 인식 안 됨, 좌우 반대, 코드 깜빡임, 느림, 모델 로드 실패, 시작 중 멈춤을 다룬다. "안 돼", "소리가", "인식이" 같은 증상 보고에 사용.
---

# music-debugging

## 흐름
1. 증상을 `references/symptom-map.md`에서 찾는다.
2. 먼저 `bash .claude/skills/music-debugging/scripts/check-assets.sh`로 자산·버전을 확인한다.
3. 브라우저는 Chrome인지, 주소가 `http://127.0.0.1:5173` 또는 `localhost`인지 확인한다(파일 직접 열기·LAN 주소는 카메라 불가 — 화면에 안내가 뜬다).
4. `?debug=1`로 열어 좌하단 `ratio`, handedness 라벨, 상태(READY/PLAYING, Reset 대기)를 읽는다.
5. 원인을 코드로 확인한 뒤에만 수정한다. 고치면 verifier 실행 + gotchas 추가.
```

`.claude/skills/music-debugging/references/symptom-map.md`:

```markdown
# 증상 → 원인 → 조치

| 증상 | 가능한 원인 | 확인 | 조치 |
|---|---|---|---|
| Start 눌러도 카메라 안 켜짐 | 권한 거부 / 다른 앱 점유 / 비보안 주소 | 중앙 메시지(오류 종류별 한국어 안내) | 권한 허용 후 '다시 시도'; 다른 앱 종료; 127.0.0.1 사용 |
| "…를 찾지 못했습니다 (HTTP 404)" | `npm run setup` 미실행, public/ 경로 변경 | check-assets.sh | `npm run setup` 후 새로고침 |
| "…ms 안에 끝나지 않았습니다" | 오디오 장치 전환 중 / 모델 로드 지연 / 권한 팝업 방치 | 어느 단계 메시지에서 멈췄는지 | 장치 연결 확인 후 '다시 시도' |
| 소리가 전혀 안 남 (HUD는 움직임) | AudioContext 일시중지(절전·장치 전환) / 출력 장치 | 상단 노란 알림, 콘솔 `Tone.getContext().state` | 화면 클릭(자동 재개); 시스템 출력 장치 확인 |
| 손이 있는데 인식 안 됨 | 왼손만 보임 / 라벨 반대 / 점수 0.7 미만(가장자리) / 조명 | `?debug=1` 라벨, 회색 점 여부 | 오른손 사용; '좌우 바꾸기' 체크; 손을 화면 안쪽으로 |
| 손 점이 실제 손과 좌우 반대 | 좌표 변환(1-x) 누락/중복 | main.ts processFrame | 변환 한 번만 적용 |
| 코드가 경계에서 깜빡임 | 데드존 작음 / 필터 꺼짐 | config.sector.deadZoneDeg, smoothing.alpha | 데드존 3→5도, alpha 0.5→0.35 |
| 쉼 원판/주먹 경계에서 따다닥 재어택 | 히스테리시스 간격 부족 | config.wheel.restExitFactor, openness.unmuteAbovePercent | 1.3→1.5, 20→25 |
| 주먹 쥐어도 소리 안 멈춤 | closed/open 보정값이 사용자 손과 안 맞음 | `?debug=1` ratio 읽기 | Task 11 절차로 재실측 |
| Reset 뒤 소리가 안 남 | Reset 대기(armed=false) 상태 — 의도된 동작 | `?debug=1`에 "(Reset 대기)" | 손을 내렸다 올리거나 쉼 원판을 지나기 |
| fps 15 미만 | CPU 모드 폴백 / 다른 탭·앱 GPU 점유 | 좌하단 `CPU` 표시 | 콘솔 GPU 실패 원인 확인; 해상도 1280→960 |
| 코드 전환 시 음이 빠짐 | maxPolyphony가 32 미만으로 바뀜 | 콘솔 "Max polyphony exceeded" | config.audio.maxPolyphony 32 |
| 영상이 멈추고 "영상이 멈춰 소리를 껐습니다" | 카메라 프레임 정지(절전·다른 앱) | 카메라 LED, 다른 앱 | 다른 앱 종료 후 '다시 시도' 또는 새로고침 |
```

`.claude/skills/music-debugging/scripts/check-assets.sh`:

```bash
#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT" || exit 1
size_of() { if [ -f "$1" ]; then wc -c < "$1" | tr -d ' '; else echo 0; fi; }
m=public/models/hand_landmarker.task
if [ "$(size_of "$m")" = "7819105" ]; then echo "PASS: 모델 7819105 bytes"; else echo "FAIL: 모델 없음/크기 불일치 → npm run setup"; fi
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
- `Right:0.9x`이고 파란 손바닥 점이 찍히면 그대로(`swapHandedness: false`).
- `Left:0.9x`로 나오고 회색 점만 찍히면(오른손이 무시됨) 화면의 '좌우 바꾸기'를 켜서 파란 점이 찍히는지 확인하고, `src/config.ts`의 `swapHandedness` 기본값을 `true`로 바꾼다(체크박스 저장값과 무관하게 새 사용자 기본값).
결과를 README "실측 기록"에 적는다(날짜, 라벨, 결정).

- [ ] **Step 3: 펼침 보정값 측정**

손을 휠 중심에서 바깥쪽에 두고(쉼 원판 밖), 다음을 각 3초씩 유지하며 `ratio` 값을 읽는다:
1. 완전히 편 손 → 최소값을 `openMeasured`로 기록(예: 1.62)
2. 꽉 쥔 주먹 → 최대값을 `closedMeasured`로 기록(예: 0.91)
3. 손을 옆으로 눕힌 자세로 1·2를 반복 → 값이 ±0.1 안에서 같은지 확인(픽셀 좌표 계산 검증)
4. 카메라에서 1 m 떨어져 반복 → 값이 ±0.1 안에서 같은지 확인(크기 정규화 검증)

`src/config.ts`에 반영: `closedRatio = closedMeasured + 0.05`, `openRatio = openMeasured - 0.05` (여유 0.05씩 안쪽으로). 예: 0.96, 1.57.

- [ ] **Step 4: 재확인**

새로고침 후: 편 손 → 95% 이상, 주먹 → 0%, 반쯤 편 손 → 40~70% 사이에서 부드럽게 움직이고 소리 음량이 따라간다. 주먹에서 100 ms 안에 무음, 20%를 넘기면 다시 소리.

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
- Chrome (macOS에서 개발·테스트. Safari는 테스트되지 않았고, 2차의 Web MIDI 기능은 Safari 미지원)
- Node 22.12 이상 (개발 환경 25.8.1에서 확인)
- 웹캠

## 실행
```bash
npm install
npm run setup   # 손 추적 모델(7.8 MB) 내려받기 + MediaPipe wasm(34 MB) 복사. 1회
npm run dev     # http://127.0.0.1:5173 를 Chrome에서 열기
```
카메라 권한은 `localhost`/`127.0.0.1`(또는 https)에서만 열립니다. HTML 파일을 직접 열거나 LAN 주소로 열면 화면에 안내가 뜹니다.

## 사용법
- **Start**: 파일 확인 → 소리 → 손 추적 모델 → 카메라 순서로 켭니다(브라우저 정책상 클릭이 필요).
- **오른손 위치**: 휠 중심에서 손이 있는 방향의 칸이 선택됩니다. 12시 칸이 0번.
- **손 펼침(R OPEN)**: 음량. 15% 미만(주먹)이면 무음, 20% 이상으로 펴면 다시 소리.
- **휠 중앙 원판**: 손을 넣으면 쉼(무음).
- **Reset**: 소리와 상태 초기화. 손을 내렸다 올리거나 중앙 원판을 지나면 다시 소리가 납니다.
- **좌우 바꾸기**: 카메라·조명에 따라 손 라벨이 반대로 나올 때 켭니다(브라우저에 저장).
- **팔레트**: 하단 글상자에 코드 이름을 공백으로 구분해 입력(6~16개). 예: `B Em6 A9 D#7 G#m A B7 Emaj7 E6 G F#7sus4 C#m7`. 소문자(`em6`)는 표준 표기(`Em6`)로 바뀌어 저장됩니다.
- 다른 사람의 손은 회색 점으로 표시되며, 오른손이 둘이면 직전 위치에 가까운 손을 따라갑니다.
- `?debug=1`을 붙이면 좌하단에 펼침 비율·손 라벨·상태가 표시됩니다.

## 구조
- `src/mapping.ts` 각도→칸, 펼침%, 데드존·히스테리시스, 지수 이동 평균, 유지 규칙 (순수 함수, 테스트 있음)
- `src/chords.ts` 코드 이름→MIDI 번호, 팔레트 파싱 (tonal 6.4.3)
- `src/hands.ts` MediaPipe 결과에서 오른손 고르기 (순수 함수, 테스트 있음)
- `src/tracker.ts` MediaPipe Hand Landmarker 1.0.1 (GPU, 실패 시 CPU)
- `src/audio.ts` Tone.js 15 PolySynth. `ChordOutput` 인터페이스 뒤에 있어 2차에 MIDI 출력을 추가할 수 있음
- `src/camera.ts`, `src/overlay.ts`, `src/main.ts` 카메라 / Canvas 그리기 / 상태 전이

## 검증
```bash
npm run verify   # 타입 검사 + 단위 테스트 + 자산 확인 + 시크릿 검사
```

## 실측 기록
- (Task 11에서 기록: 날짜, handedness 라벨 결과, closed/open 측정값)

## 2차 계획
- Web MIDI → IAC Driver → GarageBand/Logic Pro 출력 (Chrome 전용)
- 왼손 기능, One Euro Filter, 녹음

## 참고한 공개 프로젝트
- [soundgo](https://github.com/Gojaehyeon/soundgo) (MIT) — 코드 휠·펼침 표시 아이디어
- [gesture-synth](https://github.com/ericwei97-cloud/gesture-synth) — 구조 참고. 코드는 가져오지 않음

## 라이선스
MIT
```

- [ ] **Step 2: 수동 합격 기준 수행**

`npm run dev` 상태에서:
1. 좌하단 fps 25 이상
2. 칸 경계(예: Em6/A9 사이)에 손을 5초 → 코드 불변
3. 주먹 → 100 ms 안에 무음; 20% 넘게 펴면 다시 소리; 15~20% 사이에서 따다닥 재어택 없음
4. Reset(손을 휠 위에 둔 채) → 즉시 무음, 손을 내렸다 올리기 전까지 무음 유지
5. 손을 화면 밖으로 → 0.5초 뒤 무음, HUD `-`
6. 연주 중 다른 앱(FaceTime 등)으로 카메라를 가져가기 → 0.5초 안에 무음, '다시 시도' 안내 → 다른 앱 종료 후 '다시 시도'로 복구(카메라 LED가 재시도 사이에 꺼짐)
7. 12칸을 2초 안에 한 바퀴 훑기 → 콘솔에 "Max polyphony exceeded" 없음
8. 잘못된 팔레트("B Em6 Hxx A9 D#7 Zq") 입력 → 빨간 테두리 + 안내 4초, 입력창을 떠나면 원래 팔레트로 되돌아감
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

사용자에게 저장소 이름(기본 제안 `hand-chord-wheel`)과 공개 여부, LICENSE 저작권자 표기를 확인한 뒤:

```bash
git ls-files | grep -E "^public/(models|wasm)/" && echo "FAIL: 대용량 자산이 추적됨" || echo "PASS: 대용량 자산 미추적"
gh repo create hand-chord-wheel --public --source=. --remote=origin --push --description "Webcam hand-tracking chord wheel instrument (MediaPipe + Tone.js), local-only"
```

Expected: 저장소 URL 출력, `main` 푸시 완료.

---

## Self-Review (작성자 점검 기록, 2판)

- **Spec coverage:** 1장 범위(Task 9), 2장 파일 구조·의존성·저장소 규칙(Task 1·12), 3-1 루프·GPU/CPU(Task 7·9), 3-2 각도(Task 3), 3-3 데드존·유예·쉼/무음 히스테리시스(Task 3·9), 3-4 펼침(픽셀 좌표, Task 3·9·11), 3-5 음량·트리거(Task 5·9), 3-6 EMA·재등장 초기화(Task 3·9), 3-7 코드→MIDI(Task 4), 3-8 팔레트·정규화(Task 4·9), 3-9 출력 인터페이스·상태 감시(Task 5), 3-10 화면·Reset 대기·좌우 바꾸기(Task 8·9), 4장 상태 전이·워치독·카메라 종료(Task 9), 5장 오류(Task 6·9: assertCameraSupported, checkAssets, withTimeout, enterError), 6장 테스트(Task 3·4·7·8·12), 8장 실패 분석 반영(전 Task), QA 인프라(Task 10).
- **실패 분석 반영 확인:** CRITICAL ① 루프 try/catch+연속 오류 → ERROR(Task 9 loop) ② 워치독+트랙 ended(Task 6·9) ③ maxPolyphony 32(Task 2). GAP: 시작 실패 정리·순서(assets→audio→model→camera, Task 9), 타임아웃(Task 2·9), 자산 HEAD 사전 확인(Task 9), 오디오 상태 감시·재개(Task 5·9), `wc -c`(Task 1·10), 픽셀 좌표 펼침(Task 9), 재등장 필터 초기화(Task 3·9), 쉼/무음 히스테리시스(Task 3·9), 두 오른손 연속성·점수·화면 안(Task 7), 다른 손만 보일 때 안내+좌우 바꾸기 체크박스(Task 9), 팔레트 거부 복원(Task 9), 비보안/미지원 환경 안내(Task 6·9), Reset 대기(Task 9), 표기 정규화(Task 4), 포커스 복귀(Task 9 enterError), 16:9 프레임(Task 9), visibility 필드(Task 7 테스트), hands.ts 분리(Task 7), 빈 MIDI 방어(Task 9), roundRect 폴백(Task 8).
- **Placeholder scan:** TBD/TODO 없음. README "실측 기록" 빈 줄은 Task 11에서 채우는 의도된 입력란.
- **Type consistency:** `ChordOutput.play(midi: readonly number[])` ↔ `midiByIndex: number[][]`. `HandTracker.detect(video, now, {swap, prevPalm})` → `HandSelection{chosen, otherPalms, labels}` ↔ main.ts 사용. `ChosenHand.palm`(정규화) ↔ `prevPalmNorm`. `wheelGeometry().restExitR` ↔ `Hysteresis(restExitR, restR)`. `HoldTracker.lastSeenMs` ↔ main.ts `prevSeen`. `Scene.otherPalms` ↔ drawScene. `openCamera(video, onEnded)` ↔ main.ts `onCameraEnded`. `assertCameraSupported` 부팅·시작 양쪽에서 호출. `State`에 `STARTING` 추가 — loop/draw의 `active` 판정은 READY/PLAYING만 사용.
