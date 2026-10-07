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
  src/camera.ts    지원 여부 확인(보안 컨텍스트·API), getUserMedia, 트랙 종료 콜백, 닫기
  src/tracker.ts   MediaPipe 초기화(GPU→CPU 폴백), detectForVideo → hands.ts 호출
  src/hands.ts     순수 함수: 결과에서 오른손 고르기(점수 0.7 이상·화면 안·둘이면 직전 위치에 가까운 손)
  src/mapping.ts   순수 함수: 각도→칸, 펼침 %, 데드존/유지 규칙, 지수 이동 평균
  src/chords.ts    순수 함수: 팔레트 문자열 파싱, 코드 이름→MIDI 번호 배열
  src/audio.ts     Tone.js 래퍼. ChordOutput 인터페이스 구현
  src/output.ts    ChordOutput 인터페이스 정의 (2차 midiOut.ts가 같은 인터페이스)
  src/overlay.ts   Canvas 그리기: 휠, 선택 부채꼴, HUD, 음량 막대, 경고
  src/config.ts    상수: 반지름 비율, 데드존, 보정값, 기본 팔레트, 임계값
  tests/mapping.test.ts, tests/chords.test.ts, tests/hands.test.ts, tests/overlay.test.ts
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
- 칸 경계 ±3도 데드존: 새 칸으로 바뀌려면 경계에서 3도 이상 들어가야 한다. 기준은 '현재 화면에 표시된 칸'(무음 상태여도 동일). "Em6"(15~45도)에서 44.5도는 유지, 48도 이상이면 "A9".
- 손이 사라지면 500 ms 동안 마지막 코드와 음을 유지. 500 ms 넘으면 음을 놓고 선택 해제.
- 쉼 원판과 무음 임계에도 히스테리시스: 쉼 원판은 반지름 안으로 들어오면 '쉼', 반지름 × 1.3 밖으로 나가야 '연주'. 무음은 펼침 15% 미만에서 진입, 20% 이상이어야 해제. (경계에서 초당 15회 재어택되는 '따다닥'을 막는다)

### 3-4. 펼침 정도 (R OPEN)
- `ratio = mean(dist(tip_i, palm)) / dist(L0, L9)`, tip_i ∈ {4, 8, 12, 16, 20}, palm = 3-2의 평균점. 카메라 거리와 무관.
- 반드시 **픽셀 좌표**(거울 변환 뒤 x·y 모두 픽셀)로 계산한다. MediaPipe 정규화 좌표는 가로 1 = 1280 px, 세로 1 = 720 px로 단위가 달라 손을 돌리면 값이 바뀐다.
- `percent = clamp((ratio − CLOSED) / (OPEN − CLOSED), 0, 1) × 100`. 기본 CLOSED=0.8, OPEN=1.7 (ASSUMPTION — 첫날 사용자 손으로 실측해 config.ts 값 교정). ratio 1.5 → 77.8%.

### 3-5. 음량과 트리거
- `level = (percent/100)^2`. 77% → 0.59. percent < 15 → 무음(음 놓기). 15 이상으로 돌아오면 현재 코드 다시 치기.
- 코드 변경 시: 들고 있던 음 `triggerRelease`, 새 음 `triggerAttack`. 즉시.
- 음량은 `gain.gain.rampTo(level, 0.05)`.
- Tone 컨텍스트 lookAhead를 기본 0.1초에서 0.02초로 낮추는 것을 구현 시 시험(지연 체감 기준).

### 3-6. 떨림 제거
- 손바닥 평균점(x, y)과 ratio에 지수 이동 평균 α=0.5. 지연 약 1프레임(33 ms).
- 손이 100 ms 넘게 안 보였다가 다시 나타나면 필터를 초기화한다(이전 위치에서 끌려오며 엉뚱한 칸을 고르는 것을 방지). 1~2프레임 깜빡임은 연속으로 본다.

### 3-7. 코드 → 음
- `Chord.notes(symbol, tonic + "3")`로 구성음, 여기에 `tonic + "2"` 근음 추가. `Note.midi`로 MIDI 번호 배열.
- 예: Em6 → [40, 52, 55, 59, 61]. B → [47, 59, 63, 66]. D#7 → [39, 51, 55, 58, 61], 구성음에 F##3이 나오므로 음 이름 대신 MIDI 번호로 Tone에 전달(`Tone.Frequency(n, "midi")`).
- 기본 팔레트 12개 MIDI 배열 검증 완료(tonal 6.4.3 실행값): B [47,59,63,66], Em6 [40,52,55,59,61], A9 [45,57,61,64,67,71], D#7 [39,51,55,58,61], G#m [44,56,59,63], A [45,57,61,64], B7 [47,59,63,66,69], Emaj7 [40,52,56,59,63], E6 [40,52,56,59,61], G [43,55,59,62], F#7sus4 [42,54,59,61,64], C#m7 [37,49,52,56,59].
- 유효성: `Chord.get(s).empty`가 false이고 `tonic`이 비어 있지 않아야 한다("maj7"처럼 근음 없는 기호는 empty=false지만 tonic=""이므로 거부).

