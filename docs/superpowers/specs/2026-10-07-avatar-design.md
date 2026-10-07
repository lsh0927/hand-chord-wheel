# Hand Chord Wheel — 4차 설계: 버튜버 아바타 (얼굴 추적 → VRM, 1단계)

작성일 2026-10-07. 상태: 사용자 승인(구두 — VRM, "A를 목표로 먼저 C부터", VRoid Studio로 모델 직접 제작). 2단계(아바타 팔·손가락이 내 손을 따라 움직임)는 별도 설계.

## 1. 무엇을 만드나

카메라 영상을 숨기고 그 자리에 **VRM 아바타**를 그린다. 얼굴 추적 모델이 매 프레임 주는 표정 계수(52개)와 머리 회전을 아바타의 표정·고개에 반영한다. 손은 **유령 손**(추적된 관절 21개를 반투명 선·점으로 그린 윤곽)으로 보여 주어 연주 위치를 알 수 있게 하고, 구석에 **실제 카메라 미리보기(작은 창)**를 둔다. 코드 휠·배지·HUD는 그대로 위에 올라간다.

### 대표 시나리오
1. 사용자가 VRoid Studio에서 만든 `avatar.vrm`을 프로젝트의 `public/` 폴더에 넣는다(또는 하단 "VRM 불러오기"로 파일을 고른다).
2. Start → 카메라·손 모델에 더해 얼굴 모델이 로드된다. 화면에는 영상 대신 어두운 배경 위 아바타 상반신이 보이고, 오른쪽 아래 구석에 실제 영상 미리보기가 작게 뜬다.
3. 입을 벌리면 아바타 입이 벌어지고(`aa`), 눈을 감으면 깜빡이고(`blink`), 웃으면 `happy`, 고개를 기울이면 아바타 고개도 같은 쪽(거울)으로 기울어진다.
4. 오른손을 들면 아바타 옆에 반투명 손 윤곽이 손 위치에 그려지고, 손가락 모드 배지가 평소처럼 반응하며 소리가 난다.
5. "영상: 보임"으로 바꾸면 2·3차와 같은 화면(실제 영상 + 휠)으로 돌아간다. 아바타 파일이 없으면 안내만 뜨고 나머지는 모두 동작한다.

### 범위 밖(이번 단계)
- 아바타 팔·손가락 구동(2단계), 전신, 시선(lookAt), 배경 이미지, 아바타 위치 드래그, Live2D, 녹화.

## 2. 구조

| 파일 | 책임 |
|---|---|
| `src/face.ts` (신규) | MediaPipe Face Landmarker 래퍼: init(GPU→CPU 폴백, isStale), detect → `{ blendshapes: Record<string, number>, matrix: number[] \| null }` |
| `src/avatar-map.ts` (신규, 순수) | 표정 계수 → VRM 표정 가중치(거울 좌우 교환·배율·클램프), 4×4 행렬 → 머리 오일러 각(거울 부호), 1차 저역 필터 |
| `src/avatar.ts` (신규) | three.js 장면: 렌더러·카메라·조명, VRM 로드(GLTFLoader + VRMLoaderPlugin), 표정·머리 적용, 매 프레임 `vrm.update`·render, 리사이즈, dispose |
| `src/main.ts` (수정) | 얼굴 추적 호출(N프레임마다), 아바타 갱신, 영상 표시 상자, VRM 파일 선택, 유령 손 데이터 |
| `src/overlay.ts` (수정) | 유령 손(관절 연결선 21점), 아바타 없음 안내 |
| `src/config.ts` (수정) | `face`, `avatar` 상수 |
| `index.html` (수정) | `<canvas id="avatar">`(비디오와 오버레이 사이), 영상 표시 상자, VRM 파일 입력, 배경 CSS |
| `scripts/setup-assets.sh` (수정) | `face_landmarker.task`(3,758,596 bytes) 내려받기 |
| `tests/avatar-map.test.ts` (신규) | 매핑·행렬·필터 테스트 |

새 의존성: `three@0.186.1`, `@pixiv/three-vrm@3.5.5`, 개발용 `@types/three@0.186.0`. 번들 크기가 커지므로 `avatar.ts`는 **동적 import**로 분리해 아바타를 쓰지 않을 때는 내려받지 않는다.

## 3. 동작 규칙

### 3-1. 얼굴 추적
- `FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate }, runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true })`. 손 모델과 같은 wasm 파일셋을 쓴다.
- `detectForVideo(video, ts)` 결과에서 `faceBlendshapes[0].categories[]`(categoryName, score)를 이름→값 사전으로, `facialTransformationMatrixes[0].data`(16개, 열 우선)를 그대로 넘긴다. 얼굴이 없으면 null.
- 실행 간격: `face.everyNFrames = 1`(매 프레임). 느리면 2로.
- 손 모델처럼 세대 번호(isStale)로 늦은 로드를 버리고, 실패 시 CPU로 재시도한다.

