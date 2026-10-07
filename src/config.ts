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
  fps: { warnBelow: 15 },
} as const;
