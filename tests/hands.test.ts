import { describe, it, expect } from "vitest";
import { selectBothHands, selectRightHand } from "../src/hands";

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

describe("selectBothHands", () => {
  const two = { landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Left", 0.94), cat("Right", 0.96)] };
  const O = { swap: false, minScore: 0.7, prevRight: null, prevLeft: null };
  it("오른손과 왼손을 각각 고르고, 고른 왼손은 회색 점 목록에 없다", () => {
    const r = selectBothHands(two, O);
    expect(r.right.chosen?.palm.x).toBeCloseTo(0.8, 6);
    expect(r.left?.palm.x).toBeCloseTo(0.2, 6);
    expect(r.right.otherPalms).toEqual([]);
  });
  it("swap이면 라벨이 반대로 배정된다", () => {
    const r = selectBothHands(two, { ...O, swap: true });
    expect(r.right.chosen?.palm.x).toBeCloseTo(0.2, 6);
    expect(r.left?.palm.x).toBeCloseTo(0.8, 6);
  });
  it("왼손 점수가 낮으면 왼손은 null이고 회색 점으로 남는다", () => {
    const r = selectBothHands({ landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Left", 0.5), cat("Right", 0.96)] }, O);
    expect(r.left).toBeNull();
    expect(r.right.otherPalms.length).toBe(1);
  });
  it("라벨이 뒤바뀐 프레임은 직전 위치로 되돌린다(두 손이 서로 상대의 직전 자리에 더 가까우면 맞바꿈)", () => {
    const flipped = { landmarks: [lm(0.2), lm(0.8)], handedness: [cat("Right", 0.9), cat("Left", 0.9)] }; // 0.2가 Right로 읽힘
    const r = selectBothHands(flipped, { ...O, prevRight: { x: 0.8, y: 0.5 }, prevLeft: { x: 0.2, y: 0.5 } });
    expect(r.right.chosen?.palm.x).toBeCloseTo(0.8, 6);
    expect(r.left?.palm.x).toBeCloseTo(0.2, 6);
    expect(r.right.otherPalms).toEqual([]);
  });
  it("한 손이 두 라벨로 중복 검출되면(같은 자리) 왼손은 보류한다", () => {
    const dup = { landmarks: [lm(0.8), lm(0.81)], handedness: [cat("Right", 0.9), cat("Left", 0.8)] };
    const r = selectBothHands(dup, O);
    expect(r.right.chosen).not.toBeNull();
    expect(r.left).toBeNull();
  });
});
