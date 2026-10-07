import { CONFIG } from "./config";
import type { Point } from "./mapping";

export type WheelAnchor = "center" | "bottom-left" | "bottom-right";
export const WHEEL_ANCHORS: readonly WheelAnchor[] = ["center", "bottom-left", "bottom-right"];

export interface WheelGeometry {
  cx: number;
  cy: number;
  outerR: number;
  restR: number;
  restExitR: number;
  labelR: number;
}

/** 휠의 중심·반지름. 구석 배치는 반지름을 줄이고 바닥 선(85%) 위에 두어 얼굴과 하단 바를 피한다 */
export function wheelGeometry(width: number, height: number, anchor: WheelAnchor = "center"): WheelGeometry {
  const restR = height * CONFIG.wheel.restRadiusRatio;
  const common = { restR, restExitR: restR * CONFIG.wheel.restExitFactor };
  if (anchor === "center") {
    const outerR = height * CONFIG.wheel.outerRadiusRatio;
    return { cx: width / 2, cy: height / 2, outerR, labelR: outerR * CONFIG.wheel.labelRadiusRatio, ...common };
  }
  const outerR = height * CONFIG.wheel.cornerRadiusRatio;
  const margin = width * CONFIG.wheel.cornerSideMargin;
  const cx = anchor === "bottom-right" ? width - margin - outerR : margin + outerR;
  const cy = height * CONFIG.wheel.cornerBottomLine - outerR;
  return { cx, cy, outerR, labelR: outerR * CONFIG.wheel.labelRadiusRatio, ...common };
}

export interface HandView {
  palm: Point;
  tips: Point[];
}

export interface Scene {
  width: number;
  height: number;
  palette: readonly string[];
  selected: number | null;
  hand: HandView | null;
  otherPalms: Point[]; // 선택되지 않은 손(회색 점)
  openPercent: number;
  level: number;
  muted: boolean;
  fps: number; // 초당 처리한 카메라 프레임 수
  cameraFps: number | null; // 카메라 트랙이 보고하는 프레임 수
  delegate: "GPU" | "CPU" | null;
  outputName: string; // 현재 소리 출력(브라우저 신디 / MIDI: 포트 이름)
  anchor: WheelAnchor;
  mode: "wheel" | "fingers";
  fingerCount: number | null; // 손가락 모드: 안정화 전 원시 개수(손 옆 표시)
  message: string | null; // 중앙 안내문
  notice: string | null; // 상단 짧은 알림
  debug: string | null; // ?debug=1 일 때만
}

/** "12시 기준 시계 방향 도" → canvas 라디안(3시 기준) */
const rad = (deg: number): number => ((deg - 90) * Math.PI) / 180;
const BLUE = "120,190,255";

/** roundRect 미지원 브라우저 폴백 */
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

