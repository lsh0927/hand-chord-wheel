// 손 랜드마크 → 악기 파라미터. 브라우저 API를 쓰지 않는 순수 함수만 둔다.

export interface Point {
  x: number;
  y: number;
}
export type Landmarks = ReadonlyArray<{ readonly x: number; readonly y: number }>;

/** 손바닥 관절: 손목, 검지·중지·약지·소지 뿌리 */
export const PALM_IDS = [0, 5, 9, 13, 17] as const;
/** 손끝: 엄지·검지·중지·약지·소지 */
export const TIP_IDS = [4, 8, 12, 16, 20] as const;

function at(lm: Landmarks, i: number): Point {
  const p = lm[i];
  if (!p) throw new Error(`landmark ${i} 없음 (길이 ${lm.length})`);
  return p;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function palmCenter(lm: Landmarks): Point {
  let x = 0;
  let y = 0;
  for (const i of PALM_IDS) {
    const p = at(lm, i);
    x += p.x;
    y += p.y;
  }
  return { x: x / PALM_IDS.length, y: y / PALM_IDS.length };
}

/** 12시 방향 0도, 시계 방향으로 증가. 화면 좌표(y 아래가 양수) 기준. 반환 0 ≤ deg < 360 */
export function angleDeg(center: Point, p: Point): number {
  const deg = (Math.atan2(p.x - center.x, -(p.y - center.y)) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/** n칸 휠에서 0번 칸이 12시를 중심으로 ±(360/n/2)도를 차지한다. */
export function sectorFromAngle(deg: number, n: number): number {
  const span = 360 / n;
  const norm = (((deg + span / 2) % 360) + 360) % 360;
  return Math.floor(norm / span) % n;
}

/**
 * 데드존 히스테리시스. prev 칸의 범위를 양쪽으로 deadZoneDeg만큼 넓혀,
 * 그 안에 있으면 prev를 유지하고 벗어나야 새 칸으로 바꾼다. prev가 범위 밖(팔레트 축소)이면 새로 계산.
 */
export function nextSector(prev: number | null, deg: number, n: number, deadZoneDeg: number): number {
  const candidate = sectorFromAngle(deg, n);
  if (prev === null || prev >= n || candidate === prev) return candidate;
  const span = 360 / n;
  const delta = ((deg - prev * span + 540) % 360) - 180; // prev 중심 기준 -180..180
  return Math.abs(delta) < span / 2 + deadZoneDeg ? prev : candidate;
}

/**
 * 손끝 5개와 손바닥 중심 거리의 평균을 손목–중지뿌리 거리로 나눈 값. 카메라 거리와 무관.
 * 반드시 등방(픽셀) 좌표로 호출한다. MediaPipe 정규화 좌표(x는 가로폭 기준, y는 세로폭 기준)로 부르면
 * 손 회전에 따라 값이 달라진다.
 */
export function opennessRatio(lm: Landmarks): number {
  const palm = palmCenter(lm);
  const scale = distance(at(lm, 0), at(lm, 9));
  if (scale <= 0) return 0;
  let sum = 0;
  for (const i of TIP_IDS) sum += distance(at(lm, i), palm);
  return sum / TIP_IDS.length / scale;
}

/** ratio를 closed(0%)~open(100%) 사이로 선형 변환해 0~100으로 클램프 */
export function opennessPercent(ratio: number, closed: number, open: number): number {
  if (open <= closed) return 0;
  const t = (ratio - closed) / (open - closed);
  return Math.min(1, Math.max(0, t)) * 100;
}

export function isInRest(center: Point, p: Point, restRadius: number): boolean {
  return distance(center, p) < restRadius;
}

/** 지수 이동 평균. 첫 샘플로 초기화한다. */
export class Ema {
  private v: number | null = null;
  constructor(private readonly alpha: number) {}
  get value(): number | null {
    return this.v;
  }
  next(x: number): number {
    this.v = this.v === null ? x : this.alpha * x + (1 - this.alpha) * this.v;
    return this.v;
  }
  reset(): void {
    this.v = null;
  }
}

/** 손이 잠깐 사라져도 graceMs 동안은 "있음"으로 취급 */
export class HoldTracker {
  private lastSeen: number | null = null;
  constructor(private readonly graceMs: number) {}
  get lastSeenMs(): number | null {
    return this.lastSeen;
  }
  update(present: boolean, nowMs: number): boolean {
    if (present) {
      this.lastSeen = nowMs;
      return true;
    }
    return this.lastSeen !== null && nowMs - this.lastSeen <= this.graceMs;
  }
  reset(): void {
    this.lastSeen = null;
  }
}

/** 두 임계값 히스테리시스. value ≥ enter 이면 켜지고, value < exit 이면 꺼진다 (enter > exit). */
export class Hysteresis {
  private on = false;
  constructor(
    private readonly enter: number,
    private readonly exit: number,
  ) {}
  get active(): boolean {
    return this.on;
  }
  update(value: number): boolean {
    if (this.on) {
      if (value < this.exit) this.on = false;
    } else if (value >= this.enter) {
      this.on = true;
    }
    return this.on;
  }
  reset(initial = false): void {
    this.on = initial;
  }
}
