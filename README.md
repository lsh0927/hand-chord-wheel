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
- **Start**: 파일 확인 → 소리 → 손 추적 모델 → 카메라 순서로 켭니다(브라우저 정책상 클릭이 필요). 단계마다 타임아웃이 있어 멈추면 원인이 적힌 메시지와 '다시 시도' 버튼이 나옵니다.
- **오른손 위치**: 휠 중심에서 손이 있는 방향의 칸이 선택됩니다. 12시 칸이 0번.
- **손 펼침(R OPEN)**: 음량. 15% 미만(주먹)이면 무음, 20% 이상으로 펴면 다시 소리.
- **휠 중앙 원판**: 손을 넣으면 쉼(무음).
- **Reset**: 소리와 상태 초기화. 손을 내렸다 올리거나 중앙 원판을 지나면 다시 소리가 납니다.
- **좌우 바꾸기**: 카메라·조명에 따라 손 라벨이 반대로 나올 때 켭니다(브라우저에 저장).
- **팔레트**: 하단 글상자에 코드 이름을 공백으로 구분해 입력(6~16개). 예: `B Em6 A9 D#7 G#m A B7 Emaj7 E6 G F#7sus4 C#m7`. 소문자(`em6`)는 표준 표기(`Em6`)로 바뀌어 저장됩니다. 잘못된 기호는 빨간 테두리로 알려 주고 입력창을 떠나면 원래대로 돌아갑니다.
- 다른 사람의 손은 회색 점으로 표시되며, 오른손이 둘이면 직전 위치에 가까운 손을 따라갑니다.
- `?debug=1`을 붙이면 좌상단에 펼침 비율·손 라벨·상태가 표시됩니다.

## 구조
- `src/mapping.ts` 각도→칸, 펼침%, 데드존·히스테리시스, 지수 이동 평균, 유지 규칙 (순수 함수, 테스트 있음)
- `src/chords.ts` 코드 이름→MIDI 번호, 팔레트 파싱 (tonal 6.4.3)
- `src/hands.ts` MediaPipe 결과에서 오른손 고르기 (순수 함수, 테스트 있음)
- `src/tracker.ts` MediaPipe Hand Landmarker 1.0.1 (GPU, 실패 시 CPU)
- `src/audio.ts` Tone.js 15 PolySynth. `ChordOutput` 인터페이스 뒤에 있어 2차에 MIDI 출력을 추가할 수 있음
- `src/camera.ts`, `src/overlay.ts`, `src/main.ts` 카메라 / Canvas 그리기 / 상태 전이
- 설계·계획·실패 분석 문서: `docs/superpowers/`

## 검증
```bash
npm run verify   # 타입 검사 + 단위 테스트(81개) + 자산 확인 + 시크릿 검사 + 대용량 파일 미추적 확인
```

## 실측 기록
- 2026-10-07, MacBook Pro 내장 카메라, 실내 조명, Chrome: 오른손 라벨 `Right:0.99` — '좌우 바꾸기' 불필요(기본값 false 유지).
- 펼침 비율: 활짝 편 손 1.32, 꽉 쥔 주먹 0.53 → `openness.openRatio = 1.27`, `closedRatio = 0.58` (각 0.05 여유). 편 손 100%, 주먹 0%, 무음 경계 15%는 비율 0.68, 재개 20%는 0.72.
- 처리 속도: GPU 모드. 좌상단에 '처리 N fps · 카메라 M fps'가 함께 표시된다(카메라 프레임마다 한 번만 처리).

## 2차 계획
- Web MIDI → IAC Driver → GarageBand/Logic Pro 출력 (Chrome 전용)
- 왼손 기능, One Euro Filter, 녹음

## 참고한 공개 프로젝트
- [soundgo](https://github.com/Gojaehyeon/soundgo) (MIT) — 코드 휠·펼침 표시 아이디어
- [gesture-synth](https://github.com/ericwei97-cloud/gesture-synth) — 구조 참고. 코드는 가져오지 않음

## 라이선스
MIT
