import { describe, it, expect } from "vitest";
import {
  angleDeg,
  sectorFromAngle,
  nextSector,
  palmCenter,
  distance,
  opennessRatio,
  opennessPercent,
  isInRest,
  Ema,
  HoldTracker,
  Hysteresis,
  type Landmarks,
} from "../src/mapping";

const C = { x: 640, y: 360 }; // 1280x720 중심

describe("angleDeg: 12시=0도, 시계 방향", () => {
  it("12시 방향은 0도", () => expect(angleDeg(C, { x: 640, y: 100 })).toBeCloseTo(0, 5));
  it("3시 방향은 90도", () => expect(angleDeg(C, { x: 900, y: 360 })).toBeCloseTo(90, 5));
  it("6시 방향은 180도", () => expect(angleDeg(C, { x: 640, y: 700 })).toBeCloseTo(180, 5));
  it("9시 방향은 270도", () => expect(angleDeg(C, { x: 100, y: 360 })).toBeCloseTo(270, 5));
  it("설계 예시 (790,150)은 약 35.5도", () => expect(angleDeg(C, { x: 790, y: 150 })).toBeCloseTo(35.54, 1));
});

describe("sectorFromAngle: 0번 칸이 12시 ±15도", () => {
  it.each([
    [0, 0],
    [14.9, 0],
    [15.1, 1],
    [35.5, 1],
    [180, 6],
    [359.9, 0],
    [-10, 0],
  ])("%s도 → %s번 칸 (12칸)", (deg, sector) => expect(sectorFromAngle(deg, 12)).toBe(sector));
  it("8칸이면 45도 간격: 45도 → 1번", () => expect(sectorFromAngle(45, 8)).toBe(1));
});

describe("nextSector: 경계 ±3도 데드존", () => {
  it("이전 칸 없으면 그대로 계산", () => expect(nextSector(null, 44.5, 12, 3)).toBe(1));
  it("1번 칸에서 44.5도는 유지", () => expect(nextSector(1, 44.5, 12, 3)).toBe(1));
  it("1번 칸에서 47.9도도 유지", () => expect(nextSector(1, 47.9, 12, 3)).toBe(1));
  it("1번 칸에서 48도는 2번으로 전환", () => expect(nextSector(1, 48, 12, 3)).toBe(2));
  it("0번 칸에서 343도(반시계 쪽 경계)는 유지", () => expect(nextSector(0, 343, 12, 3)).toBe(0));
  it("0번 칸에서 341도는 11번으로 전환", () => expect(nextSector(0, 341, 12, 3)).toBe(11));
  it("팔레트가 줄어 이전 칸 번호가 범위를 벗어나면 새로 계산", () => expect(nextSector(11, 10, 6, 3)).toBe(0));
});

/** 합성 손(픽셀 좌표): 손목(640,648), 손바닥 뿌리 4개 y=504, 손끝 5개는 뿌리에서 tipDist만큼 위 */
function syntheticHand(tipDist: number, scale = 1): Landmarks {
  const lm: { x: number; y: number }[] = Array.from({ length: 21 }, () => ({ x: 640, y: 576 }));
  lm[0] = { x: 640, y: 648 };
  const mcpX = [512, 602, 678, 768];
  [5, 9, 13, 17].forEach((id, i) => (lm[id] = { x: mcpX[i]!, y: 504 }));
  [4, 8, 12, 16, 20].forEach((id, i) => (lm[id] = { x: 486 + i * 77, y: 504 - tipDist }));
  return lm.map((p) => ({ x: p.x * scale, y: p.y * scale }));
}

describe("palmCenter / distance", () => {
  it("합성 손의 손바닥 중심은 (640, 532.8)", () => {
    const c = palmCenter(syntheticHand(200));
    expect(c.x).toBeCloseTo(640, 6);
    expect(c.y).toBeCloseTo(532.8, 6);
  });
  it("distance는 유클리드 거리", () => expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5));
});

