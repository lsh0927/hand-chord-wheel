import { distance, palmCenter, type Point } from "./mapping";

export interface LandmarkLike {
  readonly x: number;
  readonly y: number;
}
/** MediaPipe HandLandmarkerResult의 구조적 최소 타입 */
export interface HandsLike {
  landmarks: ReadonlyArray<ReadonlyArray<LandmarkLike>>;
  handedness: ReadonlyArray<ReadonlyArray<{ categoryName: string; score: number }>>;
}
export interface ChosenHand {
  landmarks: ReadonlyArray<LandmarkLike>;
  score: number;
  /** 정규화 좌표(0~1) 손바닥 중심 */
  palm: Point;
}
export interface HandSelection {
  chosen: ChosenHand | null;
  /** 선택되지 않은 손들의 손바닥 중심(정규화) — 화면에 회색 점으로 표시 */
  otherPalms: Point[];
  /** 디버그/안내용 라벨 "Right:0.96" */
  labels: string[];
  /** 라벨은 맞지만 점수 미달·화면 밖이라 탈락한 '원하는 손'의 수 — 안내문 분기용 */
  rejectedWanted: number;
}
export interface SelectOptions {
  swap: boolean;
  minScore: number;
  prevPalm: Point | null;
}

export const EMPTY_SELECTION: HandSelection = { chosen: null, otherPalms: [], labels: [], rejectedWanted: 0 };

export interface BothHands {
  right: HandSelection;
  /** 스트럼용 왼손(라벨 반대쪽). 없으면 null */
  left: ChosenHand | null;
}
export interface BothOptions {
  swap: boolean;
  minScore: number;
  prevRight: Point | null;
  prevLeft: Point | null;
}
const DUP_DIST = 0.03; // 두 라벨이 같은 손을 가리킨다고 볼 손바닥 거리(정규화)

/**
 * handedness 라벨이 wanted("Right"/"Left")이고 점수가 충분하며 손바닥이 화면 안인 손을 고른다.
 * 후보가 여럿이면 직전 손바닥 위치에 가장 가까운 손, 직전 위치가 없으면 점수가 높은 손.
 */
export function selectHand(result: HandsLike, wanted: "Right" | "Left", opts: { minScore: number; prevPalm: Point | null }): HandSelection {
  const labels: string[] = [];
  const candidates: ChosenHand[] = [];
  const otherPalms: Point[] = [];
  let rejectedWanted = 0;

  for (let i = 0; i < result.handedness.length; i++) {
    const cat = result.handedness[i]?.[0];
    const lm = result.landmarks[i];
    if (!cat || !lm || lm.length < 21) continue;
    labels.push(`${cat.categoryName}:${cat.score.toFixed(2)}`);
    const palm = palmCenter(lm);
    const inside = palm.x >= 0 && palm.x <= 1 && palm.y >= 0 && palm.y <= 1;
    if (cat.categoryName === wanted && cat.score >= opts.minScore && inside) {
      candidates.push({ landmarks: lm, score: cat.score, palm });
    } else {
      if (cat.categoryName === wanted) rejectedWanted++;
      otherPalms.push(palm);
    }
  }

  const first = candidates[0];
  if (!first) return { chosen: null, otherPalms, labels, rejectedWanted };
  let chosen = first;
  if (candidates.length > 1) {
    const prev = opts.prevPalm;
    chosen = prev
      ? candidates.reduce((a, b) => (distance(b.palm, prev) < distance(a.palm, prev) ? b : a))
      : candidates.reduce((a, b) => (b.score > a.score ? b : a));
    for (const c of candidates) if (c !== chosen) otherPalms.push(c.palm);
  }
  return { chosen, otherPalms, labels, rejectedWanted };
}

/** 오른손 호환 래퍼: 라벨 "Right"(swap이면 "Left") */
export function selectRightHand(result: HandsLike, opts: SelectOptions): HandSelection {
  return selectHand(result, opts.swap ? "Left" : "Right", { minScore: opts.minScore, prevPalm: opts.prevPalm });
}

/**
 * 오른손(코드)과 왼손(스트럼)을 한 번에. 라벨이 한 프레임 뒤바뀌면(두 손이 서로 상대의 직전 자리에 더 가까움) 맞바꾸고,
 * 한 손이 두 라벨로 중복 검출되면 왼손을 보류한다. 고른 왼손은 회색 점에서 뺀다.
 */
export function selectBothHands(result: HandsLike, opts: BothOptions): BothHands {
  let right = selectHand(result, opts.swap ? "Left" : "Right", { minScore: opts.minScore, prevPalm: opts.prevRight });
  let left = selectHand(result, opts.swap ? "Right" : "Left", { minScore: opts.minScore, prevPalm: opts.prevLeft }).chosen;
  const r = right.chosen;
  if (r && left && opts.prevRight && opts.prevLeft) {
    const crossed = distance(r.palm, opts.prevLeft) < distance(r.palm, opts.prevRight) && distance(left.palm, opts.prevRight) < distance(left.palm, opts.prevLeft);
    if (crossed) {
      const l = left;
      right = { ...right, chosen: l, otherPalms: [...right.otherPalms.filter((p) => p.x !== l.palm.x || p.y !== l.palm.y), r.palm] };
      left = r;
    }
  }
  if (left && right.chosen && distance(left.palm, right.chosen.palm) < DUP_DIST) left = null; // 같은 손 중복 검출
  const chosenLeft = left;
  const otherPalms = chosenLeft ? right.otherPalms.filter((p) => p.x !== chosenLeft.palm.x || p.y !== chosenLeft.palm.y) : right.otherPalms;
  return { right: { ...right, otherPalms }, left: chosenLeft };
}
