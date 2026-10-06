# Failure Analysis — Hand Chord Wheel 1차 (2026-10-06)

대상: `2026-10-06-hand-chord-wheel-design.md` + 구현 계획 1판(코드 포함). 방법: 4개 관점 적대 검토 에이전트(오류 지도 / 그림자 경로 / 상호작용 엣지 / 라이브러리 타입 정의 대조, 각 도구 호출 8회 이내) + 작성자 직접 검토(Tone.js PolySynth 소스, tasks-vision 타입, Node에서 MediaPipe 번들 import 확인). 결과는 모두 계획 2판에 반영했다.

```
┌─────────────────────────────────────────────────────────────┐
│ FAILURE ANALYSIS 결과                                         │
├─────────────────────────────────────────────────────────────┤
│ Error Map      │ 실패 경로 22개 검토, CRITICAL GAP 3개          │
│ Shadow Paths   │ 데이터 흐름 4개, 미처리 경로 5개                 │
│ Edge Cases     │ 상호작용 14개, 미처리 케이스 9개                 │
│ API 검증       │ 9개 일치, 불일치 1개(visibility), 미검증 1개→확인 │
│ Capacity       │ 해당 없음 (로컬 전용, 트래픽 없음)               │
└─────────────────────────────────────────────────────────────┘
```

## CRITICAL (구현 전 반드시 반영 — 반영 완료)

### C1. 프레임 루프 예외 1회 → 화면 정지 + 음 고착
- [무엇이] `main.ts loop()`에 try/catch가 없어 processFrame/drawScene 중 예외가 나면 `requestAnimationFrame(loop)`에 도달하지 못한다.
- [왜 문제] 사용자가 Em6를 치는 중 detectForVideo가 WebGL 컨텍스트 소실로 한 번 throw하면 → 루프 영구 정지 → 화면은 마지막 프레임, 소리는 Em6 5음이 release 없이 계속 울린다. Reset만 살아 있다.
- [숫자/예] 1회 예외 → fps 표시 '30'에서 고정, [40,52,55,59,61] 무한 지속.
- [고치면] ① processFrame·draw 각각 try/catch, 예외 시 silence 후 계속, 연속 30회(약 1 s)면 ERROR + 다시 시도 (채택) ② window.onerror에서 silence만(화면은 여전히 멈춤) ③ detect만 감싸기(drawScene 예외 못 잡음).

### C2. 영상 프레임 정지 → 유예 판정이 돌지 않아 음 고착
- [무엇이] 손 소실 500 ms 유예(hold.update)가 processFrame 안에만 있고, processFrame은 새 비디오 프레임이 올 때만 돈다. 트랙 ended 처리도 없다.
- [왜 문제] A9를 치는 중 Zoom이 카메라를 가져가면 → currentTime이 멈춰 processFrame 미호출 → hold 타이머가 시작조차 안 됨 → A9 6음이 끝없이 울린다.
- [숫자/예] t=10.0 s 트랙 종료 → t=10.5 s에 꺼져야 할 [45,57,61,64,67,71]이 t=60 s에도 울림.
- [고치면] ① loop 워치독: 마지막 프레임 후 500 ms 지나면 프레임 없이 silence (채택) ② 트랙 'ended' 구독 → ERROR + 다시 시도 (채택, 병행) ③ requestVideoFrameCallback + setInterval 감시(구조 변경 과함).

### C3. maxPolyphony 8 → 코드 전환 시 음 누락
- [무엇이] Tone.js PolySynth는 놓은 보이스를 `onsilence`(여음 종료) 때에만 가용 목록으로 되돌린다(소스 `_getNextAvailableVoice`/`_makeVoiceAvailable` 확인). release 0.4 s 동안 이전 음이 슬롯을 차지한다.
- [왜 문제] A9(6음) → D#7(5음) 전환 시 11 보이스 필요 > 8 → 3음 드롭, "Max polyphony exceeded. Note dropped." 경고. 휠을 훑을수록 심해진다.
- [숫자/예] A9 [45,57,61,64,67,71] → B7 [47,59,63,66,69]: 6+5=11 > 8 → B7 3음 누락.
- [고치면] ① maxPolyphony 32(Tone 기본값; M5 Max에서 CPU 부담 미미) (채택) ② release 0.15 s(음색 손상) ③ releaseAll 후 attack(전환 거칠어짐).

## GAP (반영 완료)