### 3-8. 코드 팔레트
- 기본값 12개: 스크린샷 11개 + 12번째 "C#m7"(스크린샷에서 가려진 칸을 설계자가 채움, 변경 가능). 순서는 시계 방향: B, Em6, A9, D#7, G#m, A, B7, Emaj7, E6, G, F#7sus4, C#m7.
- 하단 글상자에 공백/쉼표 구분 입력. 6~16개 허용. localStorage 키 `hcw.palette.v1`에 저장.
- tonal이 못 읽는 기호(`Chord.get(s).empty === true`)는 빨갛게 표시하고 이전 팔레트 유지.

### 3-9. 소리 엔진과 출력 인터페이스
- `interface ChordOutput { start(); play(midi); setLevel(v); stop(); isRunning(); resume(); onStateChange(cb) }` — 뒤의 셋은 절전 복귀·출력 장치 전환으로 AudioContext가 멈췄을 때 안내하고 다음 클릭에서 되살리기 위한 것.
- audio.ts: `Tone.PolySynth(Tone.Synth, {oscillator: triangle, envelope: {attack 0.02, release 0.4}})`, **maxPolyphony 32**(Tone 기본값. 놓은 음도 여음 0.4초 동안 슬롯을 차지하므로 8이면 6음 코드 전환에서 음이 떨어진다 — Tone 소스로 확인) → `Tone.Gain` → destination. Start 버튼 클릭 핸들러의 첫 동기 호출로 `Tone.start()`.
- 2차 midiOut.ts가 같은 인터페이스로 Web MIDI → IAC Driver → GarageBand/Logic Pro.

### 3-10. 화면 (overlay.ts)
- 비디오만 `transform: scaleX(-1)`로 거울 표시한다. Canvas는 반전하지 않고(글자가 뒤집히므로), 랜드마크의 x를 `1 - x`로 바꿔 화면 좌표로 변환한 뒤 그 좌표로 각도 계산과 그리기를 모두 한다. 즉 사용자가 보는 화면 기준으로 시계 방향이 맞는다.
- 휠: 흰색 1 px 선, 칸 글자는 반지름 80% 위치, 선택 칸은 rgba(120,190,255,0.55) 채움, 중앙 쉼 원판은 어두운 반투명.
- HUD 좌상단: "CHORD · R" + 코드명, "R OPEN" + percent. 우상단: Reset 버튼. 오른쪽 가장자리: 세로 음량 막대(level). 하단: 팔레트 글상자, Start 버튼, fps 표시.
- Reset: stop(), 선택 해제, 필터·히스테리시스 초기화. Reset 뒤에는 손이 한 번 사라지거나(500 ms) 쉼 원판을 지나야 다시 소리가 난다(손을 휠 위에 둔 채 눌러도 '즉시 무음'이 성립하도록).
- 하단에 '좌우 바꾸기' 체크박스(localStorage `hcw.swap.v1`): 카메라·조명에 따라 handedness 라벨이 반대로 나올 때 사용자가 직접 바꾼다.
- 선택되지 않은 손(왼손, 다른 사람의 손)은 회색 점으로 표시한다. 오른손이 보이지 않고 다른 손만 1초 넘게 보이면 상단에 안내.
- 비디오·캔버스·버튼·입력은 비디오 비율(기본 16:9)의 프레임 박스 안에 둔다. 창 비율이 달라져도 HUD와 버튼이 같은 박스를 공유한다.

## 4. 상태 전이 (main.ts)

