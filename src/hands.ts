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

/**
 * handedness 라벨이 "Right"(swap이면 "Left")이고 점수가 충분하며 손바닥이 화면 안인 손을 고른다.
 * 후보가 여럿이면 직전 손바닥 위치에 가장 가까운 손, 직전 위치가 없으면 점수가 높은 손.
 */
export function selectRightHand(result: HandsLike, opts: SelectOptions): HandSelection {
  const wanted = opts.swap ? "Left" : "Right";
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
