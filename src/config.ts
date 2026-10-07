// 모든 조정 가능한 상수. 숫자 근거는 설계 문서 3장·8장.
export const CONFIG = {
  wheel: {
    outerRadiusRatio: 0.375, // 가운데 배치일 때 영상 높이 대비 바깥 반지름
    cornerRadiusRatio: 0.3, // 구석 배치일 때(얼굴을 가리지 않게 조금 작게)
    cornerSideMargin: 0.04, // 구석 배치: 좌우 여백(영상 너비 비율)
    cornerBottomLine: 0.85, // 구석 배치: 휠 바닥이 닿는 선(영상 높이 비율). 아래는 팔레트·버튼 바
    defaultAnchor: "bottom-right", // "center" | "bottom-left" | "bottom-right"
    anchorStorageKey: "hcw.wheel.v1",
    restRadiusRatio: 0.07, // 중앙 쉼 원판(진입 기준)
    restExitFactor: 1.3, // 쉼 원판 이탈은 반지름 × 1.3 밖으로 나가야 함 (히스테리시스)
    labelRadiusRatio: 0.8, // 바깥 반지름 대비 글자 위치
  },
  sector: { deadZoneDeg: 3 },
  openness: {
    closedRatio: 0.58, // 실측 2026-10-07: 꽉 쥔 주먹 ratio 0.53 + 여유 0.05
    openRatio: 1.27, // 실측 2026-10-07: 활짝 편 손 ratio 1.32 − 여유 0.05
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
  select: {
    defaultMode: "fingers", // "fingers" | "wheel"
    modeStorageKey: "hcw.mode.v1",
  },
  fingers: {
    extendRatio: 1.15, // 즉시 판정(디버그·테스트용): 끝-손목 > PIP-손목 × 비율
    thumbRatio: 1.1, // 즉시 판정(디버그·테스트용): 엄지 끝-소지뿌리 > IP-소지뿌리 × 비율
    enterRatio: 1.2, // 히스테리시스: 이 이상이면 펴짐으로 진입 (ASSUMPTION, 실측 교정)
    exitRatio: 1.1, // 이 미만이면 접힘으로 해제
    thumbEnterRatio: 1.18, // 엄지 진입 (검지 옆에 곧게 붙인 자세 ≈1.107은 들어오지 않게)
    thumbExitRatio: 1.05, // 엄지 해제
    holdMs: 120, // 개수가 이 시간 유지되어야 확정
    heightTopLine: 0.25, // 이 높이(영상 높이 비율)에서 100%
    heightBottomLine: 0.85, // 이 높이에서 하한
    minPercent: 10, // 높이 음량 하한(바닥에서도 작은 소리로 남긴다)
    levelExponent: 1.5, // 음량 곡선 지수 (실측 때 1/1.5/2 비교)
    frameMargin: 0.05, // 손목·뿌리 관절이 정규화 좌표 [-m, 1+m] 밖이면 판정 보류
  },
  face: {
    modelPath: "/models/face_landmarker.task",
    modelBytes: 3758596,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    lostGraceMs: 300, // 얼굴이 잠깐 안 잡혀도 이 시간은 마지막 표정·자세 유지, 지나면 중립으로 완화
    slowFps: 20, // 처리 fps가 이 값 아래로
    slowForMs: 3000, // 이 시간 이상 지속되면 2프레임마다 추적
    maxErrors: 10, // 연속 예외 10회(30 fps 기준 약 0.3초)면 얼굴 추적만 끈다
  },
  avatar: {
    defaultPath: "/avatar.vrm", // public/avatar.vrm (git 미추적)
    mirror: true, // 화면이 거울이므로 표정 좌우·yaw·roll을 뒤집는다
    headAxisSign: { x: 1, y: 1, z: 1 }, // ASSUMPTION: MediaPipe 카메라 좌표(X 오른쪽·Y 위·Z 카메라 쪽)가 three.js와 같다 — 실측 1순위
    headMaxDeg: { pitch: 35, yaw: 35, roll: 25 },
    expressionAlpha: 0.5,
    blinkAlpha: 0.8,
    headAlpha: 0.4,
    smileGain: 1.2,
    maxFps: 30, // 아바타 렌더 상한(얼굴 데이터가 카메라 30 fps라 그 이상은 낭비)
    maxPixelRatio: 2,
    maxDeltaSec: 0.1, // 탭 숨김·영상 모드에서 돌아올 때 스프링본 폭발 방지
    maxErrors: 10, // 렌더 예외 연속 10회면 아바타 표시만 끈다
    camera: { fov: 30, y: 1.35, z: 1.7 },
    armDownDeg: 70, // VRM 기본 T자 자세의 팔을 몸 옆으로 내리는 각도(2단계에서 손 추적으로 대체)
    camViewStorageKey: "hcw.camview.v1",
    defaultCamView: "avatar", // "avatar" | "avatar-nopip" | "video"
  },
  midi: {
    channel: 1, // 1~16
    velocity: 100,
    ccExpression: 11, // 손 펼침 → CC11 익스프레션
    storageKey: "hcw.output.v2", // JSON: {"kind":"tone"} | {"kind":"midi","id":"…","name":"…"}
    maxSendErrors: 5, // '연속' 전송 실패 시 브라우저 신디로 복귀 (성공하면 0으로)
  },
  fps: { warnBelow: 15 },
} as const;
