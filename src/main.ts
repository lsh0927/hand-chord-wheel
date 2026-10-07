import { CONFIG } from "./config";
import { assertCameraSupported, openCamera, stopCamera } from "./camera";
import { HandTracker, HAND_CONNECTIONS } from "./tracker";
import { FaceTracker } from "./face";
import type { AvatarView, AvatarInfo } from "./avatar"; // 타입만 — 정적 import면 three.js가 메인 번들에 묶인다
import { ToneOutput } from "./audio";
import type { ChordOutput } from "./output";
import { MidiManager, MidiOutput, isWebMidiSupported } from "./midi";
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
import { drawScene, wheelGeometry, WHEEL_ANCHORS, type Scene, type HandView, type WheelAnchor } from "./overlay";
import { FingerDetector, fingerCount, fingerFlags, heightPercent, StableValue } from "./fingers";

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
const avatarCanvas = $<HTMLCanvasElement>("avatar");
const avatarMsg = $<HTMLDivElement>("avatar-msg");
const camViewSelect = $<HTMLSelectElement>("camview");
const vrmInput = $<HTMLInputElement>("vrmfile");
const ctx2d = canvas.getContext("2d");
if (!ctx2d) throw new Error("Canvas 2D 컨텍스트를 만들 수 없습니다");
const ctx: CanvasRenderingContext2D = ctx2d;
const debug = new URLSearchParams(location.search).has("debug");

const toneOutput = new ToneOutput();
let output: ChordOutput = toneOutput;
let midiOut: MidiOutput | null = null;
const midi = new MidiManager();
const outputSelect = $<HTMLSelectElement>("output");
const wheelPosSelect = $<HTMLSelectElement>("wheelpos");
let wheelAnchor: WheelAnchor = CONFIG.wheel.defaultAnchor;
type SelectMode = "wheel" | "fingers";
const modeSelect = $<HTMLSelectElement>("mode");
let selectMode: SelectMode = CONFIG.select.defaultMode;
const fingerStable = new StableValue(CONFIG.fingers.holdMs);
const fingerDetector = new FingerDetector();
let rawFingerCount: number | null = null;
let fingerDebug = "";
let switchSeq = 0; // 출력 전환 세대. 늦게 끝난 전환은 버린다
let switchingTo: string | null = null; // 전환 진행 중 상자에 보여 줄 값
let lastOptionsKey = ""; // 상자 재구성 생략용
const tracker = new HandTracker();
const hold = new HoldTracker(CONFIG.hold.lostGraceMs);

// ── 아바타·얼굴(선택 기능) ────────────────────────────────
type CamView = "avatar" | "avatar-nopip" | "video";
const CAM_VIEWS: readonly CamView[] = ["avatar", "avatar-nopip", "video"];
let camView: CamView = CONFIG.avatar.defaultCamView;
const faceTracker = new FaceTracker();
const faceHold = new HoldTracker(CONFIG.face.lostGraceMs);
let faceAvailable = false; // 얼굴 모델 파일이 서버에 있는가(선택 자산)
let faceInitInFlight = false;
let faceErrors = 0;
let faceEvery = 1; // N프레임마다 얼굴 추적(CPU 폴백·저속이면 2)
let frameCount = 0;
let slowSince: number | null = null;
let readyAt = 0;
let faceHint: string | null = null;
let avatar: AvatarView | null = null;
let avatarPromise: Promise<AvatarView> | null = null;
let avatarLoads = 0;
let avatarHint: string | null = null;
let avatarDisabled = false;
let avatarErrors = 0;
let lastAvatarRender = 0;
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
let cameraFps: number | null = null;
let vfcHandle: number | null = null;
// MediaStream을 재생하는 video의 currentTime은 프레임 단위가 아니라 연속으로 증가하므로 rAF에서 currentTime 비교로는
// 새 프레임을 골라낼 수 없다(디스플레이 120 Hz면 초당 100번 넘게 손 추적을 돌리게 된다). 카메라 프레임마다 정확히 한 번 부르는
// requestVideoFrameCallback을 우선 쓰고, 없는 브라우저에서만 currentTime 비교로 대체한다.
const hasVideoFrameCallback = typeof video.requestVideoFrameCallback === "function";
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
  fingerStable.reset();
  fingerDetector.reset();
  rawFingerCount = null;
  fingerDebug = "";
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

// ── 소리 출력 선택 ──────────────────────────────────────
type OutputPref = { kind: "tone" } | { kind: "midi"; id: string; name: string };

