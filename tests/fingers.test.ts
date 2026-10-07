import { describe, it, expect } from "vitest";
import { fingerRatios, fingerStates, fingerCount, fingerFlags, heightPercent, StableValue, FingerDetector } from "../src/fingers";
import type { Landmarks } from "../src/mapping";

/**
 * 합성 오른손(픽셀, 거울 화면 기준). 손목(640,648), 네 손가락 뿌리 y=504.
 * 펴진 손가락: PIP y-40, DIP y-75, 끝 y-110. 접은 손가락: PIP y-40, DIP y-20, 끝 y+15(손바닥 쪽으로 돌아옴).
 * 엄지: CMC(590,610) MCP(560,575) IP(535,548), 펴짐 끝(470,495) — 비율 ≈1.33, 접힘 끝(585,548 — 소지 쪽으로) — ≈0.74.
 */
function hand(f: { thumb?: boolean; index?: boolean; middle?: boolean; ring?: boolean; pinky?: boolean }, rotateDeg = 0): Landmarks {
  const lm: { x: number; y: number }[] = Array.from({ length: 21 }, () => ({ x: 640, y: 560 }));
  lm[0] = { x: 640, y: 648 };
  lm[1] = { x: 590, y: 610 };
  lm[2] = { x: 560, y: 575 };
  lm[3] = { x: 535, y: 548 };
  lm[4] = f.thumb ? { x: 470, y: 495 } : { x: 585, y: 548 };
  const fingers: Array<[keyof typeof f, number, number]> = [
    ["index", 592, 5],
    ["middle", 632, 9],
    ["ring", 672, 13],
    ["pinky", 712, 17],
  ];
  for (const [name, x, mcp] of fingers) {
    const ext = !!f[name];
    lm[mcp] = { x, y: 504 };
    lm[mcp + 1] = { x, y: 464 };
    lm[mcp + 2] = { x, y: ext ? 429 : 484 };
    lm[mcp + 3] = { x, y: ext ? 394 : 519 };
  }
  if (rotateDeg === 0) return lm;
  const c = lm[0]!;
  const rad = (rotateDeg * Math.PI) / 180;
  return lm.map((p) => ({
    x: c.x + (p.x - c.x) * Math.cos(rad) - (p.y - c.y) * Math.sin(rad),
    y: c.y + (p.x - c.x) * Math.sin(rad) + (p.y - c.y) * Math.cos(rad),
  }));
}
const ALL = { thumb: true, index: true, middle: true, ring: true, pinky: true };
const NONE = { thumb: false, index: false, middle: false, ring: false, pinky: false };

describe("fingerRatios: 합성 손의 비율이 임계와 충분히 떨어져 있다", () => {
  it("펴진 손가락 1.33~1.38, 접힌 손가락 0.70~0.75, 엄지 펴짐 ≈1.33 / 접힘 ≈0.74", () => {
    const open = fingerRatios(hand(ALL));
    const fist = fingerRatios(hand({}));
    for (const k of ["index", "middle", "ring", "pinky"] as const) {
      expect(open[k]).toBeGreaterThan(1.3);
      expect(fist[k]).toBeLessThan(0.76);
    }
    expect(open.thumb).toBeGreaterThan(1.3);
    expect(fist.thumb).toBeLessThan(0.76);
  });
  it("랜드마크가 21개 미만이면 예외", () => {
    const short = Array.from({ length: 10 }, () => ({ x: 640, y: 560 }));
    expect(() => fingerRatios(short)).toThrow(/landmark/);
  });
});

describe("fingerStates(즉시 판정): 손가락별 펴짐", () => {
  it("활짝 편 손은 다섯 다 true, 주먹은 다 false", () => {
    expect(fingerStates(hand(ALL))).toEqual(ALL);
    expect(fingerStates(hand({}))).toEqual(NONE);
  });
  it("검지만", () => expect(fingerStates(hand({ index: true }))).toMatchObject({ index: true, middle: false, ring: false, pinky: false }));
  it("손을 90도·180도 돌려도 같다(손목 거리 비교는 회전 불변 — 등거리 변환이라 수학적으로 자명)", () => {
    const a = fingerStates(hand({ index: true, middle: true, thumb: true }));
    expect(fingerStates(hand({ index: true, middle: true, thumb: true }, 90))).toEqual(a);
    expect(fingerStates(hand({}, 180))).toEqual(fingerStates(hand({})));
  });
});

