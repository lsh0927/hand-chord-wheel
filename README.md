# Hand Chord Wheel

웹캠으로 **오른손**을 추적해 코드를 고르는 로컬 악기입니다. 기본인 **손가락 모드**는 펴진 손가락 수(1~5)로 코드를 고르고 손 높이로 음량을 조절합니다. **휠 모드**는 손 위치로 12칸 코드 휠에서 고르고 손을 편 정도로 음량을 조절합니다. 카메라 영상 대신 **VRM 아바타**(버튜버식 3D 캐릭터)를 띄우고 내 표정·고개 움직임을 입힐 수 있습니다. 영상은 브라우저 밖으로 나가지 않습니다(서버 없음).

## 요구 사항
- Chrome (macOS에서 개발·테스트. Safari는 테스트되지 않았고, 2차의 Web MIDI 기능은 Safari 미지원)
- Node 22.12 이상 (개발 환경 25.8.1에서 확인)
- 웹캠

## 실행
```bash
npm install
npm run setup          # 손 추적 모델(7.8 MB)·얼굴 모델(3.8 MB) 내려받기 + MediaPipe wasm(34 MB) 복사. 1회
npm run setup:avatar   # (선택) 검증용 샘플 VRM 아바타(10.8 MB) 내려받기. 내 모델이 있으면 생략
npm run dev            # http://127.0.0.1:5173 를 Chrome에서 열기
```
모델·wasm·아바타 파일은 용량 때문에 git에 넣지 않고 위 명령으로 받습니다. 출처와 수동으로 받는 방법은 아래 **자산 출처**에 있습니다.
카메라 권한은 `localhost`/`127.0.0.1`(또는 https)에서만 열립니다. HTML 파일을 직접 열거나 LAN 주소로 열면 화면에 안내가 뜹니다.

## 사용법
- **Start**: 파일 확인 → 소리 → 손 추적 모델 → 카메라 순서로 켭니다(얼굴 모델은 카메라 권한을 기다리는 동안 배경에서 로드. 브라우저 정책상 클릭이 필요). 단계마다 타임아웃이 있어 멈추면 원인이 적힌 메시지와 '다시 시도' 버튼이 나옵니다.
- **선택 방식**: 하단 "선택: 손가락 / 휠" 상자.
  - **손가락 모드(기본)**: 1 = 검지, 2 = 검지+중지, 3 = +약지, 4 = +소지, 5 = +엄지(활짝). 엄지는 5에서만 세므로 검지+엄지는 1입니다. 주먹은 쉼이자 재타격(쥐었다 펴면 같은 코드가 다시 울림). 개수가 약 120 ms 유지되어야 바뀌므로 1→3으로 갈 때 스치는 2는 울리지 않습니다. 팔레트의 앞 5개 코드를 씁니다.
  - **R HEIGHT(손가락 모드)**: 음량은 손 높이. 화면 85% 선에서 10%, 25% 선에서 100%.
  - **휠 모드**: 휠 중심에서 손이 있는 방향의 칸이 선택됩니다(12시 칸이 0번). **R OPEN**(손 펼침)이 음량이며 15% 미만(주먹)이면 무음, 20% 이상으로 펴면 다시 소리. 휠 중앙 원판에 손을 넣으면 쉼.
- **Reset**: 소리와 상태 초기화. 손을 내렸다 올리거나(손가락 모드는 주먹을 쥐었다 펴도) 다시 소리가 납니다.
- **좌우 바꾸기**: 카메라·조명에 따라 손 라벨이 반대로 나올 때 켭니다(브라우저에 저장).
- **위치**: 휠·배지 패널의 위치. 기본은 오른쪽 아래(손이 몸 옆에 머물고 얼굴을 가리지 않음). 왼쪽 아래·가운데로 바꿀 수 있고 브라우저에 저장됩니다.
- **팔레트**: 하단 글상자에 코드 이름을 공백으로 구분해 입력(6~16개). 예: `B Em6 A9 D#7 G#m A B7 Emaj7 E6 G F#7sus4 C#m7`. 소문자(`em6`)는 표준 표기(`Em6`)로 바뀌어 저장됩니다. 잘못된 기호는 빨간 테두리로 알려 주고 입력창을 떠나면 원래대로 돌아갑니다.
- 다른 사람의 손은 회색 점으로 표시되며, 오른손이 둘이면 직전 위치에 가까운 손을 따라갑니다.
- `?debug=1`을 붙이면 좌상단에 펼침 비율·손 라벨·상태가 표시됩니다.

