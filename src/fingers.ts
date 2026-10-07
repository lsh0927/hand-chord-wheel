// 손가락 개수 모드의 순수 함수. 브라우저 API 없음.
import { CONFIG } from "./config";
import { distance, Hysteresis, type Landmarks, type Point } from "./mapping";

export interface FingerStates {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}
export type FingerRatios = { [K in keyof FingerStates]: number };

function at(lm: Landmarks, i: number): Point {
  const p = lm[i];
  if (!p) throw new Error(`landmark ${i} 없음 (길이 ${lm.length})`);
  return p;
}

/**
 * 손가락별 '펴짐 비율'. 네 손가락은 끝-손목 거리 ÷ PIP-손목 거리(평면 회전·크기 불변).
 * 엄지는 끝-소지뿌리 ÷ IP-소지뿌리(접으면 끝이 손바닥 안쪽, 소지 쪽으로 들어와 작아진다).
 * 반드시 픽셀(등방) 좌표로 호출한다.
 */
export function fingerRatios(lm: Landmarks): FingerRatios {
  const wrist = at(lm, 0);
  const ratio = (pip: number, tip: number): number => {
    const base = distance(at(lm, pip), wrist);
    return base > 0 ? distance(at(lm, tip), wrist) / base : 0;
  };
  const pinkyMcp = at(lm, 17);
  const thumbBase = distance(at(lm, 3), pinkyMcp);
  const thumb = thumbBase > 0 ? distance(at(lm, 4), pinkyMcp) / thumbBase : 0;
  return { thumb, index: ratio(6, 8), middle: ratio(10, 12), ring: ratio(14, 16), pinky: ratio(18, 20) };
}

/** 즉시 판정(히스테리시스 없음). 테스트·디버그용. 실제 연주는 FingerDetector를 쓴다. */
export function fingerStates(
  lm: Landmarks,
  extendRatio: number = CONFIG.fingers.extendRatio,
  thumbRatio: number = CONFIG.fingers.thumbRatio,
): FingerStates {
  const r = fingerRatios(lm);
  return {
    thumb: r.thumb > thumbRatio,
    index: r.index > extendRatio,
    middle: r.middle > extendRatio,
    ring: r.ring > extendRatio,
    pinky: r.pinky > extendRatio,
  };
}

/**
 * 손가락별 히스테리시스 판정. 비율이 enter 이상이면 펴짐으로 들어가고 exit 미만이어야 접힘으로 나온다.
 * 느슨히 늘어뜨린 손(≈1.2~1.27)이 경계에서 프레임마다 뒤집히는 것을 막는다.
 */
export class FingerDetector {
  private readonly h: { [K in keyof FingerStates]: Hysteresis };

  constructor(
    enter: number = CONFIG.fingers.enterRatio,
    exit: number = CONFIG.fingers.exitRatio,
    thumbEnter: number = CONFIG.fingers.thumbEnterRatio,
    thumbExit: number = CONFIG.fingers.thumbExitRatio,
  ) {
    this.h = {
      thumb: new Hysteresis(thumbEnter, thumbExit),
      index: new Hysteresis(enter, exit),
      middle: new Hysteresis(enter, exit),
      ring: new Hysteresis(enter, exit),
      pinky: new Hysteresis(enter, exit),
    };
  }

  update(lm: Landmarks): FingerStates {
    return this.updateRatios(fingerRatios(lm));
  }

  updateRatios(r: FingerRatios): FingerStates {
    return {
      thumb: this.h.thumb.update(r.thumb),
      index: this.h.index.update(r.index),
      middle: this.h.middle.update(r.middle),
      ring: this.h.ring.update(r.ring),
      pinky: this.h.pinky.update(r.pinky),
    };
  }

  reset(): void {
    for (const k of Object.keys(this.h) as Array<keyof FingerStates>) this.h[k].reset();
  }
}

/** 1=검지, 2=+중지, 3=+약지, 4=+소지, 5=+엄지. 엄지는 넷 다 펴졌을 때만 센다(엄지 오판이 1~3에 번지지 않게). */
export function fingerCount(s: FingerStates): number {
  const four = [s.index, s.middle, s.ring, s.pinky].filter(Boolean).length;
  return four === 4 && s.thumb ? 5 : four;
}

/** 디버그 표기: 펴진 손가락만 대문자. 예 "t I M r p" */
export function fingerFlags(s: FingerStates): string {
  const pairs: Array<[boolean, string]> = [
    [s.thumb, "t"],
    [s.index, "i"],
    [s.middle, "m"],
    [s.ring, "r"],
    [s.pinky, "p"],
  ];
  return pairs.map(([on, ch]) => (on ? ch.toUpperCase() : ch)).join(" ");
}

/** 손 높이 → 0~100. bottomLine(85%)에서 0, topLine(25%)에서 100. 설정이 뒤집혀 있으면 0 */
export function heightPercent(
  y: number,
  height: number,
  topLine: number = CONFIG.fingers.heightTopLine,
  bottomLine: number = CONFIG.fingers.heightBottomLine,
): number {
  const span = height * (bottomLine - topLine);
  if (span <= 0) return 0;
  const t = (height * bottomLine - y) / span;
  return Math.min(1, Math.max(0, t)) * 100;
}

/** 값이 holdMs 동안 유지되어야 확정값이 바뀐다. 첫 값은 즉시 확정. */
export class StableValue {
  private candidate: number | null = null;
  private candidateSince = 0;
  private stable: number | null = null;
  constructor(private readonly holdMs: number) {}
  get value(): number | null {
    return this.stable;
  }
  update(v: number, nowMs: number): number | null {
    if (v !== this.candidate) {
      this.candidate = v;
      this.candidateSince = nowMs;
    }
    if (this.stable === null) this.stable = v;
    else if (v !== this.stable && nowMs - this.candidateSince >= this.holdMs) this.stable = v;
    return this.stable;
  }
  reset(): void {
    this.candidate = null;
    this.candidateSince = 0;
    this.stable = null;
  }
}