describe("FingerDetector: 히스테리시스 진입 1.20 / 해제 1.10, 엄지 1.18 / 1.05", () => {
  it("합성 손으로도 즉시 판정과 같은 결과", () => {
    const d = new FingerDetector();
    expect(d.update(hand(ALL))).toEqual(ALL);
    expect(d.update(hand({}))).toEqual(NONE);
  });
  it("검지 비율 1.25 → 펴짐, 1.15 → 유지, 1.05 → 접힘, 1.15 → 유지(접힘)", () => {
    const d = new FingerDetector();
    const r = (index: number) => ({ thumb: 0.7, index, middle: 0.7, ring: 0.7, pinky: 0.7 });
    expect(d.updateRatios(r(1.25)).index).toBe(true);
    expect(d.updateRatios(r(1.15)).index).toBe(true);
    expect(d.updateRatios(r(1.05)).index).toBe(false);
    expect(d.updateRatios(r(1.15)).index).toBe(false);
  });
  it("엄지: 검지 옆에 곧게 붙인 1.107은 진입하지 못하고, 벌린 1.24는 1.05까지 유지", () => {
    const d = new FingerDetector();
    const r = (thumb: number) => ({ thumb, index: 1.35, middle: 1.35, ring: 1.35, pinky: 1.35 });
    expect(d.updateRatios(r(1.107)).thumb).toBe(false);
    expect(d.updateRatios(r(1.24)).thumb).toBe(true);
    expect(d.updateRatios(r(1.1)).thumb).toBe(true);
    expect(d.updateRatios(r(1.04)).thumb).toBe(false);
  });
  it("reset 뒤에는 접힘에서 다시 시작", () => {
    const d = new FingerDetector();
    d.update(hand(ALL));
    d.reset();
    const r = { thumb: 1.15, index: 1.15, middle: 1.15, ring: 1.15, pinky: 1.15 }; // 진입 미만
    expect(d.updateRatios(r)).toEqual(NONE);
  });
});

describe("fingerCount: 1~5, 엄지는 넷 다 펴졌을 때만", () => {
  it.each([
    [{}, 0],
    [{ index: true }, 1],
    [{ index: true, middle: true }, 2],
    [{ index: true, middle: true, ring: true }, 3],
    [{ index: true, middle: true, ring: true, pinky: true }, 4],
    [ALL, 5],
  ] as Array<[Record<string, boolean>, number]>)("%j → %s", (f, n) => expect(fingerCount(fingerStates(hand(f)))).toBe(n));
  it("검지 하나에 엄지가 벌어져 있어도 1 (엄지 무시)", () => expect(fingerCount(fingerStates(hand({ index: true, thumb: true })))).toBe(1));
  it("엄지만 펴면 0 (쉼)", () => expect(fingerCount(fingerStates(hand({ thumb: true })))).toBe(0));
  it("검지+소지(록 사인)도 2 — 조합은 구분하지 않는다", () => expect(fingerCount(fingerStates(hand({ index: true, pinky: true })))).toBe(2));
});

describe("fingerFlags: 디버그 표기", () => {
  it("펴진 손가락만 대문자", () => {
    expect(fingerFlags(fingerStates(hand({ index: true, middle: true })))).toBe("t I M r p");
    expect(fingerFlags(fingerStates(hand(ALL)))).toBe("T I M R P");
  });
});

describe("heightPercent: 바닥 85%→0, 25%→100 (H=720)", () => {
  it.each([
    [612, 0],
    [180, 100],
    [396, 50],
    [700, 0],
    [50, 100],
  ])("y=%s → %s%%", (y, pct) => expect(heightPercent(y, 720)).toBeCloseTo(pct, 6));
  it("위 선이 아래 선보다 낮거나 같으면(설정 오류) 0", () => {
    expect(heightPercent(300, 720, 0.9, 0.85)).toBe(0);
    expect(heightPercent(300, 720, 0.5, 0.5)).toBe(0);
  });
});

describe("StableValue: 120 ms 유지해야 바뀜", () => {
  it("첫 값은 즉시, 변경은 후보 시작 뒤 120 ms (50에 시작 → 170)", () => {
    const s = new StableValue(120);
    expect(s.update(1, 0)).toBe(1);
    expect(s.update(2, 50)).toBe(1);
    expect(s.update(2, 100)).toBe(1);
    expect(s.update(2, 169)).toBe(1);
    expect(s.update(2, 170)).toBe(2);
  });
  it("스치는 값은 무시된다 (1 → 2 → 3 빠르게)", () => {
    const s = new StableValue(120);
    s.update(1, 0);
    s.update(2, 40);
    expect(s.update(3, 80)).toBe(1);
    expect(s.update(3, 150)).toBe(1); // 3은 80부터 70 ms
    expect(s.update(3, 200)).toBe(3); // 120 ms 채움
  });
  it("되돌아가면 타이머가 다시 시작된다", () => {
    const s = new StableValue(120);
    s.update(1, 0);
    s.update(2, 100);
    expect(s.update(1, 150)).toBe(1);
    expect(s.update(2, 200)).toBe(1); // 2는 200부터 다시
    expect(s.update(2, 319)).toBe(1);
    expect(s.update(2, 320)).toBe(2);
  });
  it("reset 뒤 첫 값 즉시", () => {
    const s = new StableValue(120);
    s.update(4, 0);
    s.reset();
    expect(s.value).toBeNull();
    expect(s.update(2, 1000)).toBe(2);
  });
  it("update가 120 ms 넘게 멈췄다 돌아오면(손 소실·판정 보류) 공백은 유지 시간에 넣지 않는다", () => {
    const s = new StableValue(120);
    s.update(1, 0);
    s.update(3, 100); // 후보 3 시작
    expect(s.update(3, 500)).toBe(1); // 400 ms 공백 → 후보 타이머 재시작(확정 1 유지)
    expect(s.update(3, 619)).toBe(1);
    expect(s.update(3, 620)).toBe(3);
  });
  it("공백이 120 ms 이하면 그대로 이어서 센다", () => {
    const s = new StableValue(120);
    s.update(1, 0);
    s.update(3, 100);
    expect(s.update(3, 200)).toBe(1); // 100 ms 공백, 후보 유지 100 ms
    expect(s.update(3, 220)).toBe(3);
  });
});
