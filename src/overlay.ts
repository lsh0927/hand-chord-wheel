import { CONFIG } from "./config";
import type { Point } from "./mapping";

export interface WheelGeometry {
  cx: number;
  cy: number;
  outerR: number;
  restR: number;
  restExitR: number;
  labelR: number;
}

export function wheelGeometry(width: number, height: number): WheelGeometry {
  const outerR = height * CONFIG.wheel.outerRadiusRatio;
  const restR = height * CONFIG.wheel.restRadiusRatio;
  return {
    cx: width / 2,
    cy: height / 2,
    outerR,
    restR,
    restExitR: restR * CONFIG.wheel.restExitFactor,
    labelR: outerR * CONFIG.wheel.labelRadiusRatio,
  };
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
  fps: number;
  delegate: "GPU" | "CPU" | null;
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
  const g = wheelGeometry(W, H);
  const n = Math.max(1, s.palette.length);
  const span = 360 / n;

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
  }

  // HUD 좌상단
  const chordName = s.selected !== null ? (s.palette[s.selected] ?? "-") : "-";
  hudBox(ctx, 16, 16, "CHORD · R", chordName, H);
  hudBox(ctx, 16 + Math.round(H * 0.24), 16, "R OPEN", `${Math.round(s.openPercent)}%`, H);

  // 오른쪽 세로 음량 막대
  const barH = H * 0.5;
  const barX = W - 28;
  const barY = (H - barH) / 2;
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(barX, barY, 8, barH);
  ctx.fillStyle = `rgba(${BLUE},0.95)`;
  ctx.fillRect(barX, barY + barH * (1 - s.level), 8, barH * s.level);

  // fps / delegate / 디버그
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 ${Math.round(H * 0.02)}px system-ui, sans-serif`;
  const slow = s.fps > 0 && s.fps < CONFIG.fps.warnBelow;
  ctx.fillStyle = slow ? "#ffd166" : "rgba(255,255,255,0.7)";
  ctx.fillText(`${s.fps.toFixed(0)} fps${s.delegate ? ` · ${s.delegate}` : ""}${slow ? " · 느림" : ""}`, 16, H - 20);
  if (s.debug) ctx.fillText(s.debug, 16, H - 44);

  if (s.notice) {
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffd166";
    ctx.font = `600 ${Math.round(H * 0.025)}px system-ui, sans-serif`;
    ctx.fillText(s.notice, W / 2, 16);
  }
  if (s.message) centerMessage(ctx, W, H, s.message);
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

function centerMessage(ctx: CanvasRenderingContext2D, W: number, H: number, text: string): void {
  const lines = text.split("\n");
  const boxH = Math.max(H * 0.16, lines.length * H * 0.045 + H * 0.06);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, H / 2 - boxH / 2, W, boxH);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(H * 0.03)}px system-ui, sans-serif`;
  lines.forEach((line, i) => ctx.fillText(line, W / 2, H / 2 + (i - (lines.length - 1) / 2) * H * 0.045));
}
