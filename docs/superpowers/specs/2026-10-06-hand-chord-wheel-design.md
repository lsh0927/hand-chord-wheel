# Hand Chord Wheel — 1차 설계 (오른손 + Tone.js)

작성일 2026-10-06. 상태: 사용자 승인(대화에서 구두 승인). 로컬 전용으로 동작하되 GitHub에 공개 저장소로 올릴 예정.

## 1. 무엇을 만드나

Chrome에서 `http://localhost`로 여는 한 화면짜리 로컬 앱. 웹캠 영상을 거울처럼 띄우고 그 위에 12칸 코드 휠을 그린다. 오른손이 휠 중심에서 어느 방향에 있는지로 코드를 고르고, 손을 편 정도가 음량이 된다. 소리는 브라우저 안의 Tone.js 신디사이저가 낸다.

참고 화면: 사용자가 공유한 릴 스크린샷(원형 휠, "RIGHT HAND — CHORDS", "CHORD · R: B", "R OPEN: 77%", Reset 버튼, 오른쪽 세로 막대). 가장 가까운 공개 프로젝트는 Gojaehyeon/soundgo(MIT)와 ericwei97-cloud/gesture-synth(비상업). 코드는 가져오지 않고 구조만 참고한다.

### 대표 시나리오
1. Start 버튼을 누르고 카메라를 허용한다.
2. 오른손을 들어 휠의 1시 방향에 두면 "Em6" 칸이 파랗게 칠해지고 E2·E3·G3·B3·C#4가 울린다.
3. 손을 더 펴면 음량이 커지고, 주먹을 쥐면(펼침 15% 미만) 소리가 멈춘다.
4. 손을 3시 방향으로 옮기면 "A9"로 바뀌며 음이 다시 울린다.
5. 손을 휠 중앙의 쉼 원판에 넣거나 화면 밖으로 빼면 소리가 멈춘다.

### 범위 밖 (NOT in scope, 1차)
- 왼손 기능 전부. 왼손만 보이면 "손 없음"으로 처리.
- MIDI(Musical Instrument Digital Interface) 출력(GarageBand/Logic Pro 전송). 2차. 단, 출력 인터페이스는 1차에 만들어 둔다.
- 녹음, 모바일, 배포, 서버, 로그인, 사용자 계정.
- One Euro Filter(2차 후보). 1차는 지수 이동 평균.

## 2. 프로젝트 형태와 파일 구조

Vite + TypeScript, 프레임워크 없음. 순수 계산 모듈은 Vitest로 테스트한다. 실행은 `npm run dev` 한 줄, 로컬 전용.

```
music/
  index.html
  package.json
  vite.config.ts / vitest.config.ts / tsconfig.json
  scripts/setup-assets.sh        모델 내려받기 + wasm 복사 (git에 커밋하지 않는 파일 준비)
  scripts/verify-all.sh          타입 검사 + 테스트 + 자산 존재 확인 + 시크릿 검사
  public/models/hand_landmarker.task   (7,819,105 bytes, .gitignore)
  public/wasm/                         (@mediapipe/tasks-vision/wasm 6개 파일, 약 34 MB, .gitignore)
  src/main.ts      Start 버튼, 카메라, 프레임 루프 연결, 상태 전이
  src/camera.ts    getUserMedia, 거울 표시
  src/tracker.ts   MediaPipe 초기화(GPU→CPU 폴백), detectForVideo, 오른손 고르기
  src/mapping.ts   순수 함수: 각도→칸, 펼침 %, 데드존/유지 규칙, 지수 이동 평균
  src/chords.ts    순수 함수: 팔레트 문자열 파싱, 코드 이름→MIDI 번호 배열
  src/audio.ts     Tone.js 래퍼. ChordOutput 인터페이스 구현
  src/output.ts    ChordOutput 인터페이스 정의 (2차 midiOut.ts가 같은 인터페이스)
  src/overlay.ts   Canvas 그리기: 휠, 선택 부채꼴, HUD, 음량 막대, 경고
  src/config.ts    상수: 반지름 비율, 데드존, 보정값, 기본 팔레트, 임계값
  tests/mapping.test.ts, tests/chords.test.ts
  docs/superpowers/specs/, docs/superpowers/plans/
  .claude/skills/music-verifier/, .claude/skills/music-debugging/, .claude/hooks/check-impact.sh
  README.md, LICENSE
```