function outputLabel(): string {
  return midiOut ? `MIDI: ${midiOut.name}` : "브라우저 신디";
}

function saveOutputPref(p: OutputPref): void {
  try {
    localStorage.setItem(CONFIG.midi.storageKey, JSON.stringify(p));
  } catch {
    /* 무시 */
  }
}

function loadOutputPref(): OutputPref | null {
  try {
    const raw = localStorage.getItem(CONFIG.midi.storageKey);
    if (!raw) return null;
    const p: unknown = JSON.parse(raw);
    if (typeof p !== "object" || p === null) return null;
    const o = p as { kind?: unknown; id?: unknown; name?: unknown };
    if (o.kind === "midi" && typeof o.id === "string" && typeof o.name === "string") return { kind: "midi", id: o.id, name: o.name };
    if (o.kind === "tone") return { kind: "tone" };
    return null;
  } catch {
    return null;
  }
}

/** 상자 다시 그리기. 내용이 같으면 건너뛴다(자기 open()으로 오는 statechange마다 드롭다운이 닫히지 않게) */
function renderOutputOptions(): void {
  const items: Array<[string, string, boolean]> = [["tone", "출력: 브라우저 신디", false]];
  if (!isWebMidiSupported()) {
    items.push(["midi-unsupported", window.isSecureContext ? "MIDI 미지원 (Chrome 필요)" : "MIDI 사용 불가 (localhost로 여세요)", true]);
  } else if (!midi.ready) {
    items.push(["midi-request", "MIDI 장치 찾기…", false]);
  } else {
    const ports = midi.outputs();
    if (ports.length === 0) items.push(["midi-none", "MIDI 포트 없음 (IAC 드라이버를 켜세요)", true]);
    for (const p of ports) items.push([`midi:${p.id}`, `MIDI: ${p.name}`, false]);
  }
  const wanted = switchingTo ?? (midiOut ? `midi:${midiOut.portId}` : "tone");
  const value = items.some(([v]) => v === wanted) ? wanted : "tone";
  const key = JSON.stringify([items, wanted]);
  if (key !== lastOptionsKey) {
    lastOptionsKey = key;
    outputSelect.innerHTML = "";
    for (const [v, text, disabled] of items) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = text;
      o.disabled = disabled;
      outputSelect.appendChild(o);
    }
  }
  // 항목 재구성을 생략해도 선택값은 항상 맞춘다(권한 거부 뒤 상자가 '찾기…'에 멈추지 않게)
  if (outputSelect.value !== value) outputSelect.value = value;
}

/** 현재 MIDI 출력을 떼고 Tone 출력으로 되돌린다(세대·저장값은 건드리지 않음) */
function dropMidiOutput(): void {
  if (midiOut) {
    midiOut.dispose();
    midiOut = null;
  }
  output = toneOutput;
}

/** Tone 컨텍스트가 멈춰 있으면(제스처 밖 복귀 등) 안내 */
function ensureToneRunning(): void {
  void toneOutput
    .start()
    .then(() => {
      audioSuspended = !toneOutput.isRunning();
      if (audioSuspended && output === toneOutput) showNotice("소리가 꺼져 있습니다. 화면을 한 번 클릭하세요", 6000);
    })
    .catch(() => {});
}

/** 브라우저 신디로. persist=false는 장애 복귀(사용자 선택을 덮어쓰지 않는다) */
function switchToTone(reason?: string, persist = true): void {
  switchSeq++;
  switchingTo = null;
  silence();
  dropMidiOutput();
  if (persist) saveOutputPref({ kind: "tone" });
  renderOutputOptions();
  showNotice(reason ? `${reason} → 브라우저 신디로 전환` : "출력: 브라우저 신디", reason ? 6000 : 2500);
  ensureToneRunning();
}

/** 현재 MIDI 출력의 끊김·반복 실패. 다른 포트로 전환이 진행 중이면 그 전환을 살려 두고 현재 출력만 뗀다 */
function onMidiFailed(reason: string): void {
  if (switchingTo !== null) {
    silence();
    dropMidiOutput();
    renderOutputOptions();
    showNotice(`${reason} → 브라우저 신디로 전환`, 6000);
    ensureToneRunning();
    return;
  }
  switchToTone(reason, false);
}