## 구조
- `src/mapping.ts` 각도→칸, 펼침%, 데드존·히스테리시스, 지수 이동 평균, 유지 규칙 (순수 함수, 테스트 있음)
- `src/fingers.ts` 손가락 펴짐 비율·히스테리시스 판정·개수·120 ms 안정화·높이 음량 (순수 함수, 테스트 있음)
- `src/chords.ts` 코드 이름→MIDI 번호, 팔레트 파싱 (tonal 6.4.3)
- `src/hands.ts` MediaPipe 결과에서 오른손 고르기 (순수 함수, 테스트 있음)
- `src/tracker.ts` MediaPipe Hand Landmarker 1.0.1 (GPU, 실패 시 CPU)
- `src/audio.ts` Tone.js 15 PolySynth, `src/midi.ts` Web MIDI 출력 — 둘 다 같은 `ChordOutput` 인터페이스. `src/midi-messages.ts`는 메시지 바이트 순수 함수(테스트 있음)
- `src/face.ts` MediaPipe Face Landmarker(표정 계수 52개 + 머리 회전 행렬), `src/avatar-map.ts` 표정 계수→VRM 표정, 행렬→머리 각(순수 함수, 테스트 있음), `src/avatar.ts` three.js + three-vrm 장면(동적 import — 아바타를 쓰지 않으면 내려받지 않음)
- `src/camera.ts`, `src/overlay.ts`, `src/main.ts` 카메라 / Canvas 그리기(유령 손 포함) / 상태 전이
- 설계·계획·실패 분석 문서: `docs/superpowers/`

## GarageBand로 연주하기 (MIDI 출력)
1. **IAC 드라이버 켜기**: Audio MIDI 설정 앱(응용 프로그램 → 유틸리티) → 메뉴 윈도우 → MIDI 스튜디오 표시 → "IAC 드라이버" 더블클릭 → "장치가 온라인 상태" 체크. 포트 목록에 "버스 1"이 있으면 됩니다.
2. **GarageBand**: 새 프로젝트 → 소프트웨어 악기 트랙 → 악기 선택. 처음에는 스트링/패드 계열이나 Smart Controls에서 아르페지에이터를 켠 신스를 권합니다. GarageBand는 연결된 모든 MIDI 입력을 **선택된 트랙** 하나로 받으므로 그 트랙을 선택해 두세요.
3. **웹앱**: 하단 "출력" 상자에서 "MIDI 장치 찾기…" → Chrome 권한 허용 → IAC 버스가 하나면 자동 선택됩니다. 좌상단 정보 줄에 `출력 MIDI: IAC 드라이버 버스 1`이 보이면 연결된 것입니다. 선택은 저장되어 다음에 자동으로 복원됩니다.
4. 손 펼침은 CC11(익스프레션)으로 나갑니다. 다른 파라미터에 걸고 싶으면 GarageBand Smart Controls의 학습(Learn) 기능으로 CC11을 원하는 노브에 배우게 하세요.

