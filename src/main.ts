import { CONFIG } from "./config";
import { assertCameraSupported, openCamera, stopCamera } from "./camera";
import { HandTracker } from "./tracker";
import { ToneOutput } from "./audio";
import { chordToMidi, parsePalette } from "./chords";
import {
  angleDeg,
  nextSector,
  palmCenter,
  opennessRatio,
  opennessPercent,
  distance,
  Ema,
  HoldTracker,
  Hysteresis,
  TIP_IDS,
  type Point,
} from "./mapping";
import { drawScene, wheelGeometry, type Scene, type HandView } from "./overlay";

type State = "IDLE" | "STARTING" | "READY" | "PLAYING" | "ERROR";

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 요소가 없습니다`);
  return el as T;
}

const frame = $<HTMLDivElement>("frame");
const video = $<HTMLVideoElement>("video");
const canvas = $<HTMLCanvasElement>("overlay");
const startBtn = $<HTMLButtonElement>("start");
const resetBtn = $<HTMLButtonElement>("reset");
const paletteInput = $<HTMLInputElement>("palette");
const paletteMsg = $<HTMLElement>("palette-msg");
const swapInput = $<HTMLInputElement>("swap");
const ctx2d = canvas.getContext("2d");
if (!ctx2d) throw new Error("Canvas 2D 컨텍스트를 만들 수 없습니다");
const ctx: CanvasRenderingContext2D = ctx2d;
const debug = new URLSearchParams(location.search).has("debug");

const output = new ToneOutput();
const tracker = new HandTracker();
const hold = new HoldTracker(CONFIG.hold.lostGraceMs);
const emaX = new Ema(CONFIG.smoothing.alpha);
const emaY = new Ema(CONFIG.smoothing.alpha);
const emaRatio = new Ema(CONFIG.smoothing.alpha);
const sounding = new Hysteresis(CONFIG.openness.unmuteAbovePercent, CONFIG.openness.muteBelowPercent);
let outsideRest: Hysteresis | null = null; // 반지름은 영상 크기에 따라 resize()에서 만든다

let state: State = "IDLE";
let palette: string[] = [...CONFIG.palette.default];
let midiByIndex: number[][] = palette.map(chordToMidi);
let swap: boolean = CONFIG.tracker.swapHandedness;
let currentSector: number | null = null; // 소리가 나고 있는 칸
let shownSector: number | null = null; // 화면에 표시 중인 칸(무음이어도)
let handView: HandView | null = null;
let otherPalms: Point[] = [];
let prevPalmNorm: Point | null = null; // 직전 손바닥(정규화) — 두 오른손 중 연속성 선택용
let openPercent = 0;
let level = 0;
let lastRatio = 0;
let armed = true; // Reset 뒤에는 손이 한 번 사라지거나 쉼 원판을 지나야 다시 소리
let audioSuspended = false;
let message: string | null = "Start를 누르면 카메라와 소리가 켜집니다";
let notice: string | null = null;
let noticeUntil = 0;
let lastVideoTime = -1;
let lastFrameAt = 0;
let consecutiveErrors = 0;
let otherOnlySince: number | null = null;
let lastOtherNotice = -Infinity;
let labelsForDebug: string[] = [];
let paletteMsgTimer: number | null = null;
let startAttempt = 0; // Start 시도 세대 번호. 타임아웃·재시도로 무효화된 시도의 늦은 결과를 버리는 데 쓴다
const frameTimes: number[] = [];

function setState(s: State): void {
  state = s;
}

function showNotice(text: string, ms: number = CONFIG.notice.defaultMs): void {
  notice = text;
  noticeUntil = performance.now() + ms;
}

function resetFilters(): void {
  emaX.reset();
  emaY.reset();
  emaRatio.reset();
}

/** 손 관련 상태를 한 번에 초기화. Reset·손 소실·오류 진입·시작 성공에서 공통으로 쓴다. */
function resetHandState(): void {
  handView = null;
  otherPalms = [];
  shownSector = null;
  prevPalmNorm = null;
  openPercent = 0;
  lastRatio = 0;
  otherOnlySince = null;
  hold.reset();
  resetFilters();
  sounding.reset();
  outsideRest?.reset();
}

/** 소리를 멈추고 READY로. 표시 칸은 호출자가 정한다. */
function silence(): void {
  if (state === "PLAYING") {
    output.stop();
    setState("READY");
  }
  currentSector = null;
  level = 0;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`TIMEOUT: ${what}가 ${ms} ms 안에 끝나지 않았습니다`)), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

// ── 팔레트 ──────────────────────────────────────────────
function applyPalette(chords: string[]): void {
  palette = chords;
  midiByIndex = palette.map(chordToMidi);
  shownSector = null;
  silence();
}

function setPaletteMsg(text: string, isError: boolean): void {
  paletteMsg.textContent = text;
  paletteMsg.classList.toggle("error", isError);
  if (paletteMsgTimer !== null) window.clearTimeout(paletteMsgTimer);
  paletteMsgTimer = window.setTimeout(() => {
    paletteMsg.textContent = "";
    paletteMsgTimer = null;
  }, CONFIG.notice.defaultMs);
}

function loadPalette(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(CONFIG.palette.storageKey);
  } catch {
    saved = null; // 저장소 사용 불가(시크릿 모드 등)
  }
  if (saved) {
    const parsed = parsePalette(saved, CONFIG.palette.min, CONFIG.palette.max);
    if (parsed.ok) applyPalette(parsed.chords);
  }
  paletteInput.value = palette.join(" ");
}

paletteInput.addEventListener("change", () => {
  const parsed = parsePalette(paletteInput.value, CONFIG.palette.min, CONFIG.palette.max);
  if (!parsed.ok) {
    paletteInput.classList.add("invalid");
    setPaletteMsg(parsed.invalid.length ? `${parsed.reason}: ${parsed.invalid.join(", ")}` : parsed.reason, true);
    return;
  }
  paletteInput.classList.remove("invalid");
  setPaletteMsg(`${parsed.chords.length}개 코드 적용`, false);
  applyPalette(parsed.chords);
  paletteInput.value = parsed.chords.join(" ");
  try {
    localStorage.setItem(CONFIG.palette.storageKey, parsed.chords.join(" "));
  } catch {
    /* 저장 실패는 무시 */
  }
});

// 거부된 입력은 포커스를 잃을 때 현재 팔레트로 되돌려 화면과 입력창이 어긋나지 않게 한다
paletteInput.addEventListener("blur", () => {
  if (paletteInput.classList.contains("invalid")) {
    paletteInput.value = palette.join(" ");
    paletteInput.classList.remove("invalid");
  }
});

// ── 좌우 바꾸기 ──────────────────────────────────────────
function loadSwap(): void {
  try {
    const saved = localStorage.getItem(CONFIG.tracker.swapStorageKey);
    if (saved === "1" || saved === "0") swap = saved === "1";
  } catch {
    /* 무시 */
  }
  swapInput.checked = swap;
}

swapInput.addEventListener("change", () => {
  swap = swapInput.checked;
  prevPalmNorm = null;
  try {
    localStorage.setItem(CONFIG.tracker.swapStorageKey, swap ? "1" : "0");
  } catch {
    /* 무시 */
  }
});

// ── 시작 / 리셋 / 오류 ──────────────────────────────────
function describeError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  const text = e instanceof Error ? e.message : e instanceof Event ? `리소스 로드 실패 (${e.type})` : String(e);
  for (const prefix of ["UNSUPPORTED: ", "ASSET_MISSING: ", "TIMEOUT: ", "AUDIO: ", "CANCELLED: "]) {
    if (text.startsWith(prefix)) return text.slice(prefix.length);
  }
  if (name === "NotAllowedError") return "카메라 권한이 거부되었습니다.\n주소창 왼쪽 아이콘 → 카메라 → 허용 후 '다시 시도'";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "카메라를 찾을 수 없습니다. 연결을 확인하세요.";
  if (name === "NotReadableError") return "다른 앱이 카메라를 쓰고 있습니다. 그 앱을 닫고 '다시 시도'";
  return `시작 실패: ${text}`;
}

/** 모델·wasm 파일이 서버에 있는지 HEAD로 확인. 없으면 결정적인 메시지로 실패한다. */
async function checkAssets(): Promise<void> {
  const urls = [CONFIG.tracker.modelPath, `${CONFIG.tracker.wasmPath}/vision_wasm_internal.wasm`];
  for (const u of urls) {
    const r = await fetch(u, { method: "HEAD" });
    if (!r.ok) throw new Error(`ASSET_MISSING: ${u} 를 찾지 못했습니다 (HTTP ${r.status}).\n터미널에서 npm run setup 실행 후 새로고침`);
  }
}

function resize(): void {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;
  frame.style.aspectRatio = `${w} / ${h}`;
  frame.style.width = `min(100vw, calc(100vh * ${w} / ${h}))`;
  const g = wheelGeometry(w, h);
  outsideRest = new Hysteresis(g.restExitR, g.restR);
}

function enterError(text: string): void {
  if (state === "ERROR") return; // 멱등: 먼저 들어온 안내문을 유지한다
  startAttempt++; // 진행 중이던 시작 시도를 무효화 → 늦게 성공한 카메라/모델은 즉시 정리된다
  silence();
  resetHandState();
  stopCamera(video);
  tracker.close();
  setState("ERROR");
  message = text;
  startBtn.disabled = false;
  startBtn.textContent = "다시 시도";
  startBtn.focus();
}

function onCameraEnded(): void {
  if (state === "ERROR" || state === "IDLE") return;
  enterError("카메라 연결이 끊어졌습니다(뽑힘 또는 다른 앱이 사용 중).\n'다시 시도'를 누르세요");
}

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  setState("STARTING");
  const attempt = ++startAttempt;
  const isStale = (): boolean => attempt !== startAttempt;
  // 사용자 제스처 컨텍스트 안에서 동기적으로 시작. 거부는 아래 await에서 받되, 그 전에 다른 단계가 실패해도 미처리 거부가 남지 않게 한다.
  const audioReady = output.start().catch((e: unknown) => {
    throw new Error(`AUDIO: 소리를 켤 수 없습니다 (${e instanceof Error ? e.message : String(e)})`);
  });
  audioReady.catch(() => {});
  try {
    assertCameraSupported();
    message = "파일 확인 중…";
    await withTimeout(checkAssets(), CONFIG.startup.assetCheckMs, "자산 확인");
    message = "소리 켜는 중…";
    await withTimeout(audioReady, CONFIG.startup.audioMs, "소리 켜기");
    message = "손 추적 모델 불러오는 중…";
    const delegate = await withTimeout(tracker.init(isStale), CONFIG.startup.modelMs, "모델 로드");
    if (state !== "STARTING") return; // 그 사이 ERROR로 바뀌었으면 중단
    message = "카메라 여는 중… (권한을 허용해 주세요)";
    await withTimeout(openCamera(video, onCameraEnded, isStale), CONFIG.startup.cameraMs, "카메라 열기(권한 창에서 '허용'을 눌러야 합니다)");
    if (state !== "STARTING") return; // 카메라 트랙이 열리자마자 끊긴 경우 등
    resize();
    resetHandState();
    armed = true;
    message = null;
    lastVideoTime = -1;
    lastFrameAt = performance.now();
    consecutiveErrors = 0;
    setState("READY");
    startBtn.textContent = "실행 중";
    if (delegate === "CPU") showNotice("GPU 모드 실패 → CPU 모드(느림, 약 107 ms/프레임)", 6000);
    if (!output.isRunning()) {
      audioSuspended = true;
      showNotice("소리가 아직 꺼져 있습니다. 화면을 한 번 클릭하세요", 6000);
    }
  } catch (e) {
    console.error(e);
    if (state === "ERROR") return; // 카메라 ended 등으로 이미 ERROR 처리됨 — 먼저 나온 안내문 유지
    enterError(describeError(e));
  }
});

resetBtn.addEventListener("click", () => {
  const wasActive = state === "READY" || state === "PLAYING";
  silence();
  resetHandState();
  // 연주 중/대기 중일 때만 '손을 뗄 때까지 무음'을 건다. IDLE·ERROR에서 누른 Reset이 다음 시작을 막지 않게 한다
  armed = !wasActive;
  if (wasActive) showNotice("초기화됨 — 손을 내렸다 올리면 다시 소리가 납니다", 3000);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) silence();
});

// 스트림 도중 해상도가 바뀌면(장치 전환 등) 캔버스·프레임 비율·쉼 원판 반지름을 다시 맞춘다
video.addEventListener("resize", () => {
  if (state !== "READY" && state !== "PLAYING") return;
  if (canvas.width === video.videoWidth && canvas.height === video.videoHeight) return;
  resize();
  resetHandState();
  silence();
});

// 오디오 컨텍스트가 멈추면(절전 복귀·출력 장치 전환) 안내하고, 다음 클릭/키에서 재개
output.onStateChange((running) => {
  audioSuspended = !running;
  if (!running && (state === "READY" || state === "PLAYING")) {
    silence();
    showNotice("오디오가 일시중지되었습니다. 화면을 클릭하면 다시 켜집니다", 8000);
  }
});
async function resumeAudioIfNeeded(): Promise<void> {
  if (!audioSuspended) return;
  try {
    await output.resume();
    if (output.isRunning()) {
      audioSuspended = false;
      showNotice("소리 켜짐", 1500);
    }
  } catch (e) {
    console.warn("오디오 재개 실패", e);
  }
}
document.addEventListener("pointerdown", () => void resumeAudioIfNeeded());
document.addEventListener("keydown", () => void resumeAudioIfNeeded());

// ── 프레임 처리 ──────────────────────────────────────────
function processFrame(now: number): void {
  const W = canvas.width;
  const H = canvas.height;
  const geo = wheelGeometry(W, H);
  const center: Point = { x: geo.cx, y: geo.cy };

  const sel = tracker.detect(video, now, { swap, prevPalm: prevPalmNorm });
  labelsForDebug = sel.labels;
  otherPalms = sel.otherPalms.map((p) => ({ x: (1 - p.x) * W, y: p.y * H }));
  const hand = sel.chosen;

  // 손은 보이는데 쓸 수 있는 오른손이 없을 때 안내 (1초 이상 지속, 5초에 한 번). 탈락 사유에 따라 문구를 나눈다
  if (!hand && sel.labels.length > 0) {
    otherOnlySince ??= now;
    if (now - otherOnlySince > CONFIG.notice.leftOnlyAfterMs && now - lastOtherNotice > CONFIG.notice.leftOnlyRepeatMs) {
      showNotice(
        sel.rejectedWanted > 0
          ? "오른손이 흐리거나 화면 가장자리에 걸쳐 있습니다. 손을 화면 안쪽으로 가져오세요"
          : "오른손이 보이지 않습니다(다른 손만 감지). 오른손을 들거나 '좌우 바꾸기'를 켜 보세요",
        3000,
      );
      lastOtherNotice = now;
    }
  } else {
    otherOnlySince = null;
  }

  const prevSeen = hold.lastSeenMs;
  const present = hold.update(hand !== null, now);

  if (hand) {
    // 잠깐(≤100ms) 끊긴 건 연속으로 보고, 더 길게 사라졌다 나타나면 필터를 초기화해 이전 위치에서 끌려오지 않게 한다
    if (prevSeen !== null && now - prevSeen > CONFIG.smoothing.resetAfterGapMs) resetFilters();
    prevPalmNorm = hand.palm;

    // 거울 표시 좌표(픽셀)로 변환: x → (1 - x). 펼침 비율도 이 등방 좌표로 계산한다
    const pts: Point[] = hand.landmarks.map((l) => ({ x: (1 - l.x) * W, y: l.y * H }));
    const rawPalm = palmCenter(pts);
    const palm: Point = { x: emaX.next(rawPalm.x), y: emaY.next(rawPalm.y) };
    const ratio = emaRatio.next(opennessRatio(pts));
    lastRatio = ratio;
    openPercent = opennessPercent(ratio, CONFIG.openness.closedRatio, CONFIG.openness.openRatio);
    handView = { palm, tips: TIP_IDS.map((i) => pts[i] ?? palm) };

    const isOutside = outsideRest ? outsideRest.update(distance(center, palm)) : true;
    if (!isOutside) {
      shownSector = null;
      armed = true;
      silence();
      return;
    }
    const deg = angleDeg(center, palm);
    const sector = nextSector(shownSector, deg, palette.length, CONFIG.sector.deadZoneDeg);
    shownSector = sector;

    if (!sounding.update(openPercent) || !armed) {
      silence();
      return;
    }
    const midi = midiByIndex[sector] ?? [];
    if (midi.length === 0) {
      silence();
      return;
    }
    if (state !== "PLAYING" || sector !== currentSector) {
      output.play(midi);
      currentSector = sector;
      setState("PLAYING");
    }
    level = (openPercent / 100) ** 2;
    output.setLevel(level);
    return;
  }

  if (!present) {
    // 유예 500ms 초과: 완전히 놓는다
    resetHandState();
    armed = true;
    silence();
  }
  // 유예 시간 안이면 마지막 상태 유지
}

function fpsNow(now: number): number {
  while (frameTimes.length > 0) {
    const first = frameTimes[0];
    if (first === undefined || now - first <= 1000) break;
    frameTimes.shift();
  }
  return frameTimes.length;
}

function draw(now: number): void {
  if (notice && now > noticeUntil) notice = null;
  const active = state === "READY" || state === "PLAYING";
  const scene: Scene = {
    width: canvas.width,
    height: canvas.height,
    palette,
    selected: shownSector,
    hand: handView,
    otherPalms,
    openPercent,
    level,
    muted: state !== "PLAYING",
    fps: active ? fpsNow(now) : 0,
    delegate: active ? tracker.delegate : null,
    message,
    notice,
    debug: debug ? `ratio ${lastRatio.toFixed(2)} | ${labelsForDebug.join(" ") || "no hand"} | ${state}${armed ? "" : " (Reset 대기)"}` : null,
  };
  drawScene(ctx, scene);
}

function loop(now: number): void {
  try {
    const active = state === "READY" || state === "PLAYING";
    if (active) {
      if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        lastFrameAt = now;
        processFrame(now);
        frameTimes.push(now);
        consecutiveErrors = 0; // 프레임을 실제로 처리한 경우에만 초기화 (매 틱 초기화하면 30회 연속에 도달하지 못한다)
      } else if (now - lastFrameAt > CONFIG.hold.lostGraceMs && (state === "PLAYING" || handView !== null || shownSector !== null)) {
        // 워치독: 영상이 멈추면(트랙 종료·절전·다른 앱) 프레임 없이도 500ms 안에 소리를 끄고 표시를 지운다
        const wasPlaying = state === "PLAYING";
        resetHandState();
        silence();
        if (wasPlaying) showNotice("영상이 멈춰 소리를 껐습니다", 3000);
      }
    }
  } catch (e) {
    consecutiveErrors++;
    console.error(e);
    silence();
    if (consecutiveErrors >= CONFIG.loop.maxConsecutiveErrors) {
      enterError(`처리 중 오류가 반복됩니다.\n${describeError(e)}`);
    }
  }
  try {
    draw(now);
  } catch (e) {
    console.error(e);
  }
  requestAnimationFrame(loop);
}

// ── 부팅 ────────────────────────────────────────────────
resize();
loadPalette();
loadSwap();
try {
  assertCameraSupported();
} catch (e) {
  message = describeError(e);
  startBtn.disabled = true;
}
if (/Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent)) {
  showNotice("Safari는 테스트되지 않았습니다. Chrome을 권장합니다", 6000);
}
requestAnimationFrame(loop);