### 의존성 (2026-10-06 npm registry 확인값)

| 패키지 | 버전 | 용도 |
|---|---|---|
| @mediapipe/tasks-vision | 1.0.1 | 손 관절 21개 정규화 좌표 + handedness(Left/Right, score) |
| tone | 15.1.22 | PolySynth, Gain, Tone.start(), Frequency(midi) |
| tonal | 6.4.3 고정 | Chord.notes(symbol, tonic+octave), Note.midi. 6.5.0은 Node ESM import가 깨짐(@tonaljs/abc-notation main 경로 누락) |
| vite | 8.3.3 | 개발 서버 |
| vitest | 5.0.3 | 단위 테스트 |
| typescript | 5.9.3 고정 (7.0.2는 네이티브 신판이라 1차에서는 보류; tsc는 타입 검사 전용) | 타입 검사 |

### GitHub 공개를 위한 저장소 규칙
- `public/models/`, `public/wasm/`, `node_modules/`는 커밋하지 않는다. `npm run setup`이 모델을 공식 URL에서 내려받고(바이트 수 7,819,105 검증) wasm을 `node_modules/@mediapipe/tasks-vision/wasm`에서 복사한다.
- 모델 공식 URL: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
- README에 실행 3줄(`npm install`, `npm run setup`, `npm run dev`), 브라우저 요건(Chrome), 개인정보 안내(영상은 브라우저 밖으로 나가지 않음)를 쓴다.
- LICENSE: MIT (ASSUMPTION — 사용자 확인 필요. 참고 프로젝트 코드는 복사하지 않으므로 라이선스 충돌 없음).
- 시크릿 없음(API 키·토큰 전무). 그래도 verify-all.sh가 하드코딩 패턴을 검사한다.

## 3. 동작 규칙

### 3-1. 프레임 루프
- `video.requestVideoFrameCallback`마다 `handLandmarker.detectForVideo(video, mediaTime*1000)` 호출. runningMode "VIDEO", delegate "GPU", numHands 2.
- 이 맥(Apple M5 Max) headless Chromium 측정: GPU 33.5 ms/프레임(중앙값), CPU 106.7 ms. GPU 모드는 웹캠 30 fps를 따라간다.
- handedness[i][0].categoryName이 "Right"인 손만 쓴다. 없으면 "손 없음".
- ASSUMPTION(첫날 실측): 거울 반전 표시에서 MediaPipe "Right" 라벨이 실제 오른손과 일치하는지. 패키지 README에 명시 없음. 불일치하면 `config.swapHandedness = true` 한 줄로 뒤집는다.

### 3-2. 코드 선택 (각도)
- 손 위치 = 손바닥 관절 0, 5, 9, 13, 17번의 평균점(정규화 좌표). 손가락 움직임에 둔감.
- 휠 중심 = 영상 중앙. 바깥 반지름 = 영상 높이 × 0.375. 쉼 원판 반지름 = 영상 높이 × 0.07.
- 각도: 12시 = 0도, 시계 방향 증가. 화면 좌표(y 아래 양수)에서 `deg = atan2(dx, -dy)`를 0~360으로 정규화.
- 칸 번호 = `floor(((deg + 15) mod 360) / 30)`. 0번 칸이 12시 ±15도. 칸 수 N이 12가 아니면 30 대신 360/N.
- 예: 1280×720, 중심(640,360), 손(790,150) → dx=150, dy=−210 → 35.5도 → (35.5+15)/30=1.68 → 1번 칸 "Em6".
- 손이 쉼 원판 안이면 선택 없음(무음). 바깥 반지름 밖이어도 각도만 맞으면 선택 유지(스크린샷과 동일).