export function drawScene(ctx: CanvasRenderingContext2D, s: Scene): void {
  const { width: W, height: H } = s;
  ctx.clearRect(0, 0, W, H);
  const g = wheelGeometry(W, H, s.anchor);
  const n = Math.max(1, s.palette.length);
  const span = 360 / n;

  if (s.mode === "wheel") {
  // 선택 부채꼴
  if (s.selected !== null) {
    ctx.beginPath();
    ctx.moveTo(g.cx, g.cy);
    ctx.arc(g.cx, g.cy, g.outerR, rad(s.selected * span - span / 2), rad(s.selected * span + span / 2));
    ctx.closePath();
    ctx.fillStyle = s.muted ? `rgba(${BLUE},0.25)` : `rgba(${BLUE},0.55)`;
    ctx.fill();
  }

  // 바깥 원, 칸 경계선
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(g.cx, g.cy, g.outerR, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < n; k++) {
    const a = rad(k * span - span / 2);
    ctx.beginPath();
    ctx.moveTo(g.cx + g.restR * Math.cos(a), g.cy + g.restR * Math.sin(a));
    ctx.lineTo(g.cx + g.outerR * Math.cos(a), g.cy + g.outerR * Math.sin(a));
    ctx.stroke();
  }

  // 쉼 원판
  ctx.beginPath();
  ctx.arc(g.cx, g.cy, g.restR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(20,20,30,0.75)";
  ctx.fill();
  ctx.stroke();

  // 코드 이름
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 6;
  ctx.font = `600 ${Math.round(H * 0.035)}px system-ui, sans-serif`;
  for (let k = 0; k < n; k++) {
    const a = rad(k * span);
    ctx.fillText(s.palette[k] ?? "", g.cx + g.labelR * Math.cos(a), g.cy + g.labelR * Math.sin(a));
  }
  ctx.font = `700 ${Math.round(H * 0.028)}px system-ui, sans-serif`;
  ctx.fillText("RIGHT HAND — CHORDS", g.cx, g.cy - g.outerR - H * 0.035);
  ctx.shadowBlur = 0;
  } else {
    drawFingerPanel(ctx, g, s, H);
  }

  // 선택되지 않은 손: 회색 점
  ctx.fillStyle = "rgba(200,200,200,0.5)";
  for (const p of s.otherPalms) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // 선택된 손: 손끝 5개와 손바닥 중심
  if (s.hand) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (const t of s.hand.tips) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(s.hand.palm.x, s.hand.palm.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${BLUE},0.95)`;
    ctx.fill();
    if (s.mode === "fingers" && s.fingerCount !== null) {
      // 손 옆 원시 개수. 오른쪽 끝(음량 막대)이나 위쪽에서 잘리지 않게 자리를 바꾼다
      const size = Math.round(H * 0.045);
      const rightRoom = s.hand.palm.x + 16 + size <= W - 40;
      ctx.fillStyle = "#fff";
      ctx.textAlign = rightRoom ? "left" : "right";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 6;
      ctx.fillText(String(s.fingerCount), rightRoom ? s.hand.palm.x + 16 : s.hand.palm.x - 16, Math.max(size, s.hand.palm.y - 16));
      ctx.shadowBlur = 0;
    }
  }

  // HUD 좌상단
  const chordName = s.selected !== null ? (s.palette[s.selected] ?? "-") : "-";
  hudBox(ctx, 16, 16, "CHORD · R", chordName, H);
  hudBox(ctx, 16 + Math.round(H * 0.24), 16, s.mode === "fingers" ? "R HEIGHT" : "R OPEN", `${Math.round(s.openPercent)}%`, H);

  // 오른쪽 세로 음량 막대
  const barH = H * 0.5;
  const barX = W - 28;
  const barY = (H - barH) / 2;
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(barX, barY, 8, barH);
  ctx.fillStyle = `rgba(${BLUE},0.95)`;
  ctx.fillRect(barX, barY + barH * (1 - s.level), 8, barH * s.level);

  // fps / delegate / 디버그 — HUD 상자 바로 아래(하단 입력창과 겹치지 않게)
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `500 ${Math.round(H * 0.02)}px system-ui, sans-serif`;
  const slow = s.fps > 0 && s.fps < CONFIG.fps.warnBelow;
  ctx.fillStyle = slow ? "#ffd166" : "rgba(255,255,255,0.7)";
  const infoY = 16 + Math.round(H * 0.1) + 8;
  const cam = s.cameraFps !== null ? ` · 카메라 ${s.cameraFps.toFixed(0)} fps` : "";
  ctx.fillText(`처리 ${s.fps.toFixed(0)} fps${cam}${s.delegate ? ` · ${s.delegate}` : ""}${slow ? " · 느림" : ""} · 출력 ${s.outputName}`, 16, infoY);
  if (s.debug) ctx.fillText(s.debug, 16, infoY + Math.round(H * 0.026));

  if (s.notice) {
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffd166";
    ctx.font = `600 ${Math.round(H * 0.025)}px system-ui, sans-serif`;
    ctx.fillText(s.notice, W / 2, 16);
  }
  if (s.message) centerMessage(ctx, W, H, s.message, s.anchor, s.mode, g);
}

function hudBox(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, value: string, H: number): void {
  const w = Math.round(H * 0.22);
  const h = Math.round(H * 0.1);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundedRect(ctx, x, y, w, h, 8);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `500 ${Math.round(H * 0.018)}px system-ui, sans-serif`;
  ctx.fillText(label, x + 10, y + 8);
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${Math.round(H * 0.045)}px system-ui, sans-serif`;
  ctx.fillText(value, x + 10, y + Math.round(H * 0.035));
}

/**
 * 안내문. 가운데 배치: 휠 모드는 가로 띠, 손가락 모드는 배지(위쪽 반원) 아래로 띠를 내린다.
 * 구석 배치: 패널·휠 반대편에 상자. 상자의 패널 쪽 끝은 패널 바깥 반지름에서 16px 떨어지게 잘라 4:3 영상에서도 겹치지 않는다.
 */
function centerMessage(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  text: string,
  anchor: WheelAnchor,
  mode: Scene["mode"],
  g: WheelGeometry,
): void {
  const lines = text.split("\n");
  const boxH = Math.max(H * 0.16, lines.length * H * 0.045 + H * 0.06);
  const margin = 16;
  let boxW: number;
  let cx: number;
  let cy = H / 2;
  if (anchor === "center") {
    boxW = W;
    cx = W / 2;
    if (mode === "fingers") cy = g.cy + H * 0.16; // 배지는 중심 위쪽에만 있다
  } else if (anchor === "bottom-right") {
    const rightLimit = g.cx - g.outerR - margin;
    boxW = Math.max(H * 0.3, Math.min(W * 0.58, rightLimit - margin));
    cx = margin + boxW / 2;
  } else {
    const leftLimit = g.cx + g.outerR + margin;
    boxW = Math.max(H * 0.3, Math.min(W * 0.58, W - margin - leftLimit));
    cx = W - margin - boxW / 2;
  }
  ctx.fillStyle = "rgba(0,0,0,0.82)";
  if (anchor === "center") ctx.fillRect(0, cy - boxH / 2, W, boxH);
  else roundedRect(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, 12);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(H * (anchor === "center" ? 0.03 : 0.027))}px system-ui, sans-serif`;
  lines.forEach((line, i) => ctx.fillText(line, cx, cy + (i - (lines.length - 1) / 2) * H * 0.045));
}

/** 손가락 모드: 번호 배지 5개를 휠 자리에 부채꼴로. 선택 배지는 파랑(무음이면 연하게) */
function drawFingerPanel(ctx: CanvasRenderingContext2D, g: WheelGeometry, s: Scene, H: number): void {
  const r = g.outerR * 0.72;
  const badgeR = H * 0.05;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${Math.round(H * 0.028)}px system-ui, sans-serif`;
  ctx.fillText("RIGHT HAND — FINGERS", g.cx, g.cy - g.outerR - H * 0.035);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `500 ${Math.round(H * 0.02)}px system-ui, sans-serif`;
  ctx.fillText("주먹 = 쉼 · 5 = 엄지를 옆으로", g.cx, g.cy - g.outerR - H * 0.035 + H * 0.032);
  ctx.shadowBlur = 0;
  for (let i = 0; i < 5; i++) {
    const a = rad(-76 + 38 * i);
    const x = g.cx + r * Math.cos(a);
    const y = g.cy + r * Math.sin(a);
    const name = s.palette[i];
    const selected = s.selected === i;
    ctx.beginPath();
    ctx.arc(x, y, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = selected ? (s.muted ? `rgba(${BLUE},0.35)` : `rgba(${BLUE},0.85)`) : "rgba(0,0,0,0.5)";
    ctx.fill();
    ctx.strokeStyle = name ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = name ? "#fff" : "rgba(255,255,255,0.35)";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.round(badgeR * 0.9)}px system-ui, sans-serif`;
    ctx.fillText(String(i + 1), x, y - badgeR * 0.1);
    ctx.font = `600 ${Math.round(H * 0.026)}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 6;
    ctx.fillText(name ?? "—", x, y + badgeR + 4); // 팔레트 min이 5 미만으로 내려갈 때만 '—'가 보인다
    ctx.shadowBlur = 0;
  }
}