| # | 무엇이 | 왜 문제(시나리오) | 고치면(채택) |
|---|---|---|---|
| G1 | Start 실패 시 카메라 스트림 미정리, `audioReady` 미처리 거부 | setup 안 한 상태에서 Start → 카메라 켜짐 → 모델 404 → ERROR인데 LED 켜진 채, 재시도마다 스트림 누적 | catch에서 stopCamera + tracker.close, `.catch` 부착, 순서를 자산→소리→모델→카메라로 바꿔 권한 팝업 전에 실패 |
| G2 | 시작 단계 무한 대기 | 블루투스 이어폰 전환 중 `Tone.start()`가 영원히 pending → '모델 불러오는 중…' 고정 | 단계별 타임아웃 5/3/20/60 s + 단계별 메시지 |
| G3 | 자산 누락 감지가 예외 문자열 형식에 의존 | wasm 404가 Event로 reject되면 '시작 실패: [object Event]' | 모델·wasm HEAD 사전 확인 → 'HTTP 404 … npm run setup' 결정적 메시지 |
| G4 | AudioContext 일시중지 미감지 | 뚜껑 닫았다 열면 HUD는 움직이는데 무음, Start는 잠겨 있음 | statechange → 알림 + 다음 pointerdown/keydown에서 resume |
| G5 | 펼침 비율을 정규화 좌표로 계산 | 가로 1=1280 px, 세로 1=720 px라 손을 눕히면 주먹이 15%를 넘어 소리가 샘 | `opennessRatio(pts)` 픽셀 좌표로 계산, Task 11에 눕힌 자세 검증 추가 |
| G6 | 유예 안 재등장 시 EMA 미초기화 | 200 ms 뒤 반대쪽에서 손이 나타나면 중간점(쉼 원판 안)으로 계산돼 끊김 | 100 ms 넘는 공백 뒤 재등장이면 필터 초기화 |
| G7 | 쉼 원판·무음 임계 히스테리시스 없음 | 반지름 50 px 근처·펼침 14~16%에서 초당 최대 15회 stop/play '따다닥' | `Hysteresis` 순수 클래스: 쉼 50.4↓/65.5↑, 무음 15↓/20↑ |
| G8 | 두 오른손·저품질 손 처리 없음 | 친구 손이 보이면 프레임마다 다른 손을 골라 손바닥이 수백 px 점프 | 점수 ≥ 0.7, 화면 안, 둘이면 직전 위치에 가까운 손; 나머지는 회색 점 |
| G9 | 왼손만/라벨 반대일 때 안내 없음 | 다른 카메라에서 'Left'로 나오면 아무 점도 소리도 없음 | 1초 지속 시 안내 + '좌우 바꾸기' 체크박스(localStorage) |
| G10 | 팔레트 거부 시 입력창·휠 불일치 | 'Hxx Zq' 입력 후 떠나면 입력창은 틀린 문자열, 휠은 이전 팔레트 | 빨간 테두리, blur 시 복원, 메시지 4 s 뒤 소거 |
| G11 | 비보안 주소·미지원 브라우저 안내 없음 | LAN IP로 열면 'Cannot read properties of undefined' | 부팅·시작 시 isSecureContext/mediaDevices 검사 → 한국어 안내 |
| G12 | `stat -f%z` macOS 전용 | Linux에서 모델을 받고도 '크기 0 != 7819105' | 세 스크립트 모두 `wc -c <` |

## NOTE (반영 완료)
- Reset이 한 프레임만 무음 → Reset 뒤 손이 사라지거나 쉼 원판을 지날 때까지 대기(armed 플래그).
- 소문자 'em6' 그대로 표시 → `Chord.get(t).symbol`로 'Em6' 정규화(tonal 6.4.3 실행 확인).
- `tests/tracker.test.ts` 랜드마크에 `visibility`(필수 필드) 누락 → 추가. 오른손 선택을 `src/hands.ts`(MediaPipe 미import) 순수 모듈로 분리.
- `ctx.roundRect` 기능 감지 폴백. ERROR 뒤 `startBtn.focus()`. 16:9 프레임 박스로 버튼·캔버스 정렬.
- `play([])` 도달 불가지만 방어(빈 MIDI면 silence).

## 검증된 사실 (검토 중 확인)
- Node 25에서 `@mediapipe/tasks-vision/vision_bundle.mjs` import 성공 → Vitest(node)에서 tracker.ts를 import해도 안전. 그래도 hands.ts 분리.
- tasks-vision 1.0.1 `NormalizedLandmark { x, y, z, visibility }` 모두 필수.
- Tone 15.1.22: `PolySynth(voice, options)` 오버로드, `maxPolyphony` 공개 필드, `Gain.toDestination()`, `getContext().lookAhead` setter, `getContext().on("statechange")`(Emitter), `resume()`, `state`.
- TypeScript 5.9.3 lib.dom에 `roundRect` 존재.
- tonal 6.4.3 `Chord.get("em6").symbol === "Em6"`, `Chord.get("maj7").tonic === ""`.