async function switchToMidi(id: string): Promise<void> {
  if (switchingTo === `midi:${id}`) return; // 이미 그 포트로 전환 중
  if (midiOut && midiOut.portId === id) {
    // 현재 포트 유지. 다른 포트로 전환이 진행 중이었다면 그 전환을 취소한다
    if (switchingTo !== null) {
      switchSeq++;
      switchingTo = null;
      renderOutputOptions();
    }
    return;
  }
  const port = midi.getOutput(id);
  if (!port) {
    showNotice("선택한 MIDI 포트를 찾지 못했습니다(연결 끊김?)", 4000);
    renderOutputOptions();
    return;
  }
  const seq = ++switchSeq;
  switchingTo = `midi:${id}`;
  renderOutputOptions();
  const next = new MidiOutput(port, (reason) => {
    if (midiOut === next) onMidiFailed(reason); // 현재 출력이 아닌 인스턴스의 실패는 무시
  });
  try {
    await next.start();
  } catch (e) {
    if (seq === switchSeq) {
      switchingTo = null;
      showNotice(describeError(e), 6000);
      renderOutputOptions();
    }
    return;
  }
  if (seq !== switchSeq) {
    next.dispose(); // 그 사이 다른 선택이 이겼다
    return;
  }
  switchingTo = null;
  if (!next.isRunning()) {
    next.dispose();
    showNotice(`MIDI 포트가 연결 상태가 아닙니다: ${next.name}`, 5000);
    renderOutputOptions();
    return;
  }
  silence(); // 이전 출력의 음을 놓는다
  if (midiOut) midiOut.dispose();
  midiOut = next;
  output = next;
  saveOutputPref({ kind: "midi", id: next.portId, name: next.name });
  renderOutputOptions();
  showNotice(`MIDI 출력: ${next.name} — GarageBand에서 소프트웨어 악기 트랙을 선택해 두세요`, 6000);
}

async function requestMidiAndPick(): Promise<void> {
  const seq = switchSeq;
  try {
    await midi.request();
  } catch (e) {
    showNotice(describeError(e), 7000);
    renderOutputOptions();
    return;
  }
  renderOutputOptions();
  if (seq !== switchSeq) return; // 기다리는 동안 사용자가 다른 출력을 골랐다 — 자동 선택하지 않는다
  const ports = midi.outputs();
  const only = ports[0];
  if (ports.length === 1 && only) {
    await switchToMidi(only.id);
    return;
  }
  if (ports.length === 0) {
    showNotice("MIDI 출력 포트가 없습니다. Audio MIDI 설정 → MIDI 스튜디오 → IAC 드라이버 → '장치가 온라인 상태' 체크", 8000);
    return;
  }
  showNotice(`MIDI 포트 ${ports.length}개를 찾았습니다. 상자에서 고르세요`, 5000);
}

async function restoreOutputPref(): Promise<void> {
  const pref = loadOutputPref();
  if (!pref || pref.kind !== "midi" || !isWebMidiSupported()) return;
  const seq = switchSeq;
  try {
    await midi.request();
  } catch {
    showNotice(`저장된 MIDI 출력 '${pref.name}'을 복원하지 못해 브라우저 신디로 시작합니다`, 6000);
    renderOutputOptions();
    return;
  }
  if (seq !== switchSeq) {
    renderOutputOptions();
    return; // 복원 중 사용자가 직접 골랐다
  }
  const byName = midi.findByName(pref.name);
  const target = midi.findById(pref.id) ?? (byName.length === 1 ? byName[0] : null) ?? null;
  renderOutputOptions();
  if (target) await switchToMidi(target.id);
  else showNotice(`저장된 MIDI 포트 '${pref.name}'을 찾지 못해 브라우저 신디로 시작합니다`, 6000);
}

outputSelect.addEventListener("change", () => {
  const v = outputSelect.value;
  if (v === "tone") switchToTone();
  else if (v === "midi-request") void requestMidiAndPick();
  else if (v.startsWith("midi:")) void switchToMidi(v.slice(5));
});
midi.onChange(() => renderOutputOptions());

// ── 선택 방식 ────────────────────────────────────────────
function isSelectMode(v: string): v is SelectMode {
  return v === "wheel" || v === "fingers";
}

function applyMode(m: SelectMode): void {
  selectMode = m;
  modeSelect.value = m;
  shownSector = null;
  fingerStable.reset();
  fingerDetector.reset();
  sounding.reset();
  outsideRest?.reset();
  silence();
}

function loadMode(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(CONFIG.select.modeStorageKey);
  } catch {
    saved = null;
  }
  applyMode(saved && isSelectMode(saved) ? saved : CONFIG.select.defaultMode);
}

modeSelect.addEventListener("change", () => {
  const v = modeSelect.value;
  if (!isSelectMode(v)) return;
  applyMode(v);
  try {
    localStorage.setItem(CONFIG.select.modeStorageKey, v);
  } catch {
    /* 무시 */
  }
});