### 3-3. 깜빡임 방지
- 칸 경계 ±3도 데드존: 새 칸으로 바뀌려면 경계에서 3도 이상 들어가야 한다. "Em6"(15~45도)에서 44.5도는 유지, 48도 이상이면 "A9".
- 손이 사라지면 500 ms 동안 마지막 코드와 음을 유지. 500 ms 넘으면 음을 놓고 선택 해제.

### 3-4. 펼침 정도 (R OPEN)
- `ratio = mean(dist(tip_i, palm)) / dist(L0, L9)`, tip_i ∈ {4, 8, 12, 16, 20}, palm = 3-2의 평균점. 카메라 거리와 무관.
- `percent = clamp((ratio − CLOSED) / (OPEN − CLOSED), 0, 1) × 100`. 기본 CLOSED=0.8, OPEN=1.7 (ASSUMPTION — 첫날 사용자 손으로 실측해 config.ts 값 교정). ratio 1.5 → 77.8%.

### 3-5. 음량과 트리거
- `level = (percent/100)^2`. 77% → 0.59. percent < 15 → 무음(음 놓기). 15 이상으로 돌아오면 현재 코드 다시 치기.
- 코드 변경 시: 들고 있던 음 `triggerRelease`, 새 음 `triggerAttack`. 즉시.
- 음량은 `gain.gain.rampTo(level, 0.05)`.
- Tone 컨텍스트 lookAhead를 기본 0.1초에서 0.02초로 낮추는 것을 구현 시 시험(지연 체감 기준).

### 3-6. 떨림 제거
- 손바닥 평균점(x, y)과 ratio에 지수 이동 평균 α=0.5. 지연 약 1프레임(33 ms). 손 재등장 시 필터 초기화.

### 3-7. 코드 → 음
- `Chord.notes(symbol, tonic + "3")`로 구성음, 여기에 `tonic + "2"` 근음 추가. `Note.midi`로 MIDI 번호 배열.
- 예: Em6 → [40, 52, 55, 59, 61]. B → [35, 47, 51, 54]. D#7 → 구성음에 F##3이 나오므로 음 이름 대신 MIDI 번호로 Tone에 전달(`Tone.Frequency(n, "midi")`).
- 기본 팔레트 11개 파싱 검증 완료(tonal 6.4.3): B, Em6, A9, D#7, G#m, A, B7, Emaj7, E6, G, F#7sus4.

### 3-8. 코드 팔레트
- 기본값 12개: 스크린샷 11개 + 12번째 "C#m7"(스크린샷에서 가려진 칸을 설계자가 채움, 변경 가능). 순서는 시계 방향: B, Em6, A9, D#7, G#m, A, B7, Emaj7, E6, G, F#7sus4, C#m7.
- 하단 글상자에 공백/쉼표 구분 입력. 6~16개 허용. localStorage 키 `hcw.palette.v1`에 저장.
- tonal이 못 읽는 기호(`Chord.get(s).empty === true`)는 빨갛게 표시하고 이전 팔레트 유지.

### 3-9. 소리 엔진과 출력 인터페이스
- `interface ChordOutput { start(): Promise<void>; play(midi: number[]): void; setLevel(v: number): void; stop(): void }`
- audio.ts: `Tone.PolySynth(Tone.Synth, {oscillator: triangle, envelope: {attack 0.02, release 0.4}})`, maxPolyphony 8 → `Tone.Gain` → `Tone.getDestination()`. Start 버튼 클릭 핸들러 안에서 `await Tone.start()`.
- 2차 midiOut.ts가 같은 인터페이스로 Web MIDI → IAC Driver → GarageBand/Logic Pro.