describe("opennessRatio: 손 크기로 정규화한 손끝 거리", () => {
  it("편 손은 OPEN 기준(1.7) 위, 주먹은 CLOSED 기준(0.8) 아래 (합성 손: 편 손 ≈2.0, 주먹 ≈0.68)", () => {
    const open = opennessRatio(syntheticHand(250));
    const fist = opennessRatio(syntheticHand(0));
    expect(open).toBeGreaterThan(1.7);
    expect(fist).toBeLessThan(0.8);
    expect(open).toBeGreaterThan(fist * 2);
  });
  it("카메라 거리가 2배(좌표 ×0.5)여도 같은 값", () => {
    expect(opennessRatio(syntheticHand(250, 0.5))).toBeCloseTo(opennessRatio(syntheticHand(250)), 10);
  });
  it("손목과 중지 뿌리가 겹치면(크기 0) 0", () => {
    const lm = syntheticHand(200).map((p) => ({ ...p }));
    lm[9] = { ...lm[0]! };
    expect(opennessRatio(lm)).toBe(0);
  });
});

describe("opennessPercent: CLOSED=0.8 → 0%, OPEN=1.7 → 100%", () => {
  it("1.5 → 약 77.8%", () => expect(opennessPercent(1.5, 0.8, 1.7)).toBeCloseTo(77.78, 1));
  it("0.5 → 0% (하한)", () => expect(opennessPercent(0.5, 0.8, 1.7)).toBe(0));
  it("2.0 → 100% (상한)", () => expect(opennessPercent(2.0, 0.8, 1.7)).toBe(100));
  it("open ≤ closed 잘못된 설정이면 0", () => expect(opennessPercent(1.0, 1.7, 0.8)).toBe(0));
});

describe("isInRest", () => {
  it("중심에서 28px은 반지름 50 안", () => expect(isInRest(C, { x: 660, y: 380 }, 50)).toBe(true));
  it("중심에서 60px은 밖", () => expect(isInRest(C, { x: 700, y: 360 }, 50)).toBe(false));
});

describe("Ema: 지수 이동 평균 α=0.5", () => {
  it("첫 값으로 초기화, 이후 절반씩 수렴", () => {
    const e = new Ema(0.5);
    expect(e.next(0)).toBe(0);
    [10, 10, 10, 10].forEach((v) => e.next(v));
    expect(e.value).toBeCloseTo(9.375, 6);
  });
  it("reset 후 첫 값으로 다시 초기화", () => {
    const e = new Ema(0.5);
    e.next(100);
    e.reset();
    expect(e.next(7)).toBe(7);
  });
});

describe("HoldTracker: 손 소실 500ms 유예", () => {
  it("400ms 소실은 유지, 600ms는 해제", () => {
    const h = new HoldTracker(500);
    expect(h.update(true, 0)).toBe(true);
    expect(h.update(false, 400)).toBe(true);
    expect(h.update(false, 600)).toBe(false);
  });
  it("한 번도 본 적 없으면 false, lastSeenMs는 null", () => {
    const h = new HoldTracker(500);
    expect(h.update(false, 100)).toBe(false);
    expect(h.lastSeenMs).toBeNull();
  });
  it("lastSeenMs는 마지막으로 본 시각", () => {
    const h = new HoldTracker(500);
    h.update(true, 120);
    h.update(false, 300);
    expect(h.lastSeenMs).toBe(120);
  });
  it("reset 후에는 유예 없음", () => {
    const h = new HoldTracker(500);
    h.update(true, 0);
    h.reset();
    expect(h.update(false, 100)).toBe(false);
  });
});

describe("Hysteresis: 켜짐 enter 이상, 꺼짐 exit 미만", () => {
  it("소리: 20% 이상에서 켜지고 15% 미만에서 꺼진다", () => {
    const s = new Hysteresis(20, 15);
    expect(s.update(14)).toBe(false);
    expect(s.update(17)).toBe(false); // 아직 enter(20) 미만
    expect(s.update(21)).toBe(true);
    expect(s.update(17)).toBe(true); // exit(15) 이상이라 유지
    expect(s.update(14.9)).toBe(false);
  });
  it("쉼 원판 밖 판정: 65.5px 이상에서 '밖', 50.4px 미만에서 '안'", () => {
    const outside = new Hysteresis(65.5, 50.4);
    expect(outside.update(60)).toBe(false); // 처음엔 안
    expect(outside.update(70)).toBe(true);
    expect(outside.update(55)).toBe(true); // 애매 구간은 유지
    expect(outside.update(50)).toBe(false);
  });
  it("reset(초기값)", () => {
    const s = new Hysteresis(20, 15);
    s.update(30);
    s.reset();
    expect(s.active).toBe(false);
  });
});