// ── 휠 위치 ─────────────────────────────────────────────
function isWheelAnchor(v: string): v is WheelAnchor {
  return (WHEEL_ANCHORS as readonly string[]).includes(v);
}

function applyWheelAnchor(a: WheelAnchor): void {
  wheelAnchor = a;
  wheelPosSelect.value = a;
  frame.dataset.pip = a === "bottom-left" ? "right" : "left"; // 미리보기는 패널 반대편
  // 중심이 바뀌면 손의 각도도 바뀌므로 표시 칸을 비우고 다음 프레임에 새로 고른다
  shownSector = null;
  outsideRest?.reset();
  silence();
}

function loadWheelAnchor(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(CONFIG.wheel.anchorStorageKey);
  } catch {
    saved = null;
  }
  applyWheelAnchor(saved && isWheelAnchor(saved) ? saved : CONFIG.wheel.defaultAnchor);
}

wheelPosSelect.addEventListener("change", () => {
  const v = wheelPosSelect.value;
  if (!isWheelAnchor(v)) return;
  applyWheelAnchor(v);
  try {
    localStorage.setItem(CONFIG.wheel.anchorStorageKey, v);
  } catch {
    /* 무시 */
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
  for (const prefix of ["UNSUPPORTED: ", "ASSET_MISSING: ", "TIMEOUT: ", "AUDIO: ", "CANCELLED: ", "DENIED: ", "MIDI: ", "VRM: "]) {
    if (text.startsWith(prefix)) return text.slice(prefix.length);
  }
  if (name === "NotAllowedError") return "카메라 권한이 거부되었습니다.\n주소창 왼쪽 아이콘 → 카메라 → 허용 후 '다시 시도'";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "카메라를 찾을 수 없습니다. 연결을 확인하세요.";
  if (name === "NotReadableError") return "다른 앱이 카메라를 쓰고 있습니다. 그 앱을 닫고 '다시 시도'";
  return `시작 실패: ${text}`;
}

// ── 영상 표시 상자·아바타·얼굴 추적 ─────────────────────────
function isCamView(v: string): v is CamView {
  return (CAM_VIEWS as readonly string[]).includes(v);
}
function applyCamView(v: CamView, persist = true): void {
  camView = v;
  camViewSelect.value = v; // 상자 값은 적용 함수가 책임진다(gotcha 12)
  frame.dataset.camview = v;
  if (persist) {
    try {
      localStorage.setItem(CONFIG.avatar.camViewStorageKey, v);
    } catch {
      /* 저장 불가는 무시 */
    }
  }
  if (v !== "video") {
    void ensureAvatar();
    requestAnimationFrame(fitAvatar); // display:none → 표시로 바뀐 뒤 레이아웃 반영 후 크기 맞춤
    if (state === "READY" || state === "PLAYING") startFaceInit();
  }
}
function loadCamView(): void {
  let v: CamView = CONFIG.avatar.defaultCamView;
  try {
    const s = localStorage.getItem(CONFIG.avatar.camViewStorageKey);
    if (s && isCamView(s)) v = s;
  } catch {
    /* 무시 */
  }
  applyCamView(v, false);
}
camViewSelect.addEventListener("change", () => {
  const v = camViewSelect.value;
  if (isCamView(v)) applyCamView(v);
});
function fitAvatar(): void {
  avatar?.resize(avatarCanvas.clientWidth, avatarCanvas.clientHeight, window.devicePixelRatio);
}
/** three.js·three-vrm을 처음 필요할 때만 내려받아 아바타 장면을 만든다(메모이즈). 실패하면 영상 모드로 폴백 */
function ensureAvatar(): Promise<AvatarView> {
  if (avatarPromise) return avatarPromise;
  const p = (async () => {
    const mod = await import("./avatar");
    const view = new mod.AvatarView(avatarCanvas);
    view.onContextChange = (lost) => {
      avatarHint = lost ? "그래픽 컨텍스트가 끊겨 아바타를 잠시 숨깁니다…" : null;
    };
    return view;
  })();
  avatarPromise = p;
  p.then((view) => {
    avatar = view;
    fitAvatar();
    return loadDefaultAvatar(view);
  }).catch((e: unknown) => {
    console.error(e);
    if (avatarPromise === p) avatarPromise = null;
    showNotice(`아바타를 켤 수 없어 카메라 영상으로 표시합니다 (${describeError(e)})`, 6000);
    applyCamView("video", false);
  });
  return p;
}
async function loadDefaultAvatar(view: AvatarView): Promise<void> {
  const info = await loadAvatar(view, CONFIG.avatar.defaultPath, true);
  if (info) showNotice(`아바타: ${info.name} (VRM ${info.metaVersion})`);
}
/** 아바타 로드. 실패하면 null(안내는 avatarHint). 큰 파일은 주 스레드를 수 초 멈추므로 먼저 소리를 끈다 */
async function loadAvatar(view: AvatarView, url: string, isDefault = false): Promise<AvatarInfo | null> {
  silence();
  avatarLoads++;
  avatarHint = "아바타 불러오는 중…";
  try {
    const info = await view.load(url);
    avatarHint = null;
    return info;
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    if (text.startsWith("CANCELLED: ")) return null; // 뒤에 시작된 로드가 결과를 가져간다
    if (text.startsWith("VRM_NOT_FOUND: ")) {
      if (!isDefault) console.error(e);
      avatarHint = isDefault
        ? "VRM 파일이 없습니다 — public/avatar.vrm 에 두거나 오른쪽 위 'VRM 불러오기'"
        : `아바타 로드 실패 — ${text.slice("VRM_NOT_FOUND: ".length)}`;
      return null;
    }
    console.error(e);
    avatarHint = `아바타 로드 실패 — ${text.replace(/^VRM: /, "")}`;
    return null;
  } finally {
    avatarLoads--;
  }
}
vrmInput.addEventListener("change", async () => {
  const file = vrmInput.files?.[0];
  if (!file) return;
  try {
    if (camView === "video") applyCamView("avatar"); // 파일을 골랐다 = 아바타를 보고 싶다
    const view = await ensureAvatar();
    const url = URL.createObjectURL(file);
    try {
      const info = await loadAvatar(view, url);
      if (info) showNotice(`아바타: ${info.name} (VRM ${info.metaVersion}) — 새로고침하면 다시 골라야 합니다. 영구 적용은 public/avatar.vrm`, 7000);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    console.error(e);
  } finally {
    vrmInput.value = ""; // 같은 파일을 다시 골라도 change가 나게
  }
});
/** 얼굴 모델 로드. await하지 않고 배경에서 돈다 — 카메라 권한 대기와 겹친다. 실패해도 시작을 막지 않는다 */
function startFaceInit(): void {
  if (!faceAvailable || faceInitInFlight || faceTracker.ready || camView === "video") return;
  const attempt = startAttempt;
  const isStale = (): boolean => attempt !== startAttempt;
  faceInitInFlight = true;
  faceHint = "얼굴 모델 불러오는 중…";
  faceTracker
    .init(isStale)
    .then((d) => {
      if (isStale()) return;
      faceHint = null;
      faceErrors = 0;
      faceEvery = d === "CPU" ? 2 : 1;
      if (d === "CPU") showNotice("얼굴 모델 CPU 모드 — 2프레임마다 추적", 5000);
    })
    .catch((e: unknown) => {
      if (isStale()) return;
      console.warn("얼굴 모델 로드 실패", e);
      faceHint = null;
      showNotice(`얼굴 추적 없이 계속합니다 (${describeError(e)})`, 6000);
    })
    .finally(() => {
      faceInitInFlight = false;
    });
}
/** 얼굴 추적 + 아바타 반영. 손 처리와 격리 — 예외가 연주를 끊지 않는다 */
function trackFace(now: number): void {
  const av = avatar;
  if (!faceTracker.ready || camView === "video" || !av?.loaded) return;
  frameCount++;
  if (frameCount % faceEvery !== 0) return;
  try {
    const face = faceTracker.detect(video, now);
    const present = faceHold.update(face !== null, now);
    if (face) av.applyFace(face);
    else if (!present) av.applyFace(null); // 300 ms 넘게 안 보이면 중립으로 완화
    faceErrors = 0;
    adaptFaceRate(now);
  } catch (e) {
    console.error(e);
    if (++faceErrors >= CONFIG.face.maxErrors) {
      faceTracker.close();
      av.resetPose();
      faceHint = "얼굴 추적을 껐습니다 (오류 반복) — Reset 후 다시 시작하면 재시도";
      showNotice(`얼굴 추적을 껐습니다: ${describeError(e)}`, 6000);
    }
  }
}
/** 처리 fps가 3초 넘게 20 아래면 얼굴 추적을 2프레임마다 */
function adaptFaceRate(now: number): void {
  if (faceEvery >= 2 || now - readyAt < 2000) return;
  if (fpsNow(now) < CONFIG.face.slowFps) {
    slowSince ??= now;
    if (now - slowSince >= CONFIG.face.slowForMs) {
      faceEvery = 2;
      showNotice("처리 속도가 낮아 얼굴 추적을 2프레임마다 합니다", 5000);
    }
  } else {
    slowSince = null;
  }
}
/** 아바타 렌더(30 fps 상한, 자체 try/catch — 렌더 예외가 HUD·연주를 끊지 않는다) */
function renderAvatar(now: number): void {
  const av = avatar;
  if (camView === "video" || !av || avatarDisabled) return;
  if (now - lastAvatarRender < 1000 / CONFIG.avatar.maxFps - 1) return;
  lastAvatarRender = now;
  try {
    av.render();
    avatarErrors = 0;
  } catch (e) {
    console.error(e);
    if (++avatarErrors >= CONFIG.avatar.maxErrors) {
      avatarDisabled = true;
      avatarHint = "아바타 렌더 오류가 반복되어 표시를 껐습니다 — '카메라 영상'으로 바꾸거나 새로고침";
    }
  }
}

/** 모델·wasm 파일이 서버에 있는지 HEAD로 확인. 없으면 결정적인 메시지로 실패한다. 얼굴 모델은 선택 자산이라 없어도 통과. */
async function checkAssets(): Promise<void> {
  const urls = [CONFIG.tracker.modelPath, `${CONFIG.tracker.wasmPath}/vision_wasm_internal.wasm`];
  for (const u of urls) {
    const r = await fetch(u, { method: "HEAD" });
    if (!r.ok) throw new Error(`ASSET_MISSING: ${u} 를 찾지 못했습니다 (HTTP ${r.status}).\n터미널에서 npm run setup 실행 후 새로고침`);
  }
  faceAvailable = await fetch(CONFIG.face.modelPath, { method: "HEAD" })
    .then((r) => r.ok)
    .catch(() => false);
  if (!faceAvailable) showNotice("얼굴 모델이 없어 아바타 표정 없이 시작합니다 — npm run setup", 6000);
}

function resize(): void {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;
  frame.style.aspectRatio = `${w} / ${h}`;
  frame.style.width = `min(100vw, calc(100vh * ${w} / ${h}))`;
  const g = wheelGeometry(w, h, wheelAnchor);
  outsideRest = new Hysteresis(g.restExitR, g.restR);
  fitAvatar();
}

function enterError(text: string): void {
  if (state === "ERROR") return; // 멱등: 먼저 들어온 안내문을 유지한다
  startAttempt++; // 진행 중이던 시작 시도를 무효화 → 늦게 성공한 카메라/모델은 즉시 정리된다
  cancelVideoFrame();
  silence();
  midiOut?.panic();
  resetHandState();
  stopCamera(video);
  tracker.close();
  faceTracker.close(); // 늦게 끝나는 init은 isStale로 스스로 닫힌다
  faceInitInFlight = false;
  faceHold.reset();
  avatar?.resetPose();
  delete frame.dataset.live;
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
  const audioReady = toneOutput.start().catch((e: unknown) => {
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
    startFaceInit(); // 선택 기능: 기다리지 않고 카메라 권한 대기와 겹친다
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
    cameraFps = readCameraFps();
    setState("READY");
    readyAt = performance.now();
    slowSince = null;
    frame.dataset.live = "1"; // 미리보기 표시 허용
    scheduleVideoFrame();
    startBtn.textContent = "실행 중";
    if (delegate === "CPU") showNotice("GPU 모드 실패 → CPU 모드(느림, 약 107 ms/프레임)", 6000);
    if (output === toneOutput && !toneOutput.isRunning()) {
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
  midiOut?.panic();
  resetHandState();
  avatar?.resetPose();
  faceHold.reset();
  // 연주 중/대기 중일 때만 '손을 뗄 때까지 무음'을 건다. IDLE·ERROR에서 누른 Reset이 다음 시작을 막지 않게 한다
  armed = !wasActive;
  if (wasActive) {
    showNotice(
      selectMode === "fingers" ? "초기화됨 — 주먹을 쥐었다 펴거나 손을 내렸다 올리면 다시 소리가 납니다" : "초기화됨 — 손을 내렸다 올리면 다시 소리가 납니다",
      3000,
    );
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    silence();
    midiOut?.panic(); // 탭을 닫을 때도 hidden이 pagehide보다 먼저 와서 1차 방어선이 된다
  }
});
window.addEventListener("pagehide", () => {
  silence();
  midiOut?.panic();
});

// 스트림 도중 해상도가 바뀌면(장치 전환 등) 캔버스·프레임 비율·쉼 원판 반지름을 다시 맞춘다
video.addEventListener("resize", () => {
  if (state !== "READY" && state !== "PLAYING") return;
  cameraFps = readCameraFps();
  if (canvas.width === video.videoWidth && canvas.height === video.videoHeight) return;
  resize();
  resetHandState();
  silence();
});

function readCameraFps(): number | null {
  const stream = video.srcObject as MediaStream | null;
  const fr = stream?.getVideoTracks()[0]?.getSettings().frameRate;
  return typeof fr === "number" ? fr : null;
}

// 오디오 컨텍스트가 멈추면(절전 복귀·출력 장치 전환) 안내하고, 다음 클릭/키에서 재개
toneOutput.onStateChange((running) => {
  if (output !== toneOutput) return;
  audioSuspended = !running;
  if (!running && (state === "READY" || state === "PLAYING")) {
    silence();
    showNotice("오디오가 일시중지되었습니다. 화면을 클릭하면 다시 켜집니다", 8000);
  }
});
async function resumeAudioIfNeeded(): Promise<void> {
  if (!audioSuspended) return;
  try {
    await toneOutput.resume();
    if (toneOutput.isRunning()) {
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
  const geo = wheelGeometry(W, H, wheelAnchor);
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
    if (prevSeen !== null && now - prevSeen > CONFIG.smoothing.resetAfterGapMs) {
      resetFilters();
      fingerDetector.reset(); // 공백 뒤 손가락 펴짐 판정도 새로 시작(안정화 타이머는 StableValue가 공백을 제외한다)
    }
    prevPalmNorm = hand.palm;

    // 거울 표시 좌표(픽셀)로 변환: x → (1 - x). 펼침 비율도 이 등방 좌표로 계산한다
    const pts: Point[] = hand.landmarks.map((l) => ({ x: (1 - l.x) * W, y: l.y * H }));
    const rawPalm = palmCenter(pts);
    const palm: Point = { x: emaX.next(rawPalm.x), y: emaY.next(rawPalm.y) };
    const ratio = emaRatio.next(opennessRatio(pts));
    lastRatio = ratio;
    openPercent = opennessPercent(ratio, CONFIG.openness.closedRatio, CONFIG.openness.openRatio);
    handView = { palm, tips: TIP_IDS.map((i) => pts[i] ?? palm), all: pts };

    if (selectMode === "fingers") {
      // 손목·네 뿌리 관절이 화면 밖이면 외삽 좌표라 판정을 보류한다
      const m = CONFIG.fingers.frameMargin;
      const inFrame = [0, 5, 9, 13, 17].every((i) => {
        const l = hand.landmarks[i];
        return !!l && l.x >= -m && l.x <= 1 + m && l.y >= -m && l.y <= 1 + m;
      });
      processFingerFrame(pts, palm, H, now, inFrame);
      return;
    }

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
      const out = output;
      out.play(midi);
      if (output !== out) {
        silence(); // 전송 중 출력이 교체됨(끊김 복귀). 다음 프레임에 새 출력으로 다시 친다
        return;
      }
      currentSector = sector;
      setState("PLAYING");
    }
    level = (openPercent / 100) ** 2;
    output.setLevel(level, openPercent / 100);
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

/** 손가락 모드: 펴진 손가락 수로 코드, 손 높이로 음량 */
function processFingerFrame(pts: Point[], palm: Point, H: number, now: number, inFrame: boolean): void {
  openPercent = Math.max(CONFIG.fingers.minPercent, heightPercent(palm.y, H));
  if (inFrame) {
    const states = fingerDetector.update(pts);
    const raw = fingerCount(states);
    rawFingerCount = raw;
    fingerDebug = fingerFlags(states);
    fingerStable.update(raw, now);
  } else {
    fingerDebug = "손목·뿌리 화면 밖 — 판정 보류";
  }
  const stable = fingerStable.value;
  if (stable === null) {
    // 아직 확정된 적이 없는데 판정 보류 중(손목이 화면 밖) — Reset 대기(armed)를 건드리지 않는다
    silence();
    return;
  }
  if (stable === 0) {
    shownSector = null;
    armed = true; // 주먹 = 쉼이자 재무장
    silence();
    return;
  }
  const sector = stable - 1;
  if (sector >= palette.length) {
    // palette.min이 6이라 현재는 도달하지 않는 방어 분기
    shownSector = null;
    silence();
    return;
  }
  shownSector = sector;
  if (!armed) {
    silence();
    return;
  }
  const midi = midiByIndex[sector] ?? [];
  if (midi.length === 0) {
    silence();
    return;
  }
  if (state !== "PLAYING" || sector !== currentSector) {
    const out = output;
    out.play(midi);
    if (output !== out) {
      silence();
      return;
    }
    currentSector = sector;
    setState("PLAYING");
  }
  level = (openPercent / 100) ** CONFIG.fingers.levelExponent;
  output.setLevel(level, openPercent / 100);
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
  renderAvatar(now);
  if (notice && now > noticeUntil) notice = null;
  const active = state === "READY" || state === "PLAYING";
  const scene: Scene = {
    width: canvas.width,
    height: canvas.height,
    palette,
    selected: shownSector,
    hand: handView,
    otherPalms,
    connections: HAND_CONNECTIONS,
    openPercent,
    level,
    muted: state !== "PLAYING" || level < 0.02, // 바닥 근처의 사실상 무음도 연하게 표시
    fps: active ? fpsNow(now) : 0,
    cameraFps: active ? cameraFps : null,
    delegate: active ? tracker.delegate : null,
    outputName: outputLabel(),
    anchor: wheelAnchor,
    mode: selectMode,
    fingerCount: selectMode === "fingers" ? rawFingerCount : null,
    message,
    notice,
    debug: debug
      ? `${selectMode === "fingers" ? `h ${openPercent.toFixed(0)}%` : `ratio ${lastRatio.toFixed(2)}`} | ${labelsForDebug.join(" ") || "no hand"} | ${state}${armed ? "" : " (Reset 대기)"}${
          selectMode === "fingers" ? ` | ${fingerDebug || "-"} raw ${rawFingerCount ?? "-"} stable ${fingerStable.value ?? "-"}` : ""
        }`
      : null,
  };
  drawScene(ctx, scene);
  const msg = avatarHint ?? faceHint ?? "";
  if (avatarMsg.textContent !== msg) avatarMsg.textContent = msg;
}

/** 카메라 프레임 한 장 처리. 예외는 여기서 격리한다 — 1회면 소리만 끄고 계속, 연속 30회면 ERROR. */
function handleFrame(now: number): void {
  try {
    lastFrameAt = now;
    processFrame(now);
    frameTimes.push(now);
    consecutiveErrors = 0; // 프레임을 실제로 처리한 경우에만 초기화 (매 틱 초기화하면 30회 연속에 도달하지 못한다)
  } catch (e) {
    consecutiveErrors++;
    console.error(e);
    silence();
    if (consecutiveErrors >= CONFIG.loop.maxConsecutiveErrors) {
      enterError(`처리 중 오류가 반복됩니다.\n${describeError(e)}`);
    }
  }
  trackFace(now); // 선택 기능 — 손 처리와 격리
}

function onVideoFrame(now: DOMHighResTimeStamp, _meta: VideoFrameCallbackMetadata): void {
  vfcHandle = null;
  if (state !== "READY" && state !== "PLAYING") return; // 체인 종료. 다음 시작 성공 때 다시 건다
  handleFrame(now);
  scheduleVideoFrame();
}

function scheduleVideoFrame(): void {
  if (!hasVideoFrameCallback || vfcHandle !== null) return;
  vfcHandle = video.requestVideoFrameCallback(onVideoFrame);
}

function cancelVideoFrame(): void {
  if (vfcHandle !== null) {
    video.cancelVideoFrameCallback(vfcHandle);
    vfcHandle = null;
  }
}

function loop(now: number): void {
  try {
    const active = state === "READY" || state === "PLAYING";
    if (active) {
      if (!hasVideoFrameCallback && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        // 대체 경로(requestVideoFrameCallback 없는 브라우저): currentTime이 바뀐 틱에만 처리
        lastVideoTime = video.currentTime;
        handleFrame(now);
      } else if (now - lastFrameAt > CONFIG.hold.lostGraceMs && (state === "PLAYING" || handView !== null || shownSector !== null)) {
        // 워치독: 영상이 멈추면(트랙 종료·절전·다른 앱) 프레임 없이도 500ms 안에 소리를 끄고 표시를 지운다
        const wasPlaying = state === "PLAYING";
        resetHandState();
        silence();
        if (wasPlaying) showNotice("영상이 멈춰 소리를 껐습니다", 3000);
      }
    }
  } catch (e) {
    console.error(e);
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
loadWheelAnchor();
loadMode();
loadCamView();
window.addEventListener("resize", fitAvatar);
renderOutputOptions();
void restoreOutputPref();
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
