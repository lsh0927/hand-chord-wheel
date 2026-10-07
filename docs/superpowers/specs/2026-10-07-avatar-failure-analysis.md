# 4차 버튜버 아바타(1단계) — 실패 분석 결과 (2026-10-07)

실행: Workflow(4관점 분석 → 중복 제거 → critical/major 상위 6건 반박자 1명씩), 로컬 파일만, 10 에이전트, 약 10분.
대상: `docs/superpowers/specs/2026-10-07-avatar-design.md`, `docs/superpowers/plans/2026-10-07-avatar.md`(1판).

```
┌──────────────────────────────────────────────────────────────┐
│ FAILURE ANALYSIS 결과                                          │
├──────────────────────────────────────────────────────────────┤
│ 처리됨(계획이 이미 막음)   67건                                   │
│ 발견                     37건 → 반박 검증 6건 모두 실제(기각 0)     │
│   major                  2건 확정 + 미검증 7건(직접 검토해 전부 반영) │
│   minor                  4건 확정 + 24건                        │
│ Capacity                 해당 없음(로컬 단일 사용자, 트래픽 없음)     │
└──────────────────────────────────────────────────────────────┘
```

## 확정된 중대 문제와 결정

### 1. 얼굴·아바타 예외가 손 처리 try/catch로 들어가 연주를 끊고 1초 뒤 ERROR
- **무엇이**: 계획 1판은 얼굴 추적을 handleFrame의 기존 try 안에 넣었다. 그 catch는 `silence()` + 연속 30회면 `enterError`.
- **왜 문제**: 연주 중 얼굴 모델이 매 프레임 예외를 내면 → 손은 멀쩡한데 매 프레임 소리가 꺼졌다 켜지고 → 30프레임(카메라 30 fps → 약 1.0초) 뒤 카메라·손 추적까지 전부 종료. "선택 기능은 연주를 막지 않는다"는 원칙과 정반대.
- **결정**: 얼굴 블록을 `trackFace()`로 분리해 **자기 try/catch + 전용 카운터 faceErrors**. 연속 10회(약 0.3초)면 얼굴 추적만 끄고 알림. 아바타 렌더도 같은 방식(`renderAvatar()`, avatarErrors 10회면 표시만 끔).

### 2. 얼굴 모델을 필수 자산으로 두어 선택 기능이 설치·시작을 막음
- **무엇이**: setup-assets.sh의 얼굴 모델 블록이 wasm 복사 앞에서 `exit 1`, checkAssets가 얼굴 모델 404를 ASSET_MISSING으로 처리.
- **왜 문제**: 프록시가 얼굴 모델 URL만 막으면 → wasm 6개(34 MB)·손 모델(7,819,105 bytes)이 멀쩡해도 Start 불가. 3,758,596 bytes 파일 하나 때문에 악기 전체가 안 켜진다.
- **결정**: 얼굴 모델 블록을 스크립트 **맨 끝**으로, 실패는 WARN(exit 0). checkAssets는 필수 목록 그대로, 얼굴 모델은 **별도 soft HEAD** → 없으면 `faceAvailable=false`로 두고 알림 1회, 얼굴 없이 시작.

### 3. VRM 로드 중복·ensureAvatar 재진입 경쟁 (minor로 조정)
- 기본 avatar.vrm(30~40 MB, 2~3초) 로드 중 사용자가 5 MB 파일을 고르면 → 작은 파일이 먼저 보였다가 2초 뒤 기본 파일이 덮는다. 동적 import 대기 중 상자를 바꾸면 렌더러가 둘 생길 수 있다.
- **결정**: `AvatarView.load`에 세대 번호 `loadSeq`(기존 switchSeq 관용구) — 뒤처진 로드는 `deepDispose` 후 CANCELLED. `ensureAvatar`는 Promise 메모이즈. 로드 중 "아바타 불러오는 중…" 표시.

### 4. '영상: 보임'에서 아바타 캔버스 display:none → 리사이즈 시 종횡비 0 (minor)
- 창 크기를 바꾸면 `resize(0, 0)` → 투영 행렬 NaN → 아바타 모드로 돌아와도 안 보임.
- **결정**: `AvatarView.resize`는 크기 0이면 return. 아바타 모드 진입 시 `requestAnimationFrame` 뒤 1회 `fitAvatar()`.