문제 해결
- 소리가 안 남: GarageBand에서 악기 트랙이 **선택**되어 있는지, 트랙 헤더의 MIDI 입력 표시가 손을 움직일 때 깜빡이는지, IAC가 온라인인지 확인. Chrome 주소창 왼쪽 아이콘에서 MIDI 권한 상태도 확인. LAN 주소(http://192.168.…)에서는 MIDI를 쓸 수 없으니 localhost로 여세요.
- 음이 걸려서 계속 울림: 웹앱 Reset을 누르면 모든 음 끄기(CC123)와 모든 소리 끄기(CC120)가 나갑니다. 탭을 숨기거나 닫아도 자동으로 나갑니다(탭 종료 시 전달은 보장이 아니라 최선).
- 포트가 뽑히거나 꺼지면 자동으로 브라우저 신디로 돌아가며 상단에 안내가 뜹니다. 저장된 선택은 유지되어 다음 실행 때 다시 시도합니다.

## 버튜버 아바타 (VRM)
카메라 영상을 숨기고 그 자리에 VRM 아바타를 그립니다. 얼굴 추적이 주는 표정 계수와 머리 회전이 아바타 표정·고개에 실시간으로 반영되고, 손은 관절 21개를 이은 반투명 **유령 손**으로 보여 연주 위치를 알 수 있습니다. 실제 영상은 구석의 작은 미리보기로 남습니다(휠·배지 패널의 반대편).

1. **모델 준비**: 먼저 눌러 보려면 `npm run setup:avatar`로 샘플 아바타를 받으면 됩니다. 내 캐릭터는 [VRoid Studio](https://vroid.com/studio)(1.20.0 이상)에서 만들고 "VRM 내보내기"에서 **VRM 1.0**을 고르세요(VRM 0.0도 열리며 방향·회전 부호를 자동으로 맞춥니다). 텍스처 축소 옵션으로 파일을 **20 MB 이하**로 두는 것을 권합니다(로드 중 화면이 수 초 멈추고, 교체 시 GPU 메모리가 순간 2배가 됩니다).
2. **파일 두기**: 내보낸 파일을 `public/avatar.vrm`으로 저장하면 페이지를 열 때 자동으로 로드됩니다(git에는 올라가지 않습니다). 또는 오른쪽 위 **VRM 불러오기**로 파일을 고르세요 — 이 경우 새로고침하면 다시 골라야 합니다.
3. **영상 표시 상자**(하단): "아바타 + 미리보기"(기본) / "아바타만" / "카메라 영상"(이전과 같은 화면). 선택은 저장됩니다. 아바타·얼굴 추적은 선택 기능이라 모델 파일이 없거나 실패해도 손 추적과 소리는 그대로 동작하고 상단 중앙에 안내만 뜹니다.

표정 매핑(MediaPipe 블렌드셰이프 → VRM 프리셋): `jawOpen→aa`, `mouthFunnel→oh`, `mouthPucker→ou`, `mouthStretch 평균→ee`, `eyeBlink 좌/우→blinkRight/blinkLeft`(거울이라 좌우 교환), `mouthSmile 평균×1.2→happy`, `browDown 평균→angry`, `(browInnerUp+eyeWide 평균)/2→surprised`. 머리는 pitch·yaw·roll 각각 ±35°·±35°·±25°로 제한하고 저역 필터로 떨림을 줄입니다.

고개가 반대로 움직이면 `src/config.ts`의 `avatar.headAxisSign`(x: 숙임, y: 좌우 돌림, z: 기울임) 부호를 바꾸세요. 처리 속도가 3초 넘게 20 fps 아래면 얼굴 추적을 2프레임마다로 자동 전환합니다(CPU 폴백이면 처음부터 2프레임마다). 아바타 렌더는 30 fps 상한입니다.

## 자산 출처 (git에 없는 파일)
클론 직후에는 아래 파일이 없고, `npm run setup`(모델·wasm)과 `npm run setup:avatar`(샘플 아바타)가 받아 옵니다. 직접 받으려면 같은 주소에서 받아 같은 자리에 두면 됩니다. 스크립트는 바이트 수로 검증하므로 버전이 바뀐 파일은 FAIL/WARN으로 알려 줍니다.

| 파일(자리) | 출처 | 크기 | 라이선스 |
|---|---|---|---|
| `public/models/hand_landmarker.task` | [MediaPipe 모델 저장소](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task) (hand_landmarker float16 v1) | 7,819,105 bytes | Apache 2.0 (Google) |
| `public/models/face_landmarker.task` | [MediaPipe 모델 저장소](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task) (face_landmarker float16 v1) | 3,758,596 bytes | Apache 2.0 (Google) |
| `public/wasm/*` (6개) | npm 패키지 `@mediapipe/tasks-vision@1.0.1`의 `wasm/` 폴더를 `npm run setup`이 복사 | 약 34 MB | Apache 2.0 (Google) |
| `public/avatar.vrm` (샘플) | [pixiv/three-vrm 예제 모델 `VRM1_Constraint_Twist_Sample.vrm`](https://raw.githubusercontent.com/pixiv/three-vrm/dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm) | 10,776,032 bytes | 파일 내장 메타: 저작자 pixiv Inc., [VRM 1.0 공개 라이선스](https://vrm.dev/licenses/1.0/), 아바타 사용 "everyone", 재배포·수정 허용 |
| `public/avatar.vrm` (내 모델) | [VRoid Studio](https://vroid.com/studio)에서 VRM 1.0으로 내보내기 | 보통 10~40 MB | 본인 제작 |

수동으로 받는 예(터미널):
```bash
curl -fL -o public/models/face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
```

## 검증
```bash
npm run verify   # 타입 검사 + 단위 테스트(154개) + 자산 확인 + 시크릿 검사 + 대용량 파일 미추적 확인
```

## 실측 기록
- 2026-10-07, MacBook Pro 내장 카메라, 실내 조명, Chrome: 오른손 라벨 `Right:0.99` — '좌우 바꾸기' 불필요(기본값 false 유지).
- 펼침 비율: 활짝 편 손 1.32, 꽉 쥔 주먹 0.53 → `openness.openRatio = 1.27`, `closedRatio = 0.58` (각 0.05 여유). 편 손 100%, 주먹 0%, 무음 경계 15%는 비율 0.68, 재개 20%는 0.72.
- 처리 속도: GPU 모드. 좌상단에 '처리 N fps · 카메라 M fps'가 함께 표시된다(카메라 프레임마다 한 번만 처리).

## 다음 계획
- 아바타 2단계: 아바타 팔(어깨–팔꿈치 IK)과 손가락 뼈가 추적된 손을 따라 움직여 유령 손을 대체. 파일로 고른 VRM을 브라우저에 저장해 새로고침 뒤 복원
- 왼손 피아노 코드 + 오른손 기타 파워코드(손별 출력), 스트럼 벨로시티, 곡별 코드 팔레트 프리셋, One Euro Filter

## 참고한 공개 프로젝트
- [soundgo](https://github.com/Gojaehyeon/soundgo) (MIT) — 코드 휠·펼침 표시 아이디어
- [gesture-synth](https://github.com/ericwei97-cloud/gesture-synth) — 구조 참고. 코드는 가져오지 않음

## 라이선스
MIT
