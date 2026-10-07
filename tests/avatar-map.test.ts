import { describe, it, expect } from "vitest";
import { mapExpressions, headEulerFromMatrix, EXPRESSION_NAMES } from "../src/avatar-map";

const deg = (d: number): number => (d * Math.PI) / 180;
/** 열 우선 4×4 회전 행렬(Y축 yaw). 행 우선 R = [[c,0,s],[0,1,0],[-s,0,c]] */
function yawMatrix(theta: number): number[] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}
/** X축 pitch. 행 우선 R = [[1,0,0],[0,c,-s],[0,s,c]] */
function pitchMatrix(theta: number): number[] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}
/** Z축 roll. 행 우선 R = [[c,-s,0],[s,c,0],[0,0,1]] */
function rollMatrix(theta: number): number[] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const SIGN1 = { x: 1, y: 1, z: 1 };
const MAX = { pitch: 35, yaw: 35, roll: 25 };

describe("mapExpressions", () => {
  it("jawOpen → aa, 웃음 평균×1.2 클램프, 없는 이름은 0", () => {
    const w = mapExpressions({ jawOpen: 0.6, mouthSmileLeft: 0.9, mouthSmileRight: 0.9 }, false, 1.2);
    expect(w.aa).toBeCloseTo(0.6, 6);
    expect(w.happy).toBe(1);
    expect(w.oh).toBe(0);
    expect(w.blinkLeft).toBe(0);
  });
  it("거울이 아니면 eyeBlinkLeft → blinkLeft, 거울이면 blinkRight", () => {
    const bs = { eyeBlinkLeft: 1, eyeBlinkRight: 0 };
    expect(mapExpressions(bs, false, 1.2)).toMatchObject({ blinkLeft: 1, blinkRight: 0 });
    expect(mapExpressions(bs, true, 1.2)).toMatchObject({ blinkLeft: 0, blinkRight: 1 });
  });
  it("surprised = (browInnerUp + eyeWide 평균) / 2", () => {
    const w = mapExpressions({ browInnerUp: 0.8, eyeWideLeft: 0.4, eyeWideRight: 0.4 }, false, 1.2);
    expect(w.surprised).toBeCloseTo(0.6, 6);
  });
  it("범위 밖·NaN 입력은 0~1로", () => {
    const w = mapExpressions({ jawOpen: 1.7, mouthFunnel: -0.3, mouthPucker: Number.NaN }, false, 1.2);
    expect(w.aa).toBe(1);
    expect(w.oh).toBe(0);
    expect(w.ou).toBe(0);
  });
  it("출력 키는 EXPRESSION_NAMES와 같다", () => {
    expect(Object.keys(mapExpressions({}, false, 1.2)).sort()).toEqual([...EXPRESSION_NAMES].sort());
  });
});

describe("headEulerFromMatrix (YXZ, 라디안)", () => {
  it("단위 행렬 → 0", () => {
    const e = headEulerFromMatrix(IDENTITY, false, SIGN1, MAX);
    expect(e.pitch).toBeCloseTo(0, 9);
    expect(e.yaw).toBeCloseTo(0, 9);
    expect(e.roll).toBeCloseTo(0, 9);
  });
  it("Y축 20도 회전 → yaw 20도, 거울이면 −20도", () => {
    expect(headEulerFromMatrix(yawMatrix(deg(20)), false, SIGN1, MAX).yaw).toBeCloseTo(deg(20), 6);
    expect(headEulerFromMatrix(yawMatrix(deg(20)), true, SIGN1, MAX).yaw).toBeCloseTo(-deg(20), 6);
  });
  it("X축 15도 회전 → pitch 15도(거울 무관), 축 부호 −1이면 −15도", () => {
    expect(headEulerFromMatrix(pitchMatrix(deg(15)), false, SIGN1, MAX).pitch).toBeCloseTo(deg(15), 6);
    expect(headEulerFromMatrix(pitchMatrix(deg(15)), true, SIGN1, MAX).pitch).toBeCloseTo(deg(15), 6);
    expect(headEulerFromMatrix(pitchMatrix(deg(15)), false, { x: -1, y: 1, z: 1 }, MAX).pitch).toBeCloseTo(-deg(15), 6);
  });
  it("Z축 10도 회전 → roll 10도, 거울이면 −10도", () => {
    expect(headEulerFromMatrix(rollMatrix(deg(10)), false, SIGN1, MAX).roll).toBeCloseTo(deg(10), 6);
    expect(headEulerFromMatrix(rollMatrix(deg(10)), true, SIGN1, MAX).roll).toBeCloseTo(-deg(10), 6);
  });
  it("축 부호 y·z가 −1이면 yaw·roll이 각각 반전된다", () => {
    expect(headEulerFromMatrix(yawMatrix(deg(20)), false, { x: 1, y: -1, z: 1 }, MAX).yaw).toBeCloseTo(-deg(20), 6);
    expect(headEulerFromMatrix(rollMatrix(deg(10)), false, { x: 1, y: 1, z: -1 }, MAX).roll).toBeCloseTo(-deg(10), 6);
  });
  it("최대각 클램프: yaw 60도 → 35도", () => {
    expect(headEulerFromMatrix(yawMatrix(deg(60)), false, SIGN1, MAX).yaw).toBeCloseTo(deg(35), 6);
  });
  it("길이가 16이 아니거나 NaN이 섞이면 0 (Ema가 NaN으로 굳지 않게)", () => {
    expect(headEulerFromMatrix([1, 2, 3], false, SIGN1, MAX)).toEqual({ pitch: 0, yaw: 0, roll: 0 });
    const bad = [...IDENTITY];
    bad[10] = Number.NaN;
    expect(headEulerFromMatrix(bad, false, SIGN1, MAX)).toEqual({ pitch: 0, yaw: 0, roll: 0 });
  });
});