### 3-2. 표정 매핑 (순수, `avatar-map.ts`)
- 입력: ARKit 이름 사전(예 `jawOpen`, `eyeBlinkLeft`, `mouthSmileLeft`, `browInnerUp`, `browDownLeft`, `mouthFunnel`, `mouthPucker`). 없는 이름은 0.
- 출력(VRM 프리셋): `aa = jawOpen`, `oh = mouthFunnel`, `ou = mouthPucker`, `ee = (mouthStretchLeft+mouthStretchRight)/2`, `blinkLeft/blinkRight = eyeBlink*`, `happy = (mouthSmileLeft+mouthSmileRight)/2 × 1.2`, `angry = (browDownLeft+browDownRight)/2`, `surprised = browInnerUp × eyeWide평균(없으면 browInnerUp)`. 전부 0~1 클램프. 배율·조합은 config 표로 두어 실측 때 조정.
- **거울 교환**: 화면이 거울이므로 `mirror = true`일 때 Left↔Right를 바꿔 넣는다(내가 왼눈을 감으면 화면 왼쪽, 즉 아바타의 오른눈이 감긴다).
- 1차 저역 필터(α 0.5)로 떨림 완화. 깜빡임은 빠르므로 α 0.8.

### 3-3. 머리 회전
- 행렬 → `THREE.Matrix4.fromArray(data)` → 회전 성분 → 오일러(YXZ). 거울이면 yaw·roll 부호 반전. 축 부호는 config `headAxisSign {x,y,z}`(기본 1, −1, −1 — ASSUMPTION, 첫날 실측으로 확정). pitch·yaw ±35°, roll ±25° 클램프. 저역 필터 α 0.4.
- `vrm.humanoid.getNormalizedBoneNode("head")`에 적용. 얼굴이 사라지면 0.5초에 걸쳐 정면으로 복귀.
- 머리 위치(평행이동)는 쓰지 않는다(아바타는 화면 고정).

### 3-4. 렌더링
- `<canvas id="avatar">`: WebGLRenderer(alpha: true, antialias). 크기 = 프레임 CSS 크기 × devicePixelRatio(최대 2). 비디오 위, 오버레이 아래.
- 카메라: Perspective fov 30°, 위치 (0, 1.35, 1.7) → (0, 1.35, 0) 응시(가슴 위). config로 조정. 조명: 반구광 + 방향광.
- 배경: `#frame`의 CSS 그라데이션(영상이 숨겨질 때 보임).
- VRM 로드: GLTFLoader + `register(parser => new VRMLoaderPlugin(parser))`, `gltf.userData.vrm`. `VRMUtils.removeUnnecessaryVertices`, `combineSkeletons`, VRM0이면 `rotateVRM0`. 매 프레임 `vrm.update(delta)` 후 render.
- 파일 출처: `public/avatar.vrm`(gitignore) 우선 → 없으면 "VRM 불러오기" 버튼(파일 선택, 객체 URL) → 둘 다 없으면 아바타 영역에 안내 문구.
- 영상 표시 상자 `#camview`: `avatar`(영상 숨김 + 미리보기), `avatar-nopip`(미리보기 없음), `video`(영상 보임, 아바타 숨김). 저장 키 `hcw.camview.v1`, 기본 `avatar`. 영상 숨김은 `opacity: 0`(프레임 디코딩·requestVideoFrameCallback 유지), 미리보기는 같은 비디오 요소를 구석 22% 폭으로 축소.

### 3-5. 유령 손
- 선택된 오른손의 21점을 `HandLandmarker.HAND_CONNECTIONS`(start/end 쌍)로 잇는 반투명 흰 선(폭 3)과 관절 점(반지름 4), 손끝은 기존처럼 더 크게. 아바타 모드·영상 모드 모두에서 그린다(영상 모드에서는 기존 점 위에 선이 더해질 뿐).

## 4. 오류·엣지

| 상황 | 처리 |
|---|---|
| `face_landmarker.task` 없음 | 시작 시 자산 HEAD 확인에 추가 → "npm run setup" 안내 |
| VRM 파일 없음/로드 실패 | 아바타 영역에 안내, 나머지 기능 정상. 콘솔에 원인 |
| VRM 0.x 모델(VRoid Studio 구버전) | `vrm.meta.metaVersion === "0"`이면 `rotateVRM0` |
| 표정 이름이 모델에 없음 | `expressionManager.getExpression(name)`이 null이면 건너뜀 |
| 얼굴 미검출 | 표정 0으로 완화, 머리 정면 복귀 |
| 얼굴 모델 GPU 실패 | CPU 폴백(손 모델과 동일) |
| WebGL 컨텍스트 손실 | `webglcontextlost` → 아바타 숨기고 안내, `restored`에서 재생성 |
| 성능 | 손+얼굴+렌더. fps 20 미만이면 face.everyNFrames 2 권고(알림) |
| 아바타 모드에서 손 위치 혼란 | 유령 손 + 구석 미리보기 |

## 5. 테스트
- Vitest(`avatar-map.test.ts`): 매핑(jawOpen 0.6 → aa 0.6, smile 평균×1.2 클램프, 없는 이름 0, 거울 교환 blinkLeft↔Right), 행렬(단위 → 0,0,0; yaw +20° 회전 행렬 → yaw 20°, 거울이면 −20°; 클램프), 저역 필터 수렴.
- Playwright: 영상 표시 상자 기본값·전환·저장, 아바타 없음 안내 표시, 유령 손은 손이 있어야 하므로 실측.
- 실측: 표정 반응(입·눈·웃음), 고개 방향 부호(거울), 미리보기 위치, 성능(fps), VRoid 모델 로드.

## 6. 2단계 예고
아바타 팔: 어깨–팔꿈치 두 관절 IK로 손목을 추적 위치(화면 좌표 → 아바타 공간 평면)에 두고, 손가락 뼈는 손가락 모드의 펴짐 상태로 굽힘. 그때 유령 손은 선택 사항이 된다.
