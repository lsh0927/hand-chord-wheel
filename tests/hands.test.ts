import { describe, it, expect } from "vitest";
import { selectRightHand } from "../src/hands";

/** 21개 랜드마크를 모두 (x, 0.5)에 둔 가짜 손. visibility는 MediaPipe 타입과 맞추기 위해 둔다. */
const lm = (x: number) => Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0, visibility: 1 }));
const cat = (name: "Left" | "Right", score: number) => [{ categoryName: name, score, index: 0, displayName: "" }];
const OPTS = { swap: false, minScore: 0.7, prevPalm: null };

describe("selectRightHand", () => {
  it("두 손 중 Right 라벨 손을 고르고, 나머지는 otherPalms에", () => {
    const r = selectRightHand({ landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Left", 0.94), cat("Right", 0.96)] }, OPTS);
    expect(r.chosen?.score).toBe(0.96);
    expect(r.chosen?.palm.x).toBeCloseTo(0.8, 6);
    expect(r.otherPalms).toHaveLength(1);
    expect(r.labels).toEqual(["Left:0.94", "Right:0.96"]);
  });
  it("swap=true면 Left 라벨 손을 고른다", () => {
    const r = selectRightHand({ landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Left", 0.94), cat("Right", 0.96)] }, { ...OPTS, swap: true });
    expect(r.chosen?.palm.x).toBeCloseTo(0.2, 6);
  });
  it("Right가 없으면 chosen null, 라벨은 남는다", () => {
    const r = selectRightHand({ landmarks: [lm(0.2)], handedness: [cat("Left", 0.9)] }, OPTS);
    expect(r.chosen).toBeNull();
    expect(r.labels).toEqual(["Left:0.90"]);
  });
  it("손이 없으면 전부 비어 있다", () => {
    expect(selectRightHand({ landmarks: [], handedness: [] }, OPTS)).toEqual({ chosen: null, otherPalms: [], labels: [], rejectedWanted: 0 });
  });
  it("점수 0.7 미만은 무시하되 '원하는 손 탈락'으로 센다 (안내문 분기용)", () => {
    const r = selectRightHand({ landmarks: [lm(0.5)], handedness: [cat("Right", 0.55)] }, OPTS);
    expect(r.chosen).toBeNull();
    expect(r.rejectedWanted).toBe(1);
    expect(r.otherPalms).toHaveLength(1);
  });
  it("왼손만 보이면 rejectedWanted는 0 (다른 손 안내)", () => {
    const r = selectRightHand({ landmarks: [lm(0.5)], handedness: [cat("Left", 0.95)] }, OPTS);
    expect(r.rejectedWanted).toBe(0);
  });
  it("랜드마크가 21개 미만인 손은 라벨도 점도 남기지 않고 건너뛴다", () => {
    const short = Array.from({ length: 10 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
    const r = selectRightHand({ landmarks: [short], handedness: [cat("Right", 0.95)] }, OPTS);
    expect(r).toEqual({ chosen: null, otherPalms: [], labels: [], rejectedWanted: 0 });
  });
  it("손바닥 중심이 화면 밖(y<0)이면 무시", () => {
    const up = Array.from({ length: 21 }, () => ({ x: 0.5, y: -0.2, z: 0, visibility: 1 }));
    const r = selectRightHand({ landmarks: [up], handedness: [cat("Right", 0.95)] }, OPTS);
    expect(r.chosen).toBeNull();
    expect(r.rejectedWanted).toBe(1);
  });
  it("손바닥 중심이 화면 밖(x>1)이면 무시", () => {
    const r = selectRightHand({ landmarks: [lm(1.2)], handedness: [cat("Right", 0.95)] }, OPTS);
    expect(r.chosen).toBeNull();
  });
  it("오른손이 둘이면 직전 위치에 가까운 손", () => {
    const r = selectRightHand(
      { landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Right", 0.9), cat("Right", 0.99)] },
      { ...OPTS, prevPalm: { x: 0.25, y: 0.5 } },
    );
    expect(r.chosen?.palm.x).toBeCloseTo(0.2, 6);
    expect(r.otherPalms).toHaveLength(1);
  });
  it("오른손이 둘이고 직전 위치가 없으면 점수 높은 손", () => {
    const r = selectRightHand({ landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Right", 0.9), cat("Right", 0.99)] }, OPTS);
    expect(r.chosen?.palm.x).toBeCloseTo(0.8, 6);
  });
});
