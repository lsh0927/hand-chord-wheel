// 왼손 피크 점이 가상 줄을 가로지르는 순간을 찾는다. 브라우저 의존 없음.
import type { Point } from "./mapping";

export interface StrumEvent {
  string: number; // 0 = 가장 낮은 줄(위)
  dir: "down" | "up";
  tMs: number; // 교차 시각(선형 보간)
  speed: number; // 영상 높이/초
}
export interface StrumBand {
  x0: number;
  x1: number;
}
export interface StrumOptions {
  rearmDistRatio: number; // 타격 뒤 줄에서 이만큼(H 비율) 떨어져야 재장전
  minSpeed: number; // 영상 높이/초(보조 가드)
  maxJumpRatio: number; // 프레임당 변위 상한(H 비율) — 넘으면 순간이동
  graceMs: number; // 이 시간 안의 공백은 잇는다
  refractoryMs: number;
}

/** 줄 y좌표(픽셀). 0번이 위(가장 낮은 음) */
export function stringLines(H: number, topY: number, gapY: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => (topY + gapY * i) * H);
}

export class StrumDetector {
  private prev: { x: number; y: number; t: number } | null = null;
  private lostAt: number | null = null;
  private lastStrike: number[] = [];
  private armed: boolean[] = []; // 줄별 장전 상태

  constructor(private readonly o: StrumOptions) {}

  update(p: Point | null, now: number, lines: readonly number[], band: StrumBand, H: number): StrumEvent[] {
    if (!p) {
      if (this.prev && this.lostAt === null) this.lostAt = now; // 공백 시작
      return [];
    }
    if (this.lostAt !== null) {
      if (now - this.lostAt > this.o.graceMs) this.prev = null; // 긴 공백 → 새 손
      this.lostAt = null;
    }
    const prev = this.prev;
    this.prev = { x: p.x, y: p.y, t: now };
    const D = this.o.rearmDistRatio * H;
    if (!prev || now <= prev.t) {
      // 첫 프레임: 줄에서 충분히 떨어진 줄만 장전(줄 바로 위에서 나타나면 떨어질 때까지 대기)
      this.armed = lines.map((ly) => Math.abs(p.y - ly) >= D);
      return [];
    }
    if (Math.hypot(p.x - prev.x, p.y - prev.y) > this.o.maxJumpRatio * H) return []; // 순간이동(라벨 뒤바뀜 등)
    const dt = (now - prev.t) / 1000;
    const speed = Math.abs(p.y - prev.y) / H / dt;
    const out: StrumEvent[] = [];
    for (let i = 0; i < lines.length; i++) {
      const ly = lines[i] ?? 0;
      const a = prev.y - ly;
      const b = p.y - ly;
      const crossed = a !== 0 && ((a < 0 && b >= 0) || (a > 0 && b <= 0));
      if (crossed && (this.armed[i] ?? true) && speed >= this.o.minSpeed) {
        const f = a / (a - b); // 선분 위 교차 비율 0~1
        const x = prev.x + (p.x - prev.x) * f;
        const t = prev.t + (now - prev.t) * f;
        if (x >= band.x0 && x <= band.x1 && t - (this.lastStrike[i] ?? -Infinity) >= this.o.refractoryMs) {
          this.lastStrike[i] = t;
          out.push({ string: i, dir: p.y > prev.y ? "down" : "up", tMs: t, speed });
          this.armed[i] = Math.abs(b) >= D; // 지나간 뒤 충분히 멀면 바로 재장전
          continue;
        }
      }
      if (!(this.armed[i] ?? true) && Math.abs(b) >= D) this.armed[i] = true; // 줄에서 멀어지면 재장전
    }
    out.sort((e1, e2) => e1.tMs - e2.tMs);
    return out;
  }

  reset(): void {
    this.prev = null;
    this.lostAt = null;
    this.lastStrike = [];
    this.armed = [];
  }
}

/** 속도(영상 높이/초) → 세기 0~1. soft 이하는 minVelocity, hard 이상은 1, 사이는 선형 */
export function velocityFromSpeed(speed: number, soft: number, hard: number, minVelocity: number): number {
  if (!Number.isFinite(speed)) return minVelocity;
  const t = Math.min(1, Math.max(0, (speed - soft) / (hard - soft)));
  return minVelocity + (1 - minVelocity) * t;
}