```
IDLE ──Start 클릭──▶ STARTING(자산 HEAD 확인 5 s → Tone.start 3 s → 모델 로드 20 s → 카메라 60 s, 각 단계 타임아웃)──▶ READY
READY ──오른손 검출 & 쉼 원판 밖 & percent≥15──▶ PLAYING(chord k)
PLAYING ──칸 변경(데드존 통과)──▶ PLAYING(chord k')  (release → attack)
PLAYING ──percent<15 또는 쉼 원판 진입──▶ READY (release)
PLAYING ──손 소실 500 ms──▶ READY (release)
PLAYING ──영상 프레임 500 ms 정지(워치독)──▶ READY (release) + 알림
READY/PLAYING ──카메라 트랙 ended──▶ ERROR('카메라 연결이 끊어졌습니다', 다시 시도)
READY/PLAYING ──루프 예외 연속 30회(약 1 s)──▶ ERROR (예외 1회는 silence 후 계속)
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
| 프레임 루프 안 예외 | try/catch | 1회: silence 후 다음 프레임 계속. 연속 30회: ERROR + 다시 시도 |
| 영상 정지(절전·다른 앱·뽑힘) | 마지막 프레임 후 500 ms 경과 / 트랙 ended | 워치독 silence + 알림 / ERROR + 다시 시도, 이전 스트림 stop |
| 시작 단계 무한 대기 | 단계별 타임아웃(5·3·20·60 s) | 어느 단계인지 적힌 메시지 + 다시 시도 |
| 시작 실패 후 재시도 | catch | stopCamera + tracker.close 후 재시도(스트림 누수·LED 켜짐 방지) |
| 비보안 주소(LAN IP)·미지원 브라우저 | isSecureContext, mediaDevices 검사 | 부팅 시 한국어 안내, Start 비활성 |
| AudioContext 일시중지(절전 복귀·출력 장치 전환) | statechange | silence + 알림, 다음 클릭/키에서 resume |
| 코드 전환 시 음 누락 | — | maxPolyphony 32로 예방. 수동 기준: 12칸 2초 훑기에 'Note dropped' 없음 |

## 6. 테스트

- Vitest 단위 테스트(mapping.ts, chords.ts만. 브라우저·오디오·카메라는 수동):
  - 각도→칸: 0도, 14.9도, 15.1도, 359.9도, 180도; 데드존 경계(44.5 유지, 48 전환); N=8일 때 45도 간격.
  - 펼침: 합성 좌표(펼친 손 ratio≈1.7 → 100%, 주먹 ratio≈0.8 → 0%, 1.5 → 78%). 카메라 거리 2배(좌표 ×0.5)에도 동일 percent.
  - 유지 규칙: 손 소실 400 ms는 유지, 600 ms는 해제.
  - 지수 이동 평균: 스텝 입력에 대한 수렴.
  - 히스테리시스: 소리 20↑/15↓, 쉼 원판 65.5↑/50.4↓.
  - chords: 기본 12개 각각의 MIDI 배열 스냅샷(Em6=[40,52,55,59,61] 등), 잘못된 기호 "Hxx" 처리, 팔레트 파서(공백/쉼표, 6 미만·16 초과 거부, 소문자 em6 → Em6 정규화).
  - hands: 두 손 중 Right 선택, swap, 점수 0.7 미만 제외, 화면 밖 제외, 오른손 둘일 때 직전 위치 우선/점수 우선.
- 수동 합격 기준(Chrome, 내장 카메라): fps 25 이상 표시, 칸 경계에 손을 5초 두어도 코드 불변, 주먹에 100 ms 내 무음·20%에서 재개, Reset 즉시 무음(손을 휠 위에 둔 채), 손을 화면 밖으로 빼면 0.5초 뒤 무음, 카메라를 다른 앱이 가져가면 0.5초 안에 무음 + 다시 시도 안내, 12칸 2초 훑기에 콘솔 'Max polyphony exceeded' 없음, 잘못된 팔레트는 빨간 테두리 후 입력창을 떠나면 복원.
- verify-all.sh: `tsc --noEmit`, `vitest run`, 자산 2종 존재·바이트 수 확인, 시크릿 패턴 grep. 결과 PASS/FAIL/WARN.

## 7. 2차 계획 (지금은 안 함)
- midiOut.ts: Web MIDI → IAC Driver → GarageBand/Logic Pro. 출력 선택 UI. Chrome 전용.
- 왼손 기능(코드 성질/멜로디/표현 중 택1), One Euro Filter, 녹음.

## 8. 실패 분석 반영 (2026-10-06, `2026-10-06-failure-analysis.md`)

4개 관점(오류 지도·그림자 경로·상호작용 엣지·라이브러리 API 검증) 적대 검토 + 작성자 검토 결과를 위 3~6장에 반영했다. 바뀐 것:

| 구분 | 내용 | 반영 위치 |
|---|---|---|
| CRITICAL | rAF 루프에 예외 격리가 없어 예외 1회로 화면 정지 + 음 고착 | 4장(연속 30회 ERROR), 5장 |
| CRITICAL | 영상 정지(뽑힘·다른 앱·절전) 시 유예 판정이 돌지 않아 음 고착 | 4장 워치독 + 트랙 ended |
| CRITICAL | maxPolyphony 8 → 6음 코드 전환에서 음 누락(놓은 음도 여음 동안 슬롯 점유) | 3-9 (32) |
| GAP | 시작 실패 시 카메라 스트림 누수, 미처리 거부, 단계 무한 대기 | 4장 STARTING 타임아웃, 5장 |
| GAP | 자산 누락 감지가 예외 메시지 형식에 의존 | 5장 HEAD 사전 확인 |
| GAP | AudioContext 일시중지 미감지 | 3-9, 5장 |
| GAP | 펼침 비율을 정규화 좌표로 계산해 손 회전에 따라 변함 | 3-4 픽셀 좌표 |
| GAP | 유예 안 재등장 시 EMA가 이전 위치에서 끌려옴 | 3-6 |
| GAP | 쉼 원판·무음 임계 히스테리시스 부재 | 3-3 |
| GAP | 두 오른손·저품질 손·왼손만 보일 때 처리 없음 | hands.ts, 3-10 |
| GAP | 팔레트 거부 시 입력창과 휠 불일치 | 3-8 복원 규칙 |
| GAP | 비보안 주소·미지원 브라우저 안내 없음 | 5장 |
| GAP | `stat -f%z`가 macOS 전용 | 스크립트 `wc -c` |
| NOTE | Reset이 한 프레임만 무음 | 3-10 Reset 대기 |
| NOTE | 소문자 코드 표기 | 3-8 정규화 |
| NOTE | 테스트 랜드마크에 visibility 필드 누락, hands 순수 모듈 분리, roundRect 폴백, 16:9 프레임, 포커스 복귀 | 계획 Task 7·8·9 |

## 9. 코드 리뷰 반영 (2026-10-07)

리뷰어 4명(정확성·설계 준수·런타임 함정·테스트/스크립트) + 발견마다 반박자 2명. 확정 16건, 기각 2건. 반영 내용:

| 구분 | 내용 | 반영 |
|---|---|---|
| MAJOR | 타임아웃 뒤 늦게 성공한 getUserMedia/createFromOptions가 ERROR 화면 뒤에서 살아남음(LED 켜짐, HandLandmarker 누수) | 시작 시도 세대 번호 `startAttempt` + `isStale()`; openCamera·tracker.init이 늦은 자원을 즉시 닫고 CANCELLED; enterError가 세대를 올리고 tracker.close() |
| MAJOR | 연속 오류 카운터가 매 틱 초기화되어 ERROR 전이 불가 | processFrame 정상 완료 직후에만 0으로 |
| MAJOR | verify-all.sh 대용량 추적 검사가 종료 코드만 봐서 한 경로만 추적돼도 PASS | `git ls-files` 출력 유무로 판정, 저장소 밖이면 WARN |
| MINOR | STARTING 중 카메라 ended → enterError 중복·안내문 덮어쓰기 | enterError 멱등 가드, await 뒤 `state !== "STARTING"` 가드 |
| MINOR | 오류·시작·Reset·손 소실의 상태 초기화가 제각각 | `resetHandState()`로 통일 |
| MINOR | 점수 미달·화면 밖 오른손도 '다른 손만 감지'로 안내 | `rejectedWanted` 카운트로 안내문 분기 |
| MINOR | IDLE/ERROR에서 Reset이 armed=false를 남겨 시작 뒤 첫 프레임 무음 | READY/PLAYING에서만 대기 적용, 시작 성공 시 armed=true |
| MINOR | 영상 해상도 변경 미대응 | video 'resize' 이벤트에서 resize()+상태 정리 |
| MINOR | READY에서 영상이 멈추면 손 표시가 고정됨(기각됐지만 저비용) | 워치독이 READY에서도 표시를 지움 |
| MINOR | verify-all.sh: wasm 바이트 미검증, npx 자동 설치 위험 | node_modules 원본과 바이트 비교, `--no-install` + 존재 검사 |
| MINOR | setup-assets.sh: cp 실패 미검사, 개수만 셈 | cp 보호, 원본 개수와 비교 |
| MINOR | 경계값 테스트 부재(0.8/1.7, 500 ms, 20/15) | mapping·hands 테스트 추가 (총 81개) |
