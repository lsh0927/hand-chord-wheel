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
  play: {
    defaultMode: "strum", // "strum" | "pad"
    storageKey: "hcw.play.v1",
  },
  strum: {
    strings: 6,
    pointLandmark: 8, // 왼손 검지 끝 = 피크
    topY: 0.34, // 가장 낮은 줄(위)의 높이(영상 높이 비율). 아래 줄 0.615H — 미리보기(0.64H~)와 겹치지 않게
    gapY: 0.055, // 줄 간격
    bandLeft: [0.06, 0.42] as const, // 패널이 오른쪽 아래일 때 줄 대역(영상 폭 비율)
    bandRight: [0.58, 0.94] as const, // 패널이 왼쪽 아래일 때
    bandCenter: [0.04, 0.27] as const, // 패널이 가운데일 때
    rearmDistRatio: 0.012, // 타격 뒤 피크가 줄에서 이만큼(영상 높이 비율, 720p≈8.6px) 떨어져야 다음 타격을 센다(떨림 차단)
    minSpeed: 0.05, // 영상 높이/초. 보조 가드
    maxJumpRatio: 0.2, // 프레임당 변위가 영상 높이의 이 비율을 넘으면 순간이동(라벨 뒤바뀜)으로 보고 타격 없음
    graceMs: 100, // 왼손이 이 시간 안에 다시 보이면 공백 전 위치와 잇는다
    softSpeed: 0.4, // 이 속도에서 최소 세기
    hardSpeed: 2.5, // 이 속도 이상이면 최대 세기
    minVelocity: 0.35,
    upStrokeScale: 0.85, // 업 스트로크는 조금 가볍게
    refractoryMs: 60, // 같은 줄 재타격 최소 간격(뮤트 홀드보다 길어야 한다)
    muteBelowPercent: 20, // 왼손 펼침 % 미만이면 뮤트
    muteVelocityScale: 0.6,
    muteHoldMs: 40, // 뮤트 음 길이(짧고 둔탁)
    scheduleAheadMs: 0, // 0 = 첫 타격 즉시(프레임 안 시차만 보존). 33~40이면 프레임 경계 시차까지 보존하되 그만큼 지연
    flashMs: 150,
    hintAfterMs: 3000,
    hintRepeatMs: 10000,
  },
  pluck: {
    attackNoise: 1,
    minBurstSec: 0.003, // 노이즈 버스트 최소 길이(고음 줄이 얇아지지 않게)
    dampening: 4000, // Hz
    muteDampening: 1500, // 뮤트 타격은 더 어둡게
    t60Sec: 1.5, // 줄 울림이 −60 dB까지 줄어드는 시간 → 줄마다 resonance 역산
    release: 0.08,
    stringGain: 0.5, // 6줄 합산 클리핑 방지 계수(실측 조정)
    velocityExponent: 1.5,
  },
  face: {
    modelPath: "/models/face_landmarker.task",
    modelBytes: 3758596,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    matrixColumnMajor: true, // ASSUMPTION: 변환 행렬 16개가 열 우선(평행이동이 12~14번). ?debug=1의 t_col/t_row로 확인 — 틀리면 false
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