### 3-10. 화면 (overlay.ts)
- 비디오와 Canvas를 같은 크기로 겹치고 둘 다 `transform: scaleX(-1)`. 랜드마크 좌표는 비디오 좌표계 그대로 그린다(함께 반전되므로 일치).
- 휠: 흰색 1 px 선, 칸 글자는 반지름 80% 위치, 선택 칸은 rgba(120,190,255,0.55) 채움, 중앙 쉼 원판은 어두운 반투명.
- HUD 좌상단: "CHORD · R" + 코드명, "R OPEN" + percent. 우상단: Reset 버튼. 오른쪽 가장자리: 세로 음량 막대(level). 하단: 팔레트 글상자, Start 버튼, fps 표시.
- Reset: stop(), 선택 해제, 필터 초기화, CLOSED/OPEN을 config 기본값으로.

## 4. 상태 전이 (main.ts)

```
IDLE ──Start 클릭(Tone.start, 카메라, 모델 로드)──▶ READY
READY ──오른손 검출 & 쉼 원판 밖 & percent≥15──▶ PLAYING(chord k)
PLAYING ──칸 변경(데드존 통과)──▶ PLAYING(chord k')  (release → attack)
PLAYING ──percent<15 또는 쉼 원판 진입──▶ READY (release)
PLAYING ──손 소실 500 ms──▶ READY (release)
* ──Reset──▶ READY
* ──치명 오류(카메라 거부, 모델 로드 실패)──▶ ERROR(메시지 표시, 재시도 버튼)
```

## 5. 오류 처리

| 상황 | 감지 | 처리 |
|---|---|---|
| 카메라 거부/없음 | getUserMedia reject | 중앙 안내문(허용 방법), 재시도 버튼 |
| 모델/wasm 파일 없음 | fetch 404 또는 createFromOptions reject | 경로와 `npm run setup` 안내 |
| GPU delegate 실패 | createFromOptions reject | CPU로 재시도, "느림(약 107 ms/프레임)" 경고 |
| 처리 15 fps 미만 | 최근 30프레임 평균 | HUD 노란 경고 |
| 손 소실 | 검출 결과에 Right 없음 | 500 ms 유지 후 release |
| AudioContext 미시작 | Tone.getContext().state !== "running" | Start 버튼 다시 안내 |
| 잘못된 코드 기호 | Chord.get(s).empty | 빨간 표시, 이전 팔레트 유지 |
| 탭 비활성 | visibilitychange hidden | stop(), 복귀 시 READY |

## 6. 테스트

- Vitest 단위 테스트(mapping.ts, chords.ts만. 브라우저·오디오·카메라는 수동):
  - 각도→칸: 0도, 14.9도, 15.1도, 359.9도, 180도; 데드존 경계(44.5 유지, 48 전환); N=8일 때 45도 간격.
  - 펼침: 합성 좌표(펼친 손 ratio≈1.7 → 100%, 주먹 ratio≈0.8 → 0%, 1.5 → 78%). 카메라 거리 2배(좌표 ×0.5)에도 동일 percent.
  - 유지 규칙: 손 소실 400 ms는 유지, 600 ms는 해제.
  - 지수 이동 평균: 스텝 입력에 대한 수렴.
  - chords: 기본 12개 각각의 MIDI 배열 스냅샷(Em6=[40,52,55,59,61] 등), 잘못된 기호 "Hxx" 처리, 팔레트 파서(공백/쉼표, 6 미만·16 초과 거부).
- 수동 합격 기준(Chrome, 내장 카메라): fps 25 이상 표시, 칸 경계에 손을 5초 두어도 코드 불변, 주먹에 100 ms 내 무음, Reset 즉시 무음, 손을 화면 밖으로 빼면 0.5초 뒤 무음.
- verify-all.sh: `tsc --noEmit`, `vitest run`, 자산 2종 존재·바이트 수 확인, 시크릿 패턴 grep. 결과 PASS/FAIL/WARN.

## 7. 2차 계획 (지금은 안 함)
- midiOut.ts: Web MIDI → IAC Driver → GarageBand/Logic Pro. 출력 선택 UI. Chrome 전용.
- 왼손 기능(코드 성질/멜로디/표현 중 택1), One Euro Filter, 녹음.