### 5. 얼굴 모델 로드가 카메라 권한 앞에 직렬 (minor)
- 최악 권한 창까지 5+3+20+20 = 48초(현재 28초). 상자가 'video'인 사용자도 매 Start마다 3.7 MB 모델을 GPU에 올림.
- **결정**: 얼굴 init은 **await하지 않고** 손 모델 뒤에 시작해 카메라 권한 대기와 겹친다(`startFaceInit()`). 'video' 모드면 시작하지 않고, 아바타 모드로 바꿀 때 지연 시작. 타임아웃 없음(실패·취소는 알림만).

### 6. (1과 동일 — 다른 관점에서 같은 결론) 반영 완료

## 미검증 major 7건 — 직접 검토 후 전부 반영
| 발견 | 판단 | 반영 |
|---|---|---|
| 행렬에 NaN 1회 → 머리 Ema가 영구 NaN | 실제. `Ema.next`는 NaN을 그대로 섞는다 | `headEulerFromMatrix`가 16개 모두 유한한지 검사(아니면 0). 테스트 추가 |
| VRM 0.x는 rotateVRM0 뒤 pitch·roll 부호 반대 | 실제(pixiv 예제 loadMixamoAnimation이 VRM0에서 쿼터니언 x·z를 뒤집는 것과 같은 이유) | `vrm0`이면 pitch·roll에 −1. 실측 체크리스트에 VRM 0.x 1회 포함 |
| 로드 경쟁 + 로딩 표시 없음 | 3번과 동일 | 3번에 포함 |
| 'video' 모드에서 VRM 불러오기 → 아바타 객체 없음 | 실제(`avatar === null`) | 파일을 고르면 상자를 'avatar'로 바꾸고 `ensureAvatar()`를 기다린 뒤 로드 |
| 아바타 렌더가 120 Hz로 돌아 GPU 4배 | 실제(rAF 기반 draw) | `avatar.maxFps = 30` 상한(얼굴 데이터가 30 fps) |
| clock.getDelta 큰 값 → 스프링본 폭발 | 실제(three-vrm 스프링본은 dt 상한 없음 — 설치 후 확인) | `dt = min(getDelta(), 0.1)` |
| fps<20 → 2프레임 간격 권고가 계획에 없음 | 설계 4장 누락 | CPU 폴백이면 2로 시작, GPU여도 3초간 fps<20이면 2로(알림 1회) |

## minor 24건 — 반영 목록
- 아바타 렌더 자체 try/catch(1번과 같은 원칙) · WebGL 컨텍스트 소실 시 렌더 건너뜀 + 안내 · VRM 로드 실패 시 부분 파싱 scene 폐기, 성공 시 안내 해제, 같은 파일 재선택(`input.value = ""`), 로딩 중 표시 · 쓰이지 않는 `lostResetMs`·`lost` 제거 → 대신 **얼굴 소실 유예 300 ms**(기존 `HoldTracker` 재사용) · `headAxisSign` 기본 {1,1,1}로(거울 반전은 `mirror`만 담당 — 두 노브가 같은 축을 두 번 뒤집던 것 정리) · 영상 정지 워치독·오류 진입·Reset에서 아바타 중립(`resetPose`) · surprised 공식을 "(browInnerUp + eyeWide 평균)/2" 하나로 통일 + 테스트 · 상자 값 동기화(gotcha 12) · 미리보기 z-order: 오버레이(3) > 미리보기(2) > 아바타(1), 오른쪽 배치는 `right: 48px`로 음량 막대(W−28) 회피 · 하단 바 과밀: 'VRM 불러오기'를 **오른쪽 위 Reset 옆**으로 · VRM 없을 때는 얼굴 추적 생략(`avatar.loaded` 가드) · 큰 VRM 로드 전 `silence()`(워치독 거짓 안내·눌린 음 방지) + README에 20 MB 권고 · Start 전·ERROR에서는 미리보기 숨김(`data-live`) · WebGL 렌더러 생성 실패 → 영상 모드로 자동 폴백(저장 안 함) · 파일로 고른 VRM은 새로고침 시 사라진다는 안내 · 오류 접두어 `VRM: ` 추가 · Vite `optimizeDeps.include`에 three·three-vrm(첫 동적 import 재최적화 새로고침 방지) · 교체 시 GPU 메모리 순간 2배는 문서로만.
- 안내 문구(아바타/얼굴 상태)는 캔버스가 아니라 **DOM 요소 `#avatar-msg`**에 쓴다(Playwright로 확인 가능).

## 보류(2단계 후보)
- 파일로 고른 VRM을 IndexedDB에 저장해 새로고침 뒤 복원.
- WebGL 컨텍스트 소실 뒤 완전 재생성(현재는 three.js 기본 복구 + 안내).
